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
    credit: "Map data",
    switchTo: "العربية",
  },
};

let lang = (() => {
  try { const saved = localStorage.getItem("lang"); if (saved) return saved; } catch (e) {}
  return (navigator.language || "ar").startsWith("en") ? "en" : "ar";
})();

const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
  minZoom: 15,
  maxZoom: 20,
  zoomSnap: 0.5,
}).setView([30.1003, 31.3432], 16);  // Triumph Square, El Nozha
L.control.zoom({ position: "topleft" }).addTo(map);

const styles = getComputedStyle(document.documentElement);
const css = name => styles.getPropertyValue(name).trim();
const canvas = L.canvas({ padding: 0.5 });

let slotLayer, labelLayer, labelData, labelZoom, slotCount = 0;

Promise.all(["streets", "buildings", "labels", "slots"].map(n => fetch(`data/${n}.geojson`).then(r => r.json())))
  .then(([streets, buildings, labels, slots]) => {
    L.geoJSON(streets, {
      renderer: canvas, interactive: false,
      style: { fillColor: css("--street"), fillOpacity: 1, color: css("--street-edge"), weight: 1 },
    }).addTo(map);

    L.geoJSON(buildings, {
      renderer: canvas, interactive: false,
      style: { fillColor: css("--building"), fillOpacity: 1, color: css("--building-edge"), weight: 0.8 },
    }).addTo(map);

    labelData = labels;

    slotCount = slots.features.length;
    slotLayer = L.geoJSON(slots, {
      style: slotStyle,
      onEachFeature: (f, layer) => {
        layer.bindPopup(() => popupHtml(f.properties), { maxWidth: 260 });
        layer.on("popupopen", () => layer.setStyle({ color: "#1d2733", weight: slotStyle().weight + 2 }));
        layer.on("popupclose", () => layer.setStyle(slotStyle()));
      },
    }).addTo(map);

    const area = L.geoJSON(streets).getBounds();
    map.setMaxBounds(area.pad(0.15));
    showSignLocation(area);
    map.on("zoomend", () => slotLayer.setStyle(slotStyle));
    map.on("moveend", () => { if (map.getZoom() !== labelZoom) drawLabels(); });
    applyLanguage();
  });

// A slot is ~2.3 m wide: give it a thicker outline when zoomed out so it stays visible
function slotStyle() {
  const z = map.getZoom();
  return { fillColor: css("--slot"), fillOpacity: 0.95, color: css("--slot"), weight: z < 16.5 ? 4 : z < 17.5 ? 2.5 : 1 };
}

// Each street sign's QR code carries the sign's position: ?lat=30.1003&lng=31.3432
let here;
function showSignLocation(area) {
  const q = new URLSearchParams(location.search);
  const lat = parseFloat(q.get("lat")), lng = parseFloat(q.get("lng"));
  if (!isFinite(lat) || !isFinite(lng) || !area.contains([lat, lng])) return;
  map.setView([lat, lng], 18, { animate: false });
  here = L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 })
    .bindTooltip("", { permanent: true, direction: "top", offset: [0, -10], className: "here" })
    .addTo(map);
}

function popupHtml(p) {
  const t = TEXT[lang];
  const ar = lang === "ar";
  return `<div class="pop" dir="${ar ? "rtl" : "ltr"}">
    <span class="id">${ar ? p.id_ar : p.id}</span>
    <div class="street">${ar ? p.street_ar : p.street_en}</div>
    <div class="label">${t.bookedBy}</div>
    <div class="who">${ar ? p.booked_ar : p.booked_en}</div>
    <div class="term">${t.term}</div>
  </div>`;
}

// Centre labels with SVG itself: the plugin's own centring cuts off right-to-left (Arabic)
// text. The plugin rebuilds the text on every redraw, so hook in after each setText.
const setText = L.Polyline.prototype.setText;
L.Polyline.prototype.setText = function (...args) {
  setText.apply(this, args);
  if (this._textNode) {
    this._textNode.setAttribute("text-anchor", "middle");
    this._textNode.firstChild.setAttribute("startOffset", "50%");
  }
  return this;
};

// Street names follow the street. Lines are turned so text never reads upside down.
function drawLabels() {
  if (labelLayer) map.removeLayer(labelLayer);
  if (!labelData) return;
  const z = labelZoom = map.getZoom();
  const placed = {};  // name -> midpoints already labelled (divided roads have two lines)
  labelLayer = L.layerGroup();
  labelData.features.forEach(f => {
    const major = ["primary", "secondary", "trunk", "tertiary"].includes(f.properties.cls);
    if (z < 16.5 && !major) return;
    const name = f.properties[lang];
    let pts = f.geometry.coordinates.map(([x, y]) => map.latLngToLayerPoint([y, x]));
    const length = pts.slice(1).reduce((s, p, i) => s + p.distanceTo(pts[i]), 0);
    if (length < name.length * 7.5 + 20) return;       // too short at this zoom
    const mid = pts[Math.floor(pts.length / 2)];
    if ((placed[name] || []).some(p => p.distanceTo(mid) < 260)) return;
    (placed[name] = placed[name] || []).push(mid);
    let coords = f.geometry.coordinates.map(([x, y]) => [y, x]);
    if (pts[pts.length - 1].x < pts[0].x) coords = coords.reverse();
    const line = L.polyline(coords, { opacity: 0, interactive: false });
    line.setText(name, { offset: 4, attributes: { class: "street-label" + (major ? " major" : "") } });
    labelLayer.addLayer(line);
  });
  labelLayer.addTo(map);
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
  drawLabels();
}

document.getElementById("lang").addEventListener("click", () => {
  lang = lang === "ar" ? "en" : "ar";
  try { localStorage.setItem("lang", lang); } catch (e) {}
  applyLanguage();
});

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
