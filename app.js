const TEXT = {
  ar: {
    title: "حي النزهة — المواقف بأجر",
    subtitle: "المواقف المحجوزة باللون الأحمر. اضغط على الموقف لمعرفة الحاجز.",
    legend: "موقف بأجر",
    count: n => `(${n.toLocaleString("ar-EG")})`,
    bookedBy: "محجوز لـ",
    term: "حجز طويل الأجل بموجب اتفاق",
    locate: "موقعي",
    here: "أنت هنا",
    whole: "الحي كاملاً",
    credit: "بيانات الخريطة",
    switchTo: "English",
  },
  en: {
    title: "El Nozha — Paid Parking",
    subtitle: "Paid slots are shown in red. Tap a slot to see who booked it.",
    legend: "Paid slot",
    count: n => `(${n})`,
    bookedBy: "Booked by",
    term: "Long-term agreement",
    locate: "My location",
    here: "You are here",
    whole: "Whole district",
    credit: "Map data",
    switchTo: "العربية",
  },
};

let lang = (() => {
  try { const saved = localStorage.getItem("lang"); if (saved) return saved; } catch (e) {}
  return (navigator.language || "ar").startsWith("en") ? "en" : "ar";
})();

const base = Nozha.createMap("map");
const map = base.map;
let slotLayer, here, slotCount = 0;

Promise.all([base.ready, Nozha.loadSlots()]).then(([, slots]) => {
  slotCount = slots.features.length;
  slotLayer = L.geoJSON(slots, {
    style: () => Nozha.slotStyle(map),
    onEachFeature: (f, layer) => {
      layer.bindPopup(() => popupHtml(f.properties), { maxWidth: 260 });
      layer.on("popupopen", () => layer.setStyle({ color: "#1d2733", weight: Nozha.slotStyle(map).weight + 2 }));
      layer.on("popupclose", () => layer.setStyle(Nozha.slotStyle(map)));
    },
  }).addTo(map);
  map.on("zoomend", () => slotLayer.setStyle(Nozha.slotStyle(map)));
  if (!showSignLocation()) map.fitBounds(base.district, { animate: false });
  applyLanguage();
});

// Each street sign's QR code carries the sign's position: ?lat=30.1003&lng=31.3432
function showSignLocation() {
  const q = new URLSearchParams(location.search);
  const lat = parseFloat(q.get("lat")), lng = parseFloat(q.get("lng"));
  if (!isFinite(lat) || !isFinite(lng) || !base.district.contains([lat, lng])) return false;
  map.setView([lat, lng], 18, { animate: false });
  here = L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 })
    .bindTooltip("", { permanent: true, direction: "top", offset: [0, -10], className: "here" })
    .addTo(map);
  return true;
}

const esc = s => String(s || "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function popupHtml(p) {
  const t = TEXT[lang];
  const ar = lang === "ar";
  return `<div class="pop" dir="${ar ? "rtl" : "ltr"}">
    <span class="id">${esc(ar ? p.id_ar : p.id)}</span>
    <div class="street">${esc(ar ? p.street_ar : p.street_en)}</div>
    <div class="label">${t.bookedBy}</div>
    <div class="who">${esc(ar ? p.booked_ar : p.booked_en)}</div>
    <div class="term">${t.term}</div>
  </div>`;
}

function applyLanguage() {
  const t = TEXT[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t[el.dataset.i18n]; });
  document.querySelectorAll("[data-i18n-label]").forEach(el => {
    el.setAttribute("aria-label", t[el.dataset.i18nLabel]);
    el.title = t[el.dataset.i18nLabel];
  });
  document.getElementById("lang").textContent = t.switchTo;
  document.getElementById("count").textContent = slotCount ? t.count(slotCount) : "";
  document.title = lang === "ar" ? "مواقف النزهة" : "El Nozha Parking";
  map.closePopup();
  if (here) here.setTooltipContent(t.here);
  Nozha.setLang(base, lang);
}

document.getElementById("lang").addEventListener("click", () => {
  lang = lang === "ar" ? "en" : "ar";
  try { localStorage.setItem("lang", lang); } catch (e) {}
  applyLanguage();
});

// Zoom out to the whole district (e.g. after opening at a sign)
document.getElementById("whole").addEventListener("click", () => map.flyToBounds(base.district, { duration: 0.8 }));

// "My location" — helps someone standing on the street find the nearest slots
let me;
document.getElementById("locate").addEventListener("click", e => {
  e.currentTarget.classList.add("active");
  map.locate({ setView: true, maxZoom: 18 });
});
map.on("locationfound", e => {
  if (me) map.removeLayer(me);
  me = L.layerGroup([
    L.circle(e.latlng, { radius: e.accuracy, color: "#1a73e8", weight: 1, fillOpacity: 0.1 }),
    L.circleMarker(e.latlng, { radius: 7, color: "#fff", weight: 2, fillColor: "#1a73e8", fillOpacity: 1 }),
  ]).addTo(map);
});
map.on("locationerror", () => document.getElementById("locate").classList.remove("active"));
