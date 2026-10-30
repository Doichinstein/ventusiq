"""Build and exercise the real pinned-router container on a Docker Linux amd64 host.

No remote host is provisioned. Resources created by this check are removed on exit.
"""
import argparse
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("router_check", ROOT / "scripts/check-pinned-router.py")
integration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(integration)


def docker(*args, env=None, timeout=300):
    result = subprocess.run(["docker", *args], cwd=ROOT, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, timeout=timeout, check=False)
    if result.returncode:
        # Secrets are supplied through env names, never arguments or build inputs.
        raise RuntimeError("Docker operation failed: " + result.stderr[-8000:])
    return result.stdout.strip()


def request(port, method, path, token=None, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = "Bearer " + token
    try:
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = conn.getresponse()
        return response.status, json.loads(response.read())
    finally:
        conn.close()


def check():
    suffix = uuid.uuid4().hex[:12]
    image, volume, name = ("ventusiq-router-check-" + suffix + part for part in (":test", "-data", "-server"))
    fixture = ROOT / "tests/fixtures/route-network"
    provenance = json.loads((fixture / "source.json").read_text())
    if hashlib.sha256((fixture / "sioux-center-roads.osm.pbf").read_bytes()).hexdigest() != provenance["pbf_sha256"]:
        raise ValueError("Research input differs from its retained source")
    token = secrets.token_urlsafe(32)
    try:
        docker("build", "--platform", "linux/amd64", "-f", "deploy/pinned-router/Dockerfile", "-t", image, ".", timeout=600)
        image_info = json.loads(docker("image", "inspect", image))[0]
        docker("volume", "create", volume)
        # No credentials are passed to the image build or graph builder.
        manifest = json.loads(docker("run", "--rm", "--network", "none", "--mount", f"type=volume,source={volume},target=/data",
            "--mount", f"type=bind,source={fixture},target=/input,readonly", image,
            "scripts/route-network.py", "build", "/input/sioux-center-roads.osm.pbf", "--output", "/data/graph",
            "--source-url", provenance["source"], "--source-license", provenance["license"]))
        pin = manifest["graph_sha256"]
        env = {**os.environ, "VENTUSIQ_PINNED_ROUTER_TOKEN": token, "VENTUSIQ_PINNED_GRAPH_SHA256": pin,
               "VENTUSIQ_PINNED_ROUTER_BOUNDS": "-96.20 43.04 -96.15 43.11", "PORT": "9080"}
        docker("run", "--detach", "--name", name, "--read-only", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges", "--pids-limit", "128", "--memory", "1g", "--cpus", "2",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--mount", f"type=volume,source={volume},target=/data,readonly",
            "--publish", "127.0.0.1::9080", "--env", "PORT", "--env", "VENTUSIQ_PINNED_ROUTER_TOKEN",
            "--env", "VENTUSIQ_PINNED_GRAPH_SHA256", "--env", "VENTUSIQ_PINNED_ROUTER_BOUNDS", image, env=env)
        port = int(docker("port", name, "9080/tcp").rsplit(":", 1)[1])
        deadline = time.monotonic() + 100
        while True:
            state = json.loads(docker("inspect", name))[0]["State"]
            if not state["Running"]:
                raise RuntimeError("Router exited during startup: " + docker("logs", name)[-2000:])
            if state.get("Health", {}).get("Status") == "healthy":
                break
            if time.monotonic() > deadline:
                raise RuntimeError("Container healthcheck did not pass within 100 seconds")
            time.sleep(2)
        if request(port, "GET", "/health") != (200, {"status": "running", "routing_probe": False}):
            raise ValueError("Health endpoint did not preserve the liveness-only contract")
        if request(port, "POST", "/route", token="wrong", body={"points": []})[0] != 401:
            raise ValueError("Unauthenticated routing was accepted")
        if request(port, "POST", "/route", token=token, body={"points": [[0, 0], [0, 1]]})[0] != 400:
            raise ValueError("Out-of-coverage routing was accepted")
        result = integration.check_endpoint("127.0.0.1", port, token, pin)
        if token in docker("logs", name):
            raise ValueError("Router logged its bearer secret")
        # The service must not modify the mounted graph; the same pin still verifies.
        verified = json.loads(docker("run", "--rm", "--network", "none", "--read-only",
            "--mount", f"type=volume,source={volume},target=/data,readonly", image,
            "scripts/route-network.py", "verify", "/data/graph", "--expected-graph-sha256", pin))
        docker("stop", "--time", "10", name)
        stopped = json.loads(docker("inspect", name))[0]["State"]
        if stopped["ExitCode"] != 0 or stopped["OOMKilled"]:
            raise ValueError("Container did not stop cleanly")
        return {"status": "passed", "image_id": image_info["Id"], "platform": "linux/amd64",
                "image_user": image_info["Config"]["User"], "graph_sha256": verified["graph_sha256"],
                "read_only_runtime": True, "custom_port": 9080, "healthcheck": "passed, liveness only",
                "authentication_and_coverage": "passed", "graceful_stop": "passed",
                "cases": [case["summary"] for case in result["cases"]],
                "closure_attribution_verified": False, "public_provider_changed": False}
    finally:
        # Names are fresh UUID-derived resources owned by this check, never user resources.
        for args in [("rm", "--force", name), ("volume", "rm", volume), ("image", "rm", image)]:
            subprocess.run(["docker", *args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", help="New evidence file; optional")
    args = parser.parse_args()
    result = check()
    if args.output:
        with Path(args.output).open("x", encoding="utf8") as stream:
            json.dump(result, stream, indent=2)
    print(json.dumps(result, indent=2))
