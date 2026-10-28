import argparse
import logging
import threading
from pathlib import Path
from .freshness import Policy
from .lane import Collector
from .nws import fetch_alerts
from .server import make_server
from .store import Store
from .forecast import ForecastService, point_key


def main():
    parser = argparse.ArgumentParser(description="Weather Commons live alert map and collector")
    parser.add_argument("command", choices=["serve", "collect"], nargs="?", default="serve")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data", type=Path, default=Path("data/weather.sqlite"))
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--once", action="store_true", help="Collect one snapshot, then exit")
    parser.add_argument("--no-collector", action="store_true", help="Serve only; use a separate collector process")
    parser.add_argument("--watch", action="append", default=[], metavar="LAT,LON", help="Archive this point's hourly forecasts in the background; repeat for more places")
    args = parser.parse_args()
    if args.interval < 30:
        parser.error("NWS recommends no more than one alert request per 30 seconds")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    store = Store(args.data)
    policy = Policy(args.interval)
    collector = Collector(store, fetch_alerts, policy)
    forecasts = ForecastService(store)
    try:
        points = [point_key(*value.split(",")).split(",") for value in args.watch]
    except (ValueError, TypeError):
        parser.error("Each --watch must contain valid LAT,LON coordinates")
    stop = threading.Event()
    if args.once:
        success = collector.tick(force=True)
        for point in points:
            try:
                forecasts.get(*point)
            except Exception:
                success = False
        raise SystemExit(0 if success else 1)
    forecast_worker = None
    if points and (args.command == "collect" or not args.no_collector):
        forecast_worker = threading.Thread(target=forecasts.run, args=(points, stop), daemon=True)
        forecast_worker.start()
    if args.command == "collect":
        try:
            collector.run(stop)
        except KeyboardInterrupt:
            stop.set()
        return
    worker = None
    if not args.no_collector:
        worker = threading.Thread(target=collector.run, args=(stop,), daemon=True)
        worker.start()
    server = make_server(store, args.host, args.port, policy, forecasts)
    print(f"Weather Commons: http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()
        if worker:
            worker.join(timeout=30)
        if forecast_worker:
            forecast_worker.join(timeout=30)


if __name__ == "__main__":
    main()
