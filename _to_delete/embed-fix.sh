#!/bin/bash
# Replace the broken OWID code embed with a committed static figure:
# download the chart, test, build, commit, push, deploy.
# Written by Claude (Cowork session). Safe to delete after the update.
cd "$HOME/andymasley-site" || exit 1
set -x

# Clear the stale index.lock my sandboxed git commands left behind
# (the sandbox can write into this folder but cannot delete files).
rm -f .git/index.lock

git pull origin main || { echo "FAIL: git pull"; exit 1; }

mkdir -p public/img/embeds
IMG=public/img/embeds/us-primary-energy-1965-2025.png
curl -fL --retry 2 "https://ourworldindata.org/grapher/primary-energy-cons.png?tab=line&time=1965..2025&country=~USA&imWidth=1700" -o "$IMG" || { echo "FAIL: image download"; exit 1; }
[ "$(head -c 4 "$IMG" | xxd -p)" = "89504e47" ] || { echo "FAIL: downloaded file is not a PNG"; head -c 300 "$IMG"; exit 1; }
[ "$(wc -c < "$IMG")" -ge 20000 ] || { echo "FAIL: PNG suspiciously small"; exit 1; }
sips -g pixelWidth -g pixelHeight "$IMG"

npm test || { echo "FAIL: tests"; exit 1; }
REQUIRE_CONTENT=1 npm run build || { echo "FAIL: build"; exit 1; }

POST=dist/writing/other-large-industries-show-how-impoverished/index.html
grep -q "substackcode" "$POST" && { echo "FAIL: broken embed still present in built page"; exit 1; }
grep -q "img/embeds/us-primary-energy-1965-2025.png" "$POST" || { echo "FAIL: replacement figure missing from built page"; exit 1; }

git add src/data/embeds.ts src/lib/substack.ts src/lib/__tests__/embed-replacements.test.ts "$IMG"
git commit -m "Replace the broken OWID code embed with a committed static figure" -m "The Substack code embed in other-large-industries-show-how-impoverished
renders only on Substack; on this site it showed an error box. This adds
a build-time replacement keyed slug + embed UUID (src/data/embeds.ts,
same convention as alt-text and fullwidth figures), swapping the iframe
for a committed PNG of the same OWID chart with full alt text and a
Source link to the interactive original. The raw cache stays untouched,
so a cache refresh cannot undo the fix. With tests.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018FjbLiKPrghm2iKvVTEKg3" || { echo "FAIL: commit"; exit 1; }

git push origin main || { echo "FAIL: push (commit is local only; nothing deployed)"; exit 1; }

/opt/homebrew/bin/wrangler pages deploy dist --project-name=andymasley-site || echo "WARN: wrangler deploy failed; GitHub Actions will deploy from the push"

git log -1 --stat | head -12
echo "ALL-DONE"
