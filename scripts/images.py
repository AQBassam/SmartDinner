#!/usr/bin/env python3
"""Recipe photo pipeline.

Put one source image per recipe in a folder, named by the recipe id
(shawarma.jpg, lentil_soup.png, ...), plus a credits.json:

  {
    "shawarma": {"credit": "تصوير: ...", "license": "مملوكة لصاحب الموقع", "ai": false},
    "lentil_soup": {"credit": "مولدة بـ Gemini", "license": "استخدام خاص بالموقع", "ai": true}
  }

Run:  python3 scripts/images.py photos/
Writes public/recipes/<id>-card.webp (800x600) and <id>-hero.webp (1600x1200),
centre-cropped to 4:3, and records each one in src/data/images.json.
Images whose id is not a recipe, or that have no credits entry, are refused.
"""
import argparse, datetime, hashlib, io, json, pathlib, sys
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIZES = {'card': (800, 600, 78), 'hero': (1600, 1200, 80)}
EXTS = ('.jpg', '.jpeg', '.png', '.webp')


def crop_4_3(im: Image.Image) -> Image.Image:
    w, h = im.size
    target = 4 / 3
    if w / h > target:
        nw = round(h * target)
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = round(w / target)
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('src', type=pathlib.Path)
    ap.add_argument('--out', type=pathlib.Path, default=ROOT / 'public' / 'recipes')
    ap.add_argument('--registry', type=pathlib.Path, default=ROOT / 'src' / 'data' / 'images.json')
    args = ap.parse_args()

    recipes = {r['id'] for r in json.loads((ROOT / 'src/data/recipes.json').read_text(encoding='utf-8'))['recipes']}
    credits_file = args.src / 'credits.json'
    if not credits_file.exists():
        print(f'missing {credits_file}', file=sys.stderr)
        return 1
    credits = json.loads(credits_file.read_text(encoding='utf-8'))
    registry = json.loads(args.registry.read_text(encoding='utf-8')) if args.registry.exists() else {}
    args.out.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    problems = 0

    for f in sorted(args.src.iterdir()):
        if f.suffix.lower() not in EXTS:
            continue
        rid = f.stem
        if rid not in recipes:
            print(f'skip {f.name}: no recipe with id "{rid}"'); problems += 1; continue
        c = credits.get(rid)
        if not c or not {'credit', 'license', 'ai'} <= c.keys():
            print(f'skip {f.name}: credits.json needs credit, license and ai for "{rid}"'); problems += 1; continue
        im = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
        if min(im.size) < 600:
            print(f'warn {f.name}: only {im.size[0]}x{im.size[1]}px; 1600px wide or more looks best')
        im = crop_4_3(im)
        digest = hashlib.sha256()
        sizes = []
        for variant, (w, h, q) in SIZES.items():
            buf = io.BytesIO()
            im.resize((w, h), Image.LANCZOS).save(buf, 'WEBP', quality=q, method=6)
            data = buf.getvalue()
            (args.out / f'{rid}-{variant}.webp').write_bytes(data)
            digest.update(data)
            sizes.append(f'{variant} {len(data) // 1024} KB')
        registry[rid] = {'v': digest.hexdigest()[:8], 'credit': str(c['credit']), 'license': str(c['license']),
                         'ai': bool(c['ai']), 'added': registry.get(rid, {}).get('added', today)}
        print(f'ok   {rid}: ' + ', '.join(sizes))

    args.registry.write_text(json.dumps(dict(sorted(registry.items())), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    missing = sorted(recipes - registry.keys())
    print(f'\n{len(registry)}/{len(recipes)} recipes have photos.' + (f' Missing: {", ".join(missing)}' if missing else ''))
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
