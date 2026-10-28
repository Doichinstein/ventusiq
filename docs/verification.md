# Verification record

Date: 2026-10-28. This record distinguishes executed checks from deployment recipes.

## Executed

- Python 3.13: `python -m unittest discover -s tests -v` — 11 passing tests.
  Covers collection cadence across restart, empty successful feeds, malformed
  responses, failure/backoff/recovery, preservation of last good state, pagination,
  event lifecycle labeling, retention, historical reads, HTTP routes, and path boundaries.
- Node: `node --test tests/frontend.test.cjs` — 7 passing offline behavior tests.
  Covers live rendering into a DOM test double, search/severity filters, text-only
  official descriptions, selection, outage presentation, expiration/test filtering,
  daemon mode, session replay, and asynchronous replay/return-to-live ordering.
- `node --check dist/app.js` and Python byte compilation passed.
- Real NWS feed collected successfully through the daemon. At verification it
  contained 314 alerts; multiple scheduled collections produced persistent history.
- Live HTTP `/api/health` reported fresh data with no collection error.
- Live `/api/alerts` and `/api/history` returned collected alerts and snapshots.
- An alert without a polygon resolved to a real NWS MultiPolygon via the cached
  `/api/zones/...` endpoint.
- The NWS active feed returned `Access-Control-Allow-Origin: *`, supporting the
  static browser mode. This check does not prove browser execution.

## Verification limits

- Browser visual/interaction verification is incomplete. The browser tool denied
  opening the local preview; after the user authorized a retry, the tool reported
  a saved permission or managed policy still blocked the origin. No alternate
  browser mechanism was used. Offline DOM/map test doubles do not verify real
  Leaflet rendering, responsive layout, or browser integrations.
- Docker/Caddy recipes have not been run on this host (Docker is unavailable).
- No custom domain has been purchased or configured.
- Real replay begins with actual collection; no synthetic 24-hour archive is
  presented. Static hosting retains only the open tab's session history.

## Operational limits

- Official zones load lazily, at most four concurrently, and may take time on a
  cold cache. The map reports alerts awaiting boundaries. Opening an alert shows
  how many of its zones have loaded. Some alerts have no supplied geometry/zones.
- Source availability is external. Failed collections keep the last successful
  snapshot, visibly labeled delayed. An active-feed removal is not proof of cancellation.
- The shared daemon is designed for one collector and a modest public service
  behind a reverse proxy. Configure map tiles and hosting capacity for your traffic.
