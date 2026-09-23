# El Nozha Paid Parking Map

A free, mobile-friendly map of the paid parking slots in El Nozha, Cairo. Citizens scan a QR code on a street sign, and the map opens with every paid slot drawn in red along the kerb. Tapping a slot shows who has booked it under a long-term agreement. The page is in Arabic and English.

**Live:** https://m-ayman-kh.github.io/nozha-parking/
**Printable signs:** [`sign.html`](sign.html) lists every sign; open one and print it on A4.

## QR codes that open at the sign's location

A QR code can't read the phone's GPS, so each printed sign gets **its own QR code** with the sign's position built in (`?lat=…&lng=…`). Scanning it opens the map zoomed in on that spot, with a blue **"You are here"** marker. The locate button still offers the phone's exact GPS position.

To add a sign: put its id, name and mounting spot (lat/lng, from Google Maps with a long-press) in `tools/signs.json`, run `make_qr.py`, then print `sign.html?sign=<id>`.

## Cost: none

| Part | Tool | Licence |
|---|---|---|
| Streets | OpenStreetMap, through the Overpass API | ODbL |
| Buildings | Microsoft Global ML Building Footprints | ODbL |
| Map display | Leaflet and leaflet-textpath | BSD / MIT |
| Hosting | GitHub Pages | free for public repos |
| QR code | `qrcode` Python library | BSD |

No map service or API key is used at runtime. The whole map is static files.

## Files

```
index.html, app.js, style.css   the map page
data/slots.geojson              ← the parking slots (the file you edit)
data/streets.geojson            street surfaces
data/buildings.geojson          building footprints
data/labels.geojson             street names (Arabic and English)
qr.png / qr.svg                 general QR code (whole map)
qr/<sign-id>.svg                one QR code per street sign
sign.html                       printable A4 sign
tools/                          scripts that rebuild the data
```

## Updating the slots

Each slot in `data/slots.geojson` is one rectangle with these properties:

```json
{ "id": "NZ-021", "id_ar": "نز-٠٢١",
  "street_en": "Abd Al Aziz Fahmy Street", "street_ar": "شارع عبد العزيز فهمى",
  "booked_en": "Delta Logistics", "booked_ar": "دلتا للخدمات اللوجستية" }
```

**Change who booked a slot:** edit `booked_en` and `booked_ar` directly on GitHub (pencil icon, then *Commit*). The site updates within about a minute.

**Add, move or delete slots:** open [geojson.io](https://geojson.io), drag in `data/slots.geojson`, draw or adjust the rectangles along the kerb, fill in the properties, then save and replace the file in the repo.

## Rebuilding the base map (optional)

```bash
cd tools
python3 -m venv .venv && .venv/bin/pip install shapely "qrcode[pil]"
./fetch_osm.sh                      # streets for the box in area.json
# download the Microsoft footprint tile for Egypt quadkey 122121122 as ms_tile.csv.gz
.venv/bin/python filter_ms.py       # buildings
.venv/bin/python build_data.py      # street surfaces, labels, demo slots
.venv/bin/python make_qr.py [url]   # QR codes: general + one per sign in signs.json
```

`build_data.py` generates the demo slots. Once real slot data exists, stop running it for slots and edit `data/slots.geojson` by hand.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

Map data © OpenStreetMap contributors, Microsoft. Both are available under the ODbL.
