#!/usr/bin/env bash
# Release notes = this version's section of CHANGELOG.md + the CI test summary.
set -euo pipefail
V="$1"
awk -v v="$V" '$0 ~ "^## \\[" v "\\]" {on=1; next} on && /^## \[/ {exit} on' CHANGELOG.md
echo
cat test-results/summary.md 2>/dev/null || echo "نتائج الاختبارات غير متوفرة."
cat <<NOTE

### التثبيت على الخادم
راجع [deploy/DEPLOY.md](https://github.com/${GITHUB_REPOSITORY:-AQBassam/SmartDinner}/blob/main/deploy/DEPLOY.md) مع \`V=$V\`.
NOTE
