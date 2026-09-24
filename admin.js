// Admin page: sign in, then add / edit / delete slots.
// Slots are stored in ONE Firestore document (public/slots) so the public map needs a single read.
// Every change also writes a line to the "history" collection (who, what, when).

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, doc, collection, onSnapshot, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const TEXT = {
  ar: {
    title: "إدارة المواقف — حي النزهة", switchTo: "English", signOut: "خروج",
    signInTitle: "تسجيل الدخول", signInHint: "للمسؤولين فقط.", email: "البريد الإلكتروني", password: "كلمة المرور",
    signIn: "دخول", forgot: "نسيت كلمة المرور؟", sendReset: "إرسال رابط إعادة التعيين", back: "رجوع لتسجيل الدخول",
    resetHint: "اكتب بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.",
    resetSent: "تم الإرسال. افتح بريدك (وتحقق من الرسائل غير المرغوب فيها).",
    badLogin: "البريد أو كلمة المرور غير صحيحة.", needEmail: "اكتب البريد الإلكتروني أولاً.",
    notConfigured: "لم يتم ربط Firebase بعد. أضف الإعدادات في config.js.",
    addSlots: "+ إضافة مواقف", slots: n => `${n.toLocaleString("ar-EG")} موقف`,
    tapStart: "اضغط على بداية الرصيف", tapEnd: "اضغط على نهاية الرصيف",
    addHint: "كبّر الخريطة واضغط على حافة الرصيف حيث تبدأ المواقف، ثم حيث تنتهي.",
    newSlots: n => `${n.toLocaleString("ar-EG")} موقف جديد`, flip: "اقلب الجهة", cancel: "إلغاء", save: "حفظ", del: "حذف",
    streetAr: "الشارع (عربي)", streetEn: "الشارع (إنجليزي)", bookedAr: "محجوز لـ (عربي)", bookedEn: "محجوز لـ (إنجليزي)",
    editSlot: "تعديل الموقف", confirmDel: id => `حذف الموقف ${id}؟`, saved: "تم الحفظ", deleted: "تم الحذف",
    saveFailed: "تعذّر الحفظ: ", emptyTitle: "قائمة المواقف على الإنترنت فارغة",
    emptyHint: n => `استيراد ${n.toLocaleString("ar-EG")} موقف من الملف الحالي (data/slots.geojson)؟`, importBtn: "استيراد",
    demo: "وضع تجريبي — التغييرات لا تُحفظ", tooMany: "عدد كبير جداً من المواقف في مستند واحد.",
  },
  en: {
    title: "Parking Admin — El Nozha", switchTo: "العربية", signOut: "Sign out",
    signInTitle: "Sign in", signInHint: "Administrators only.", email: "Email", password: "Password",
    signIn: "Sign in", forgot: "Forgot password?", sendReset: "Send reset link", back: "Back to sign in",
    resetHint: "Enter your email and we'll send you a link to set a new password.",
    resetSent: "Sent. Check your inbox (and the spam folder).",
    badLogin: "Wrong email or password.", needEmail: "Enter your email first.",
    notConfigured: "Firebase is not connected yet. Add the settings in config.js.",
    addSlots: "+ Add slots", slots: n => `${n} slots`,
    tapStart: "Tap where the kerb starts", tapEnd: "Tap where the kerb ends",
    addHint: "Zoom in, tap the kerb edge where the slots start, then where they end.",
    newSlots: n => `${n} new slot${n === 1 ? "" : "s"}`, flip: "Flip side", cancel: "Cancel", save: "Save", del: "Delete",
    streetAr: "Street (Arabic)", streetEn: "Street (English)", bookedAr: "Booked by (Arabic)", bookedEn: "Booked by (English)",
    editSlot: "Edit slot", confirmDel: id => `Delete slot ${id}?`, saved: "Saved", deleted: "Deleted",
    saveFailed: "Could not save: ", emptyTitle: "The online slot list is empty",
    emptyHint: n => `Import the ${n} slots from the current file (data/slots.geojson)?`, importBtn: "Import",
    demo: "Demo mode — changes are not saved", tooMany: "Too many slots for one document.",
  },
};

const SLOT_LEN = 5.2, SLOT_W = 2.3, SLOT_GAP = 0.6;  // metres, same as tools/build_data.py
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

let lang = (() => { try { return localStorage.getItem("lang") || "ar"; } catch (e) { return "ar"; } })();
const t = () => TEXT[lang];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const base = Nozha.createMap("map");
const map = base.map;
let slots = { type: "FeatureCollection", features: [] };
let slotLayer = L.geoJSON(null, { style: () => Nozha.slotStyle(map), onEachFeature: (f, l) => l.on("click", () => openEdit(f.properties.id)) }).addTo(map);
map.on("zoomend", () => slotLayer.setStyle(Nozha.slotStyle(map)));
base.ready.then(() => map.fitBounds(base.district, { animate: false }));

// ---------------------------------------------------------------- storage
const fbConfig = window.NOZHA_CONFIG && window.NOZHA_CONFIG.firebase;
const demo = !fbConfig && new URLSearchParams(location.search).has("demo");
let auth, db, user, unsubscribe;

if (fbConfig) {
  const app = initializeApp(fbConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, u => { user = u; u ? signedIn() : signedOut(); });
} else if (demo) {
  user = { email: "demo@example.com" };
  signedIn();
} else {
  signedOut();
  showMsg(t().notConfigured, "error");
  $("submit").disabled = true;
}

const slotsRef = () => doc(db, "public", "slots");

function signedIn() {
  $("gate").hidden = true;
  $("toolbar").hidden = false;
  $("signout").hidden = demo;
  $("who").textContent = demo ? t().demo : user.email;
  if (demo) {
    Nozha.loadSlots().then(render);
    return;
  }
  unsubscribe = onSnapshot(slotsRef(), snap => {
    if (!snap.exists()) return offerImport();
    render(JSON.parse(snap.data().geojson));
  }, err => setStatus(t().saveFailed + err.message));
}

function signedOut() {
  if (unsubscribe) unsubscribe();
  $("gate").hidden = false;
  $("toolbar").hidden = true;
  $("signout").hidden = true;
  $("who").textContent = "";
  closeSheet();
}

// Apply a change to the slot list. In a transaction, so two admins can't overwrite each other.
// `change` edits the list in place and returns the ids it touched (for the history log).
async function commit(change, action) {
  if (demo) {
    change(slots);
    render(slots);
    return;
  }
  await runTransaction(db, async tx => {
    const snap = await tx.get(slotsRef());
    const fc = snap.exists() ? JSON.parse(snap.data().geojson) : { type: "FeatureCollection", features: [] };
    const ids = change(fc) || [];
    const json = JSON.stringify(fc);
    if (json.length > 900000) throw new Error(t().tooMany);
    tx.set(slotsRef(), { geojson: json, updatedAt: serverTimestamp(), updatedBy: user.email });
    tx.set(doc(collection(db, "history")), { action, ids, by: user.email, at: serverTimestamp() });
  });
}

function render(fc) {
  slots = fc;
  slotLayer.clearLayers().addData(fc);
  setStatus(t().slots(fc.features.length));
}

function setStatus(s) { $("status").textContent = s; }

// ---------------------------------------------------------------- sign-in and password reset
let resetMode = false;

function showMsg(text, kind) {
  $("loginMsg").textContent = text || "";
  $("loginMsg").className = "msg" + (kind ? " " + kind : "");
}

function setResetMode(on) {
  resetMode = on;
  $("pwBlock").hidden = on;
  document.querySelector("#login [data-i18n=signInHint]").textContent = on ? t().resetHint : t().signInHint;
  $("submit").textContent = on ? t().sendReset : t().signIn;
  $("forgot").textContent = on ? t().back : t().forgot;
  showMsg("");
}

$("forgot").addEventListener("click", () => setResetMode(!resetMode));

$("login").addEventListener("submit", async e => {
  e.preventDefault();
  if (!auth) return;
  const email = $("email").value.trim();
  if (!email) return showMsg(t().needEmail, "error");
  $("submit").disabled = true;
  try {
    auth.languageCode = lang;
    if (resetMode) {
      await sendPasswordResetEmail(auth, email);
      showMsg(t().resetSent, "ok");
    } else {
      await signInWithEmailAndPassword(auth, email, $("password").value);
      $("password").value = "";
    }
  } catch (err) {
    // Same message for unknown email and wrong password, so nobody can probe which emails exist
    showMsg(resetMode ? t().resetSent : t().badLogin, resetMode ? "ok" : "error");
  } finally {
    $("submit").disabled = false;
  }
});

$("signout").addEventListener("click", () => auth && signOut(auth));

// ---------------------------------------------------------------- geometry helpers (metres, local)
function projector(origin) {
  const mx = 111320 * Math.cos(origin.lat * Math.PI / 180), my = 110574;
  return {
    toM: ll => ({ x: (ll.lng - origin.lng) * mx, y: (ll.lat - origin.lat) * my }),
    toLL: p => [+(origin.lat + p.y / my).toFixed(7), +(origin.lng + p.x / mx).toFixed(7)],
  };
}

// Rectangles from A to B along the kerb, SLOT_W deep on one side
function rowOfSlots(a, b, side) {
  const P = projector(a);
  const B = P.toM(b);
  const len = Math.hypot(B.x, B.y);
  if (len < SLOT_LEN * 0.8) return [];
  const u = { x: B.x / len, y: B.y / len };
  const n = { x: -u.y * side * SLOT_W, y: u.x * side * SLOT_W };
  const count = Math.max(1, Math.floor((len + SLOT_GAP) / (SLOT_LEN + SLOT_GAP)));
  const rects = [];
  for (let k = 0; k < count; k++) {
    const s = k * (SLOT_LEN + SLOT_GAP);
    const p1 = { x: u.x * s, y: u.y * s }, p2 = { x: u.x * (s + SLOT_LEN), y: u.y * (s + SLOT_LEN) };
    const ring = [p1, p2, { x: p2.x + n.x, y: p2.y + n.y }, { x: p1.x + n.x, y: p1.y + n.y }, p1].map(P.toLL);
    rects.push(ring);
  }
  return rects;
}

// Nearest named street to a point: gives the street names and which side the road is on
function nearestStreet(a, b) {
  const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
  const P = projector(mid);
  let best = null;
  for (const f of base.labels.features) {
    const bb = f.bounds, m = 0.0015;  // ~150 m: ignore streets that are clearly far away
    if (mid.lat < bb.getSouth() - m || mid.lat > bb.getNorth() + m || mid.lng < bb.getWest() - m || mid.lng > bb.getEast() + m) continue;
    const pts = f.geometry.coordinates.map(([x, y]) => P.toM({ lat: y, lng: x }));
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], dx = q.x - p.x, dy = q.y - p.y;
      const k = Math.max(0, Math.min(1, -(p.x * dx + p.y * dy) / (dx * dx + dy * dy || 1)));
      const c = { x: p.x + k * dx, y: p.y + k * dy }, d = Math.hypot(c.x, c.y);
      if (!best || d < best.d) best = { d, c, props: f.properties };
    }
  }
  if (!best) return { side: 1, props: { ar: "", en: "" } };
  const B = P.toM(b), A = P.toM(a);
  const u = { x: B.x - A.x, y: B.y - A.y };
  // left of the A→B direction is (-u.y, u.x); pick the side that points at the street centre
  const side = (-u.y * best.c.x + u.x * best.c.y) >= 0 ? 1 : -1;
  return { side, props: best.props };
}

function nextIds(fc, count) {
  let max = 0;
  fc.features.forEach(f => { const m = /(\d+)$/.exec(f.properties.id || ""); if (m) max = Math.max(max, +m[1]); });
  return Array.from({ length: count }, (_, i) => {
    const num = String(max + 1 + i).padStart(3, "0");
    return { id: `NZ-${num}`, id_ar: `نز-${num.replace(/\d/g, d => AR_DIGITS[d])}` };
  });
}

// ---------------------------------------------------------------- add a row of slots
let adding = null;  // { a, b, side, markers, preview }

$("add").addEventListener("click", startAdd);

function startAdd() {
  closeSheet();
  adding = { markers: L.layerGroup().addTo(map), preview: L.layerGroup().addTo(map) };
  map.getContainer().style.cursor = "crosshair";
  if (map.getZoom() < 18) map.setZoom(18);
  showSheet(`<h3>${t().tapStart}</h3><p class="hint">${t().addHint}</p>
    <div class="buttons"><button class="btn" id="cancelAdd" type="button">${t().cancel}</button></div>`);
  $("cancelAdd").onclick = stopAdd;
}

function stopAdd() {
  if (!adding) return;
  map.removeLayer(adding.markers);
  map.removeLayer(adding.preview);
  adding = null;
  map.getContainer().style.cursor = "";
  closeSheet();
}

map.on("click", e => {
  if (!adding) return;
  const dot = L.circleMarker(e.latlng, { radius: 6, color: "#fff", weight: 2, fillColor: "#1d2733", fillOpacity: 1 });
  if (!adding.a) {
    adding.a = e.latlng;
    dot.addTo(adding.markers);
    showSheet(`<h3>${t().tapEnd}</h3><p class="hint">${t().addHint}</p>
      <div class="buttons"><button class="btn" id="cancelAdd" type="button">${t().cancel}</button></div>`);
    $("cancelAdd").onclick = stopAdd;
  } else if (!adding.b) {
    adding.b = e.latlng;
    dot.addTo(adding.markers);
    const near = nearestStreet(adding.a, adding.b);
    adding.side = near.side;
    drawPreview();
    showAddForm(near.props);
    // keep the new row visible above the form
    map.fitBounds(L.latLngBounds([adding.a, adding.b]), {
      paddingTopLeft: [40, 60], paddingBottomRight: [40, $("sheet").offsetHeight + 40], maxZoom: map.getZoom(),
    });
  }
});

function drawPreview() {
  adding.preview.clearLayers();
  adding.rects = rowOfSlots(adding.a, adding.b, adding.side);
  adding.rects.forEach(r => L.polygon(r, { color: "#1d2733", weight: 1, fillColor: "#ff5a4e", fillOpacity: 0.8, dashArray: "3 3" }).addTo(adding.preview));
  const title = document.querySelector("#sheet h3");
  if (title) title.textContent = t().newSlots(adding.rects.length);
}

function fieldsHtml(p) {
  return `<div class="row">
      <div><label for="f_street_ar">${t().streetAr}</label><input id="f_street_ar" dir="rtl" value="${esc(p.street_ar)}"></div>
      <div><label for="f_street_en">${t().streetEn}</label><input id="f_street_en" dir="ltr" value="${esc(p.street_en)}"></div>
    </div>
    <div class="row">
      <div><label for="f_booked_ar">${t().bookedAr}</label><input id="f_booked_ar" dir="rtl" value="${esc(p.booked_ar)}"></div>
      <div><label for="f_booked_en">${t().bookedEn}</label><input id="f_booked_en" dir="ltr" value="${esc(p.booked_en)}"></div>
    </div>`;
}

const readFields = () => ({
  street_ar: $("f_street_ar").value.trim(), street_en: $("f_street_en").value.trim(),
  booked_ar: $("f_booked_ar").value.trim(), booked_en: $("f_booked_en").value.trim(),
});

function showAddForm(street) {
  showSheet(`<h3></h3>${fieldsHtml({ street_ar: street.ar, street_en: street.en })}
    <div class="buttons">
      <button class="btn primary grow" id="saveAdd" type="button">${t().save}</button>
      <button class="btn" id="flip" type="button">${t().flip}</button>
      <button class="btn" id="cancelAdd" type="button">${t().cancel}</button>
    </div>`);
  document.querySelector("#sheet h3").textContent = t().newSlots(adding.rects.length);
  $("flip").onclick = () => { adding.side *= -1; drawPreview(); };
  $("cancelAdd").onclick = stopAdd;
  $("saveAdd").onclick = async () => {
    const props = readFields(), rects = adding.rects;
    if (!rects.length) return;
    $("saveAdd").disabled = true;
    try {
      await commit(fc => {
        const newIds = nextIds(fc, rects.length);
        rects.forEach((r, i) => fc.features.push({
          type: "Feature",
          properties: { ...newIds[i], ...props },
          geometry: { type: "Polygon", coordinates: [r.map(([lat, lng]) => [lng, lat])] },
        }));
        return newIds.map(x => x.id);
      }, "add");
      stopAdd();
      setStatus(`${t().saved} · ${t().slots(slots.features.length)}`);
    } catch (err) {
      $("saveAdd").disabled = false;
      alert(t().saveFailed + err.message);
    }
  };
}

// ---------------------------------------------------------------- edit / delete one slot
function openEdit(id) {
  if (adding) return;
  const f = slots.features.find(x => x.properties.id === id);
  if (!f) return;
  const p = f.properties;
  slotLayer.eachLayer(l => l.setStyle(l.feature.properties.id === id ? { color: "#1d2733", weight: 3 } : Nozha.slotStyle(map)));
  showSheet(`<h3>${t().editSlot} <span class="pill">${esc(lang === "ar" ? p.id_ar : p.id)}</span></h3>
    ${fieldsHtml(p)}
    <div class="buttons">
      <button class="btn primary grow" id="saveEdit" type="button">${t().save}</button>
      <button class="btn danger" id="delete" type="button">${t().del}</button>
      <button class="btn" id="closeEdit" type="button">${t().cancel}</button>
    </div>`);
  $("closeEdit").onclick = closeSheet;
  $("saveEdit").onclick = async () => {
    const props = readFields();
    try {
      await commit(fc => {
        const g = fc.features.find(x => x.properties.id === id);
        if (g) Object.assign(g.properties, props);
        return [id];
      }, "edit");
      closeSheet();
      setStatus(`${t().saved} · ${id}`);
    } catch (err) { alert(t().saveFailed + err.message); }
  };
  $("delete").onclick = async () => {
    if (!confirm(t().confirmDel(lang === "ar" ? p.id_ar : p.id))) return;
    try {
      await commit(fc => { fc.features = fc.features.filter(x => x.properties.id !== id); return [id]; }, "delete");
      closeSheet();
      setStatus(`${t().deleted} · ${id}`);
    } catch (err) { alert(t().saveFailed + err.message); }
  };
}

// First run: the online list doesn't exist yet — copy the slots from the repo file
async function offerImport() {
  const fc = await fetch("data/slots.geojson").then(r => r.json());
  render({ type: "FeatureCollection", features: [] });
  showSheet(`<h3>${t().emptyTitle}</h3><p class="hint">${t().emptyHint(fc.features.length)}</p>
    <div class="buttons"><button class="btn primary grow" id="import" type="button">${t().importBtn}</button></div>`);
  $("import").onclick = async () => {
    $("import").disabled = true;
    try {
      await commit(target => { target.features = fc.features; return []; }, "import");
      closeSheet();
    } catch (err) { $("import").disabled = false; alert(t().saveFailed + err.message); }
  };
}

// ---------------------------------------------------------------- sheet + language
function showSheet(html) { $("sheet").innerHTML = html; $("sheet").hidden = false; }
function closeSheet() {
  $("sheet").hidden = true;
  $("sheet").innerHTML = "";
  slotLayer.setStyle(Nozha.slotStyle(map));
}

function applyLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach(el => { const v = t()[el.dataset.i18n]; if (typeof v === "string") el.textContent = v; });
  $("lang").textContent = t().switchTo;
  document.title = lang === "ar" ? "إدارة المواقف" : "Parking Admin";
  if (demo) $("who").textContent = t().demo;
  if (!$("toolbar").hidden) setStatus(t().slots(slots.features.length));
  setResetMode(resetMode);
  if (!fbConfig && !demo) showMsg(t().notConfigured, "error");
  Nozha.setLang(base, lang);
}

$("lang").addEventListener("click", () => {
  lang = lang === "ar" ? "en" : "ar";
  try { localStorage.setItem("lang", lang); } catch (e) {}
  applyLanguage();
});

applyLanguage();
