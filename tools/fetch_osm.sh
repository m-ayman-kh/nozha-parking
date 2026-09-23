#!/bin/sh
# Download streets for the area in area.json from OpenStreetMap (Overpass API, free)
cd "$(dirname "$0")"
B=$(python3 -c "import json;a=json.load(open('area.json'));print(f\"{a['south']},{a['west']},{a['north']},{a['east']}\")")
Q="[out:json][timeout:90];way[\"highway\"~\"^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|trunk_link|primary_link|secondary_link|tertiary_link)$\"]($B);out geom tags;"
curl -s -A "nozha-parking-map" --data-urlencode "data=$Q" https://overpass-api.de/api/interpreter -o osm_raw.json
