"""Clip Microsoft Global ML Building Footprints (ODbL) to the demo bbox."""
import gzip, json
from shapely.geometry import shape, box

A = json.load(open("area.json"))
AREA = box(A["west"], A["south"], A["east"], A["north"])
out = []
with gzip.open("ms_tile.csv.gz", "rt") as f:
    for line in f:
        feat = json.loads(line)
        g = shape(feat["geometry"])
        if AREA.contains(g.centroid):
            out.append({"type": "Feature", "properties": {}, "geometry": feat["geometry"]})
json.dump({"type": "FeatureCollection", "features": out}, open("buildings_raw.geojson", "w"))
print(len(out), "buildings")
