# El Nozha Paid Parking Map

A free, mobile-friendly map of the paid parking slots in the El Nozha district of Cairo: Al Nozha, New Al Nozha and western Sheraton Al Matar (the crop box is in `tools/make_district.py`). Citizens scan a QR code on a street sign, and the map opens with every paid slot drawn in red along the kerb. Tapping a slot shows who has booked it under a long-term agreement. The page is in Arabic and English.

**Live map:** https://m-ayman-kh.github.io/nozha-parking/
**Admin:** https://m-ayman-kh.github.io/nozha-parking/admin.html
**Printable signs:** [`sign.html`](sign.html) lists every sign; open one and print it on A4.

## QR codes that open at the sign's location

A QR code can't read the phone's GPS, so each printed sign gets **its own QR code** with the sign's position built in (`?lat=…&lng=…`). Scanning it opens the map zoomed in on that spot, with a blue **"You are here"** marker. Pinch out, or tap the **whole district** button, to see the full area. The locate button still offers the phone's exact GPS position.

To add a sign: put its id, name and mounting spot (lat/lng, from Google Maps with a long-press) in `tools/signs.json`, run `make_qr.py`, then print `sign.html?sign=<id>`.

## Managing slots (admin page)

Admins sign in at `admin.html` with an email and password. **Forgot password?** emails a reset link, which Firebase sends.

- **Add:** tap **+ Add slots**, tap the kerb edge where the slots start, then where they end. The page fills the row with 5.2 × 2.3 m slots on the road side and fills in the street name. Type who booked them and **Save**. **Flip side** puts the row on the other side if it guessed wrong.
- **Edit or delete:** tap any slot, change the booker, street or **booking end date**, then **Save** or **Delete**.
- **Update many at once:** tap **⬇ Template** to download all slots as a CSV file. Edit it in Excel, save it as *CSV UTF-8*, then use **⬆ Upload**. The page shows exactly what will change, lists any row errors (unknown slot number, unreadable date), and only saves after you tap **Apply**. Slots are matched by number, and an empty cell clears that value. New slots have to be drawn with **Add slots**, because a file has no kerb position.

**Booking end dates:** a slot is **booked** (solid red) until its end date and **available to book** (red outline) after it, or when it has no booker. Citizens see "Booked by … until 2 February 2028 · Available again from 3 February 2028".
- Every change is recorded in Firestore's `history` collection (who, what, when).
- `admin.html?demo` works without signing in, for training. Changes made in demo mode are not saved.

**Adding another admin:**
1. In Firebase, go to Authentication → Users → **Add user**.
2. Add their email to the list in [`firestore.rules`](firestore.rules).
3. Paste the updated rules into Firestore → Rules and **Publish**.

## Cost: none

| Part | Tool | Free allowance |
|---|---|---|
| Streets | OpenStreetMap (Overpass API) | open data, ODbL |
| Buildings | Microsoft Global ML Building Footprints | open data, ODbL |
| Map display | Leaflet and leaflet-textpath | open source |
| Hosting | GitHub Pages | free for public repos |
| Sign-in and slot storage | Firebase Spark plan (Auth and Firestore) | 50,000 map views a day, never pauses |
| QR codes | `qrcode` Python library | open source |

The public map reads all slots in **one** Firestore request. If Firebase is unreachable, it falls back to the copy in `data/slots.geojson`.

## Files

```
index.html, app.js              public map
admin.html, admin.js            admin page (sign-in, add / edit / delete)
basemap.js, style.css           shared by both pages
config.js                       Firebase project settings (public by design)
firestore.rules                 who may read and write (paste into the Firebase console)
data/district.geojson           map area outline
data/streets|buildings|labels   base map
data/slots.geojson              demo slots / offline backup
qr.png, qr.svg, qr/<sign>.svg   QR codes
sign.html                       printable A4 sign
tools/                          scripts that rebuild the data
```

## Rebuilding the base map (optional)

```bash
cd tools
python3 -m venv .venv && .venv/bin/pip install shapely "qrcode[pil]"
./fetch_osm.sh                      # district outline + streets from OpenStreetMap
.venv/bin/python make_district.py   # district = Al Nozha + New Al Nozha + Sheraton − airport + Joseph Tito
# download the Microsoft footprint tile for Egypt quadkey 122121122 as ms_tile.csv.gz
.venv/bin/python filter_ms.py       # buildings inside the district
.venv/bin/python build_data.py      # street surfaces, labels, demo slots
.venv/bin/python make_qr.py [url]   # QR codes: general + one per sign in signs.json
```

`build_data.py` also regenerates the demo slots in `data/slots.geojson`. Once the admin page holds the real slots, that file is only the offline backup.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

Map data © OpenStreetMap contributors, Microsoft. Both are available under the ODbL.
