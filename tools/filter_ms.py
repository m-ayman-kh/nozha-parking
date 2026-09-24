"""Keep the Microsoft Global ML Building Footprints (ODbL) that fall inside the district."""
import gzip, json
from shapely.geometry import shape
from shapely.prepared import prep

AREA = shape(json.load(open("district.geojson"))["geometry"])
W, S, E, N = AREA.bounds
inside = prep(AREA)
out = []
with gzip.open("ms_tile.csv.gz", "rt") as f:
    for line in f:
        geom = json.loads(line)["geometry"]
        x, y = geom["coordinates"][0][0]
        if W < x < E and S < y < N and inside.contains(shape(geom).centroid):
            out.append({"type": "Feature", "properties": {}, "geometry": geom})
json.dump({"type": "FeatureCollection", "features": out}, open("buildings_raw.geojson", "w"))
print(len(out), "buildings")
