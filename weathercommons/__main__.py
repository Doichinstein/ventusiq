import argparse
import logging
import threading
from pathlib import Path
from .freshness import Policy
from .lane import Collector
from .nws import fetch_alerts
from .server import make_server
from .store import Store


def main():
    parser = argparse.ArgumentParser(description="Weather Commons live alert map and collector")
    parser.add_argument("command", choices=["serve", "collect"], nargs="?", default="serve")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data", type=Path, default=Path("data/weather.sqlite"))
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--once", action="store_true", help="Collect one snapshot, then exit")
    parser.add_argument("--no-collector", action="store_true", help="Serve only; use a separate collector process")
    args = parser.parse_args()
    if args.interval < 30:
        parser.error("NWS recommends no more than one alert request per 30 seconds")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    store = Store(args.data)
    policy = Policy(args.interval)
    collector = Collector(store, fetch_alerts, policy)
    stop = threading.Event()
    if args.once:
        raise SystemExit(0 if collector.tick(force=True) else 1)
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
    server = make_server(store, args.host, args.port, policy)
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


if __name__ == "__main__":
    main()
