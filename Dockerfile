FROM python:3.13-slim
WORKDIR /app
RUN useradd --create-home --uid 10001 weather
COPY weathercommons ./weathercommons
COPY public ./public
COPY LICENSE NOTICE README.md ./
RUN mkdir /app/data && chown weather:weather /app/data
USER weather
EXPOSE 8765
HEALTHCHECK --interval=60s --start-period=60s CMD python -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:8765/api/health')); assert d['status'] in ('fresh','aging')"
CMD ["python", "-m", "weathercommons", "serve", "--host", "0.0.0.0"]

