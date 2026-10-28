"""Export the standalone UI without requiring Node or shared hosting."""
import argparse
import shutil
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('destination',type=Path,help='New, empty export directory')
args=parser.parse_args()
if args.destination.exists():
    parser.error('Choose a new directory; existing files will not be overwritten')
source=Path(__file__).resolve().parent.parent/'public'
shutil.copytree(source,args.destination)
(args.destination/'config.js').write_text('window.WEATHER_CONFIG = {mode: "direct"};\n')
print(args.destination.resolve())
