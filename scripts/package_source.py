"""Build an inspectable source download without credentials or runtime data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
files = ['README.md','LICENSE','NOTICE','pyproject.toml','Dockerfile','compose.yaml','Caddyfile','.gitignore','.dockerignore']
paths = [root / name for name in files]
for directory in ['weathercommons','tests','scripts','docs','dist']:
    paths.extend(p for p in (root / directory).rglob('*') if p.is_file()
                 and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.zip')
                 and p.name != 'source.zip')
destination = root / 'dist/source.zip'
with ZipFile(destination,'w',ZIP_DEFLATED) as archive:
    for path in sorted(set(paths)):
        archive.write(path, 'weather-commons/' + path.relative_to(root).as_posix())
print(f'{destination}: {destination.stat().st_size:,} bytes; {len(set(paths))} source files')

