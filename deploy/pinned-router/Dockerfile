# Build and serve graphs with this exact image. Linux amd64 is the tested target.
FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY deploy/pinned-router/requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir --only-binary=:all: --require-hashes -r requirements.txt \
    && useradd --create-home --uid 10001 router \
    && mkdir /data && chown router:router /data
COPY scripts/route-network.py scripts/pinned-router.py scripts/pinned-events.py scripts/route-event.py scripts/route-crosswalk.py scripts/route-review.py /app/scripts/
COPY LICENSE NOTICE /app/
USER 10001:10001
EXPOSE 8766
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD python -c "import json,os,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8766')+'/health',timeout=3)); assert d=={'status':'running','routing_probe':False}"
ENTRYPOINT ["python"]
CMD ["scripts/pinned-router.py", "--from-env"]
