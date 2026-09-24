"""Map area = El Nozha district (OSM), cropped to CROP below: Al Nozha + New Al Nozha + Sheraton Al Matar,
minus Cairo Airport, plus a 150 m corridor along Joseph Tito Street (it runs along the edge)."""
import json, math
from shapely.geometry import LineString, Polygon, box, mapping
from shapely.ops import unary_union

ways = {e["id"]: e for e in json.load(open("boundary_raw.json"))["elements"]}
poly = lambda i: Polygon([(p["lon"], p["lat"]) for p in ways[i]["geometry"]])
area = unary_union([poly(701289197), poly(700886448), poly(701660961)]).difference(poly(135896473))

M = 150 / 111320  # 150 m in degrees (close enough at this latitude)
tito = [LineString([(p["lon"], p["lat"]) for p in w["geometry"]])
        for w in json.load(open("osm_raw.json"))["elements"]
        if "Joseph Tito" in w["tags"].get("name:en", "")]
area = unary_union([area] + [t.buffer(M) for t in tito]).simplify(0.00002)
# For now only the western part (Al Nozha, New Al Nozha, west Sheraton) — widen or remove to cover all
CROP = box(31.3225, 30.0800, 31.3870, 30.1330)
area = area.intersection(CROP)
json.dump({"type": "Feature", "properties": {"name_ar": "حي النزهة", "name_en": "El Nozha District"},
           "geometry": mapping(area)}, open("district.geojson", "w"))
print(len(tito), "Joseph Tito ways; bounds", [round(b, 4) for b in area.bounds], area.geom_type)
