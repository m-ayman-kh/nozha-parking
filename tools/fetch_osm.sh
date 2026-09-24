#!/bin/sh
# Download the El Nozha district outline and its streets from OpenStreetMap (Overpass API, free)
cd "$(dirname "$0")"
# district = Al Nozha + New Al Nozha + Sheraton Al Matar; Cairo Airport is cut out in build_data.py
curl -s -A "nozha-parking-map" --data-urlencode 'data=[out:json];(way(701289197);way(700886448);way(701660961);way(135896473););out geom tags;' \
  https://overpass-api.de/api/interpreter -o boundary_raw.json
Q='[out:json][timeout:180];way["highway"~"^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|trunk_link|primary_link|secondary_link|tertiary_link)$"](30.0786,31.3241,30.1412,31.4651);out geom tags;'
curl -s -A "nozha-parking-map" --data-urlencode "data=$Q" https://overpass-api.de/api/interpreter -o osm_raw.json
