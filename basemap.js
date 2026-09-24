// Shared by the public map (app.js) and the admin page (admin.js):
// base layers, street labels, slot styling and loading slots.

const Nozha = (() => {
  const styles = getComputedStyle(document.documentElement);
  const css = name => styles.getPropertyValue(name).trim();
  const MAJOR = ["trunk", "primary", "secondary", "tertiary"];

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

  const getJSON = path => fetch(path).then(r => r.json());

  function createMap(id) {
    const map = L.map(id, {
      zoomControl: false, attributionControl: false,
      minZoom: 11.5, maxZoom: 20, zoomSnap: 0.25,
    }).setView([30.105, 31.38], 14);
    L.control.zoom({ position: "topleft" }).addTo(map);

    const canvas = L.canvas({ padding: 0.5 });
    const state = { map, lang: "ar", labels: null, labelLayer: null, labelKey: "" };

    state.ready = Promise.all(["district", "streets", "buildings", "labels"].map(n => getJSON(`data/${n}.geojson`)))
      .then(([district, streets, buildings, labels]) => {
        // soften everything outside the district, and outline it
        const rings = (district.geometry.type === "Polygon" ? [district.geometry.coordinates] : district.geometry.coordinates)
          .map(p => p[0].map(([x, y]) => [y, x]));
        const outside = L.polygon([[[29.9, 31.1], [29.9, 31.7], [30.35, 31.7], [30.35, 31.1]], ...rings], {
          renderer: canvas, interactive: false, stroke: false, fillColor: css("--ground"), fillOpacity: 0.55,
        });
        L.geoJSON(streets, {
          renderer: canvas, interactive: false,
          style: { fillColor: css("--street"), fillOpacity: 1, color: css("--street-edge"), weight: 1 },
        }).addTo(map);
        L.geoJSON(buildings, {
          renderer: canvas, interactive: false,
          style: { fillColor: css("--building"), fillOpacity: 1, color: css("--building-edge"), weight: 0.8 },
        }).addTo(map);
        outside.addTo(map);
        L.geoJSON(district, {
          renderer: canvas, interactive: false,
          style: { fill: false, color: "#7a8591", weight: 2, dashArray: "6 6" },
        }).addTo(map);

        labels.features.forEach(f => {
          f.bounds = L.geoJSON(f).getBounds();
          f.major = MAJOR.includes(f.properties.cls);
        });
        state.labels = labels;
        state.district = L.geoJSON(district).getBounds();
        map.setMaxBounds(state.district.pad(0.1));
        map.on("moveend", () => drawLabels(state));
        drawLabels(state);
        return state;
      });
    return state;
  }

  // Street names follow the street; only streets in view are labelled.
  function drawLabels(state, force) {
    const { map, labels, lang } = state;
    if (!labels) return;
    const z = map.getZoom();
    const view = map.getBounds().pad(0.2);
    const key = `${lang}|${z}|${view.toBBoxString()}`;
    if (!force && key === state.labelKey) return;
    state.labelKey = key;
    if (state.labelLayer) map.removeLayer(state.labelLayer);
    const placed = {};  // name -> midpoints already labelled (divided roads have two lines)
    const layer = state.labelLayer = L.layerGroup();
    for (const f of labels.features) {
      if (z < 15 || (z < 16.5 && !f.major) || !view.intersects(f.bounds)) continue;
      const name = f.properties[lang];
      const pts = f.geometry.coordinates.map(([x, y]) => map.latLngToLayerPoint([y, x]));
      const length = pts.slice(1).reduce((s, p, i) => s + p.distanceTo(pts[i]), 0);
      if (length < name.length * 7.5 + 20) continue;       // too short at this zoom
      const mid = pts[Math.floor(pts.length / 2)];
      if ((placed[name] || []).some(p => p.distanceTo(mid) < 260)) continue;
      (placed[name] = placed[name] || []).push(mid);
      let coords = f.geometry.coordinates.map(([x, y]) => [y, x]);
      if (pts[pts.length - 1].x < pts[0].x) coords = coords.reverse();
      const line = L.polyline(coords, { opacity: 0, interactive: false });
      line.setText(name, { offset: 4, attributes: { class: "street-label" + (f.major ? " major" : "") } });
      layer.addLayer(line);
    }
    layer.addTo(map);
  }

  function setLang(state, lang) {
    state.lang = lang;
    drawLabels(state, true);
  }

  // A slot is ~2.3 m wide: give it a thicker outline when zoomed out so it stays visible
  function slotStyle(map) {
    const z = map.getZoom();
    return { fillColor: css("--slot"), fillOpacity: 0.95, color: css("--slot"), weight: z < 13.5 ? 6 : z < 15 ? 5 : z < 16.5 ? 4 : z < 17.5 ? 2.5 : 1 };
  }

  // Slots live in one Firestore document (one read per visit). If Firebase is not set up
  // or unreachable, fall back to the copy in the repo.
  async function loadSlots() {
    const fb = window.NOZHA_CONFIG && window.NOZHA_CONFIG.firebase;
    if (fb) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/(default)/documents/public/slots?key=${fb.apiKey}`;
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) return JSON.parse((await r.json()).fields.geojson.stringValue);
      } catch (e) { /* fall through */ }
    }
    return getJSON("data/slots.geojson");
  }

  return { createMap, setLang, slotStyle, loadSlots, css };
})();
