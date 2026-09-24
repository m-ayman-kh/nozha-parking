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
    editSlot: "تعديل الموقف", confirmDel: id => `حذف الموقف رقم ${id}؟`, saved: "تم الحفظ", deleted: "تم الحذف",
    saveFailed: "تعذّر الحفظ: ", emptyTitle: "قائمة المواقف على الإنترنت فارغة",
    emptyHint: n => `استيراد ${n.toLocaleString("ar-EG")} موقف من الملف الحالي (data/slots.geojson)؟`, importBtn: "استيراد",
    demo: "وضع تجريبي — التغييرات لا تُحفظ", tooMany: "عدد كبير جداً من المواقف في مستند واحد.",
    expires: "الحجز ينتهي في (اتركه فارغاً إن لم يوجد)",
    template: "⬇ القالب", upload: "⬆ رفع ملف", uploadTitle: "تحديث المواقف من ملف",
    uploadHint: "١) نزّل القالب: فيه كل المواقف الحالية. ٢) افتحه في Excel وعدّل الحاجز وتاريخ الانتهاء (سنة-شهر-يوم). ٣) احفظه بصيغة «CSV UTF-8» وارفعه هنا. رقم الموقف يحدد السطر؛ الخانة الفارغة تمسح القيمة. لا يمكن إضافة مواقف جديدة من الملف — استخدم «إضافة مواقف».",
    chooseFile: "اختر ملف CSV", apply: n => `تطبيق ${n.toLocaleString("ar-EG")} تغيير`,
    summary: (c, u, e) => `${c.toLocaleString("ar-EG")} موقف سيتغير، ${u.toLocaleString("ar-EG")} بدون تغيير، ${e.toLocaleString("ar-EG")} خطأ`,
    errNoNumber: r => `سطر ${r}: لا يوجد رقم موقف`, errUnknown: (r, n) => `سطر ${r}: الموقف رقم ${n} غير موجود`,
    errDate: (r, v) => `سطر ${r}: تاريخ غير مفهوم «${v}»`, errDup: (r, n) => `سطر ${r}: الموقف ${n} مكرر في الملف`,
    errFormat: "الملف لا يحتوي على عمود number — استخدم القالب.", uploaded: n => `تم تحديث ${n.toLocaleString("ar-EG")} موقف`,
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
    editSlot: "Edit slot", confirmDel: id => `Delete slot no. ${id}?`, saved: "Saved", deleted: "Deleted",
    saveFailed: "Could not save: ", emptyTitle: "The online slot list is empty",
    emptyHint: n => `Import the ${n} slots from the current file (data/slots.geojson)?`, importBtn: "Import",
    demo: "Demo mode — changes are not saved", tooMany: "Too many slots for one document.",
    expires: "Booking ends on (leave empty if none)",
    template: "⬇ Template", upload: "⬆ Upload", uploadTitle: "Update slots from a file",
    uploadHint: "1) Download the template: it lists every current slot. 2) Open it in Excel and change the booker and end date (year-month-day). 3) Save as “CSV UTF-8” and upload it here. The slot number identifies each row; an empty cell clears that value. New slots can't be created from a file — use “Add slots”.",
    chooseFile: "Choose a CSV file", apply: n => `Apply ${n} change${n === 1 ? "" : "s"}`,
    summary: (c, u, e) => `${c} slot${c === 1 ? "" : "s"} will change, ${u} unchanged, ${e} error${e === 1 ? "" : "s"}`,
    errNoNumber: r => `Row ${r}: no slot number`, errUnknown: (r, n) => `Row ${r}: slot ${n} doesn't exist`,
    errDate: (r, v) => `Row ${r}: can't read the date “${v}”`, errDup: (r, n) => `Row ${r}: slot ${n} appears twice`,
    errFormat: "The file has no “number” column — please use the template.", uploaded: n => `${n} slot${n === 1 ? "" : "s"} updated`,
  },
};

const SLOT_LEN = 5.2, SLOT_W = 2.3, SLOT_GAP = 0.6;  // metres, same as tools/build_data.py

let lang = (() => { try { return localStorage.getItem("lang") || "ar"; } catch (e) { return "ar"; } })();
const t = () => TEXT[lang];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const base = Nozha.createMap("map");
const map = base.map;
let slots = { type: "FeatureCollection", features: [] };
let slotLayer = L.geoJSON(null, { renderer: Nozha.slotRenderer, style: f => Nozha.slotStyle(map, f), onEachFeature: (f, l) => l.on("click", () => openEdit(f.properties.id)) }).addTo(map);
const restyle = () => slotLayer.setStyle(f => Nozha.slotStyle(map, f));
map.on("zoomend", restyle);
Promise.all([base.ready, document.fonts ? document.fonts.ready : null]).then(() => {
  map.invalidateSize({ animate: false });
  map.fitBounds(base.district, { animate: false });
});

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

// Slot numbers: 1, 2, 3 … new slots continue after the highest number in use
function nextIds(fc, count) {
  const max = Math.max(0, ...fc.features.map(f => parseInt(String(f.properties.id).replace(/\D/g, ""), 10) || 0));
  return Array.from({ length: count }, (_, i) => ({ id: String(max + 1 + i) }));
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
    </div>
    <label for="f_expires">${t().expires}</label><input id="f_expires" type="date" value="${esc(p.expires)}">`;
}

const readFields = () => ({
  street_ar: $("f_street_ar").value.trim(), street_en: $("f_street_en").value.trim(),
  booked_ar: $("f_booked_ar").value.trim(), booked_en: $("f_booked_en").value.trim(),
  expires: $("f_expires").value,  // "" = no end date
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
  slotLayer.eachLayer(l => l.setStyle(l.feature.properties.id === id ? { color: "#1d2733", weight: 3 } : Nozha.slotStyle(map, l.feature)));
  const num = Nozha.slotNumber(id, lang);
  showSheet(`<h3>${t().editSlot} <span class="pill">${esc(num)}</span></h3>
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
      setStatus(`${t().saved} · ${num}`);
    } catch (err) { alert(t().saveFailed + err.message); }
  };
  $("delete").onclick = async () => {
    if (!confirm(t().confirmDel(num))) return;
    try {
      await commit(fc => { fc.features = fc.features.filter(x => x.properties.id !== id); return [id]; }, "delete");
      closeSheet();
      setStatus(`${t().deleted} · ${num}`);
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
  restyle();
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

// ---------------------------------------------------------------- template download / bulk upload (CSV)
const COLUMNS = ["number", "street_en", "street_ar", "booked_en", "booked_ar", "expires", "lat", "lng"];
const EDITABLE = ["street_en", "street_ar", "booked_en", "booked_ar", "expires"];

const csvCell = v => /[",\n\r]/.test(v = String(v ?? "")) ? `"${v.replace(/"/g, '""')}"` : v;

// The template is the current list, so it can be edited and uploaded straight back
$("template").addEventListener("click", () => {
  const rows = slots.features
    .slice().sort((a, b) => (+a.properties.id || 0) - (+b.properties.id || 0))
    .map(f => {
      const p = f.properties, c = L.geoJSON(f).getBounds().getCenter();
      return [p.id, p.street_en, p.street_ar, p.booked_en, p.booked_ar, p.expires, c.lat.toFixed(6), c.lng.toFixed(6)];
    });
  // BOM so Excel opens the Arabic text correctly
  const csv = "﻿" + [COLUMNS, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `nozha-slots-${Nozha.todayISO()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// CSV with quotes; the delimiter (comma, semicolon or tab) is taken from the header row
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;  // quotes only open at the start of a cell
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// Accepts 2026-12-31, 2026/12/31, 31/12/2026, 31-12-2026 (and Arabic digits). Returns "YYYY-MM-DD", "" or null.
function normaliseDate(v) {
  v = String(v || "").trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  if (!v) return "";
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v), y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v))) {
    [, d, mo, y] = m;
    if (+mo > 12 && +d <= 12) [d, mo] = [mo, d];  // month/day/year from a US-style Excel
  } else return null;
  const date = new Date(+y, +mo - 1, +d);
  if (date.getMonth() !== +mo - 1 || date.getDate() !== +d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

$("upload").addEventListener("click", () => {
  if (adding) stopAdd();
  showSheet(`<h3>${t().uploadTitle}</h3><p class="hint">${t().uploadHint}</p>
    <label for="file">${t().chooseFile}</label><input id="file" type="file" accept=".csv,text/csv">
    <div id="uploadResult"></div>
    <div class="buttons"><button class="btn primary grow" id="applyUpload" type="button" hidden></button>
      <button class="btn" id="closeUpload" type="button">${t().cancel}</button></div>`);
  $("closeUpload").onclick = closeSheet;
  $("file").onchange = async () => {
    const file = $("file").files[0];
    if (!file) return;
    const plan = planUpload(parseCSV(await file.text()));
    const result = $("uploadResult");
    if (!plan) { result.innerHTML = `<p class="errors">${t().errFormat}</p>`; return; }
    result.innerHTML = `<p class="summary">${t().summary(plan.changes.length, plan.unchanged, plan.errors.length)}</p>` +
      (plan.errors.length ? `<ul class="errors">${plan.errors.slice(0, 50).map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : "");
    const apply = $("applyUpload");
    apply.hidden = !plan.changes.length;
    apply.textContent = t().apply(plan.changes.length);
    apply.onclick = async () => {
      apply.disabled = true;
      try {
        await commit(fc => {
          const byId = new Map(fc.features.map(f => [String(f.properties.id), f]));
          const done = [];
          plan.changes.forEach(({ id, values }) => { const f = byId.get(id); if (f) { Object.assign(f.properties, values); done.push(id); } });
          return done;
        }, "upload");
        closeSheet();
        setStatus(t().uploaded(plan.changes.length));
      } catch (err) { apply.disabled = false; alert(t().saveFailed + err.message); }
    };
  };
});

// Compare the file with the current slots: what would change, and which rows have problems
function planUpload(rows) {
  if (!rows.length) return null;
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = name => header.indexOf(name);
  if (col("number") < 0) return null;
  const byId = new Map(slots.features.map(f => [String(f.properties.id), f.properties]));
  const changes = [], errors = [], seen = new Set();
  let unchanged = 0;
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const id = String(r[col("number")] || "").trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (!id) return errors.push(t().errNoNumber(rowNo));
    if (!byId.has(id)) return errors.push(t().errUnknown(rowNo, id));
    if (seen.has(id)) return errors.push(t().errDup(rowNo, id));
    seen.add(id);
    const current = byId.get(id), values = {};
    for (const key of EDITABLE) {
      if (col(key) < 0) continue;  // column not in the file: leave as is
      let v = String(r[col(key)] ?? "").trim();
      if (key === "expires") {
        const d = normaliseDate(v);
        if (d === null) return errors.push(t().errDate(rowNo, v));
        v = d;
      }
      if (v !== (current[key] || "")) values[key] = v;
    }
    Object.keys(values).length ? changes.push({ id, values }) : unchanged++;
  });
  return { changes, unchanged, errors };
}
