"""NWS GeoJSON adapter. No API key; only trusted NWS URLs are fetched."""
import json
import os
import re
from urllib.request import Request, urlopen
from urllib.parse import urlparse

BASE = "https://api.weather.gov"
ZONE = re.compile(r"^/(?:api/)?zones/(county|forecast|fire|coastal|offshore)/(\w{6})$")


def fetch_json(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != "api.weather.gov":
        raise ValueError("Only official NWS API URLs are permitted")
    req = Request(url, headers={
        "User-Agent": os.getenv("NWS_USER_AGENT", "WeatherCommons/0.1 (self-hosted open-source alert map)"),
        "Accept": "application/geo+json",
    })
    with urlopen(req, timeout=25) as response:
        return json.load(response)


def validate(payload):
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise ValueError("NWS response is not a GeoJSON FeatureCollection")
    for feature in payload["features"]:
        if not isinstance(feature, dict) or not feature.get("id") or not isinstance(feature.get("properties"), dict):
            raise ValueError("NWS returned an invalid alert; preserving previous snapshot")
    return payload


def fetch_alerts():
    url = BASE + "/alerts/active?status=actual"
    features, seen = {}, set()
    updated = None
    while url:
        if url in seen or len(seen) >= 20:
            raise ValueError("Unexpected NWS pagination loop")
        seen.add(url)
        data = validate(fetch_json(url))
        updated = data.get("updated", updated)
        for f in data["features"]:
            p = f["properties"]
            if p.get("status") == "Actual" and p.get("messageType") != "Cancel":
                features[f["id"]] = f
        url = data.get("pagination", {}).get("next")
    return {"type": "FeatureCollection", "features": list(features.values()), "updated": updated}

