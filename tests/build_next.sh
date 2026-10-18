#!/usr/bin/env bash
# Builds a "next version" of the site into $1 for tests/realuse.py: version +0.0.1 and a new hash on
# every photo, as a real photo update would have. The working tree is restored afterwards.
set -euo pipefail
OUT="$1"
cp package.json /tmp/pkg.bak; cp src/data/images.json /tmp/img.bak
trap 'cp /tmp/pkg.bak package.json; cp /tmp/img.bak src/data/images.json' EXIT
node -e "const f='package.json',p=require('./'+f);const v=p.version.split('.');v[2]=+v[2]+1;p.version=v.join('.');require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
node -e "const f='src/data/images.json',j=require('./'+f);for(const k of Object.keys(j)) if(j[k].v) j[k].v=j[k].v.split('').reverse().join('');require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
npm run build >/dev/null
rm -rf "$OUT"; cp -r dist "$OUT"
