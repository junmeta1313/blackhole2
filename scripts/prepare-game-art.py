"""Optimize the user-supplied reference ZIP; runtime never needs Pillow or this ZIP."""
import sys
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
from PIL import Image, ImageChops, ImageDraw, ImageFilter

source = ZipFile(sys.argv[1])
output = Path(__file__).resolve().parents[1] / 'assets/game/station-defense/art'
output.mkdir(parents=True, exist_ok=True)

def export(name, filename, size, box=None, seed=None):
    image = Image.open(BytesIO(source.read('event_horizon_reference_set/' + filename)))
    if seed:
        alpha = image.getchannel('A')
        connected = alpha.point(lambda value: 255 if value > 32 else 0)
        ImageDraw.floodfill(connected, seed, 128)
        connected = connected.point(lambda value: 255 if value == 128 else 0)
        connected = connected.filter(ImageFilter.MaxFilter(25))
        image.putalpha(ImageChops.multiply(alpha, connected))
    if box:
        image = image.crop(box)
    if image.mode == 'RGBA':
        image = image.crop(image.getchannel('A').getbbox())
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    image.save(output / (name + '.webp'), 'WEBP', quality=88, method=6)

export('hero', '01_mood_black_hole.png', 1500)
export('background', '03_combat_background.png', 1700)
export('station', '04_station.png', 512)
export('player', '05_player_interceptor.png', 256)
export('scout', '06_enemies_scout_rusher.png', 256, seed=(270, 650))
export('rusher', '06_enemies_scout_rusher.png', 256, seed=(970, 600))
export('tank', '07_enemies_tanker_shooter_shield.png', 320, seed=(380, 400))
export('shooter', '07_enemies_tanker_shooter_shield.png', 256, seed=(970, 400))
export('shield', '07_enemies_tanker_shooter_shield.png', 320, seed=(640, 950))
export('boss', '08_boss_void_dreadnought.png', 768)
print(f'Optimized assets: {sum(p.stat().st_size for p in output.glob("*.webp")):,} bytes')
