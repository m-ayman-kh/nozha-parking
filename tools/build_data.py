"""Build the map layers for the parking demo.

Inputs  (tools/):  osm_raw.json            streets from OpenStreetMap (Overpass)
                   buildings_raw.geojson   footprints from Microsoft Global ML Building Footprints
Outputs (data/):   streets.geojson   street surfaces as polygons, drawn to real width
                   labels.geojson    street centre lines + Arabic/English names, for labels
                   buildings.geojson
                   slots.geojson     demo paid slots: rectangles on the kerb side of one side
"""
import json, math, random
from collections import Counter
from shapely.geometry import LineString, Polygon, box, mapping, shape
from shapely.ops import unary_union, substring, transform
from shapely.strtree import STRtree

LAT0, LON0 = 30.1000, 31.3432
MX = 111320 * math.cos(math.radians(LAT0))  # metres per degree lon
MY = 110574                                 # metres per degree lat
to_m = lambda x, y, z=None: ((x - LON0) * MX, (y - LAT0) * MY)
to_deg = lambda x, y, z=None: (x / MX + LON0, y / MY + LAT0)

# Full carriageway width in metres, by OSM class
WIDTH = {"trunk": 22, "primary": 20, "secondary": 16, "tertiary": 13,
         "trunk_link": 8, "primary_link": 8, "secondary_link": 8, "tertiary_link": 7,
         "residential": 10, "unclassified": 9, "living_street": 7, "service": 5}
SLOT_LEN, SLOT_W, SLOT_GAP = 5.2, 2.3, 0.6
END_MARGIN = 12  # keep clear of intersections
AREA = transform(to_m, shape(json.load(open("district.geojson"))["geometry"]))  # El Nozha district, see make_district.py

osm = json.load(open("osm_raw.json"))["elements"]
NEAR = AREA.buffer(30)
ways = [w for w in osm if "highway" in w.get("tags", {}) and "geometry" in w
        and NEAR.intersects(transform(to_m, LineString([(p["lon"], p["lat"]) for p in w["geometry"]])))]

# --- streets: polygon surfaces + label lines ---------------------------------
surfaces, labels, way_surface = [], [], {}
for w in ways:
    t = w["tags"]
    line = transform(to_m, LineString([(p["lon"], p["lat"]) for p in w["geometry"]]))
    surfaces.append(line.buffer(WIDTH[t["highway"]] / 2, cap_style="round", join_style="round"))
    way_surface[w["id"]] = surfaces[-1]
    if t["highway"] != "service" and t.get("name"):
        labels.append({"type": "Feature",
                       "properties": {"ar": t["name"], "en": t.get("name:en", t["name"]), "cls": t["highway"]},
                       "geometry": line.simplify(1).intersection(AREA)})

road = unary_union(surfaces).intersection(AREA).simplify(0.3)
streets = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "properties": {}, "geometry": mapping(transform(to_deg, road))}]}

# --- buildings: drop anything that overlaps the street surface ----------------
bld = []
for f in json.load(open("buildings_raw.geojson"))["features"]:
    g = transform(to_m, shape(f["geometry"]))
    if g.area > 25 and g.intersection(road).area < 0.3 * g.area:
        bld.append({"type": "Feature", "properties": {}, "geometry": mapping(transform(to_deg, g.simplify(0.4)))})

# --- slots: split ways at intersections, fill chosen stretches ---------------
key = lambda p: (round(p["lon"], 7), round(p["lat"], 7))
node_use = Counter(key(p) for w in ways for p in w["geometry"])

def stretches(w):
    """Yield the pieces of a way between intersections, in metres."""
    pts, ids = [(p["lon"], p["lat"]) for p in w["geometry"]], [key(p) for p in w["geometry"]]
    start = 0
    for i in range(1, len(ids)):
        if node_use[ids[i]] > 1 or i == len(ids) - 1:
            if i > start:
                yield transform(to_m, LineString(pts[start:i + 1]))
            start = i

# Demo streets: (English name, max stretches to use)
DEMO = {"Al Nozha Street": 3, "Abd Al Aziz Fahmy Street": 3, "Othman Ibn Affan Street": 2,
        "Mohamed Shafik Street": 2, "Nakhla Al Moteaay Street": 2, "Al Doctor Ahmed Amin Street": 2,
        "Ibn Sina Street": 1, "Omar Bakir Street": 1, "Mohamed Ramzy Bek Street": 2,
        "Ali Shalaby Street": 1, "Kamal Al Shafie Street": 1, "Fawzi Al Moteaay Pasha Street": 1,
        "Al Khalifa Al Mansour Street": 1, "Roshdi Pasha Street": 1,
        # New Al Nozha and Sheraton
        "Joseph Tito Street": 3, "Side Joseph Tito Street": 2, "Anqarah Street": 2, "Al Saeqah Street": 2,
        "Khaled Ibn Al Walid Street": 2, "Al Moshir Ahmed Ismail Street": 2, "Abd Al Hamid Badawi Street": 2,
        "Mohamed Kamel Hussein Street": 2, "Al Zohor Street": 1, "Omar Ibn Al Khatab Street": 1,
        "Taha Hussein Axis": 2, "Al Shahid Sayed Zakaria Khalil Street": 2, "Al Hassn Street": 1,
        "Al Madina Al Mnoura Street": 1, "Moustafa Refaat Street": 1}

BOOKERS = [
    ("El Nozha Pharmacy", "صيدلية النزهة"), ("Misr Insurance – Heliopolis branch", "مصر للتأمين – فرع مصر الجديدة"),
    ("Dr. Hany Clinic", "عيادة د. هاني"), ("Nile Bank – ATM & branch", "بنك النيل – فرع وصراف آلي"),
    ("Al Salam Supermarket", "سوبرماركت السلام"), ("Heliopolis Language School", "مدرسة مصر الجديدة للغات"),
    ("Cairo Dental Center", "مركز القاهرة لطب الأسنان"), ("Resident – Building 14", "ساكن – عقار ١٤"),
    ("Resident – Building 27", "ساكن – عقار ٢٧"), ("Resident – Building 8", "ساكن – عقار ٨"),
    ("Al Amal Bakery", "مخبز الأمل"), ("Nozha Fitness Club", "نادي النزهة الرياضي"),
    ("Tech Hub Offices", "مكاتب تك هب"), ("Green Leaf Café", "كافيه الورقة الخضراء"),
    ("Delta Logistics", "دلتا للخدمات اللوجستية"), ("Resident – Building 41", "ساكن – عقار ٤١"),
]

rng = random.Random(7)
by_name = {}
for w in ways:
    n = w["tags"].get("name:en")
    if n in DEMO:
        by_name.setdefault(n, []).append(w)

surface_list = [(w["tags"].get("name:en"), way_surface[w["id"]]) for w in ways]
surface_tree = STRtree([g for _, g in surface_list])

def crosses_other_street(rect, name):
    """True when a slot would sit across a side street, junction or roundabout."""
    return any(surface_list[i][0] != name and rect.intersects(surface_list[i][1])
               for i in surface_tree.query(rect))

# no parking on squares and roundabouts
squares = unary_union([way_surface[w["id"]] for w in ways
                       if "Square" in w["tags"].get("name:en", "") or w["tags"].get("junction") in ("roundabout", "circular")
                       ]).buffer(20)

slots, sid = [], 0
AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
for name, limit in DEMO.items():
    pieces = [(s, w) for w in by_name.get(name, []) for s in stretches(w) if s.length > 2 * END_MARGIN + 4 * SLOT_LEN]
    rng.shuffle(pieces)
    for seg, w in pieces[:limit]:
        half = WIDTH[w["tags"]["highway"]] / 2
        # right-hand kerb (traffic drives on the right); a two-way street gets one side only
        centre = seg.offset_curve(-(half - SLOT_W / 2 - 0.15))
        if centre.is_empty or centre.geom_type != "LineString":
            continue
        usable = centre.length - 2 * END_MARGIN
        count = min(int(usable // (SLOT_LEN + SLOT_GAP)), rng.randint(4, 10))
        start = END_MARGIN + rng.uniform(0, usable - count * (SLOT_LEN + SLOT_GAP))
        for k in range(count):
            a = start + k * (SLOT_LEN + SLOT_GAP)
            piece = substring(centre, a, a + SLOT_LEN)
            rect = piece.buffer(SLOT_W / 2, cap_style="flat", join_style="mitre")
            if not isinstance(rect, Polygon) or rect.is_empty or not AREA.contains(rect) or rect.intersects(squares) or crosses_other_street(rect, name):
                continue
            sid += 1
            if k == 0 or rng.random() < 0.35:  # neighbouring slots usually share a booker
                en, ar = rng.choice(BOOKERS)
            code = f"NZ-{sid:03d}"
            slots.append({"type": "Feature", "properties": {
                "id": code, "id_ar": code.translate(AR_DIGITS).replace("NZ", "نز"),
                "street_en": name, "street_ar": w["tags"]["name"],
                "booked_en": en, "booked_ar": ar},
                "geometry": mapping(transform(to_deg, rect))})

def dump(obj, path):
    def rnd(o):
        if isinstance(o, float): return round(o, 6)
        if isinstance(o, (list, tuple)): return [rnd(x) for x in o]
        if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
        return o
    json.dump(rnd(obj), open(path, "w"), ensure_ascii=False, separators=(",", ":"))

labels = [dict(f, geometry=mapping(transform(to_deg, g)))
          for f in labels for g in getattr(f["geometry"], "geoms", [f["geometry"]])
          if g.geom_type == "LineString" and not g.is_empty]
fc = lambda feats: {"type": "FeatureCollection", "features": feats}
dump(streets, "../data/streets.geojson")
dump(fc(labels), "../data/labels.geojson")
dump(fc(bld), "../data/buildings.geojson")
dump(fc(slots), "../data/slots.geojson")
print(f"{len(bld)} buildings, {len(labels)} labelled streets, {len(slots)} slots")
