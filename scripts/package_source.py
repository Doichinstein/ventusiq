"""Build an inspectable source download without credentials or runtime data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
files = ['README.md','LICENSE','NOTICE','pyproject.toml','Dockerfile','compose.yaml','Caddyfile','.gitignore','.dockerignore',
         'package.json','package-lock.json','vite.config.ts','next.config.ts','drizzle.config.ts','tsconfig.json','cloudflare-env.d.ts','postcss.config.mjs','.npmrc']
paths = [root / name for name in files]
for directory in ['.github','deploy','weathercommons','tests','scripts','docs','public','app','db','drizzle','lib','worker','vendor']:
    paths.extend(p for p in (root / directory).rglob('*') if p.is_file()
                 and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.zip')
                 and p.name != 'source.zip' and not p.is_relative_to(root / 'public/generated'))
destination = root / 'public/source.zip'
with ZipFile(destination,'w',ZIP_DEFLATED,strict_timestamps=False) as archive:
    for path in sorted(set(paths)):
        archive.write(path, 'weather-commons/' + path.relative_to(root).as_posix())
    archive.writestr('weather-commons/.openai/hosting.json', '{"d1":"DB","r2":null}\n')
print(f'{destination}: {destination.stat().st_size:,} bytes; {len(set(paths))} source files')

