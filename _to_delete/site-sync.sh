#!/bin/bash
# One-shot site update: pull, refresh caches (fetches the new post), verify,
# commit, push (deploy runs via GitHub Actions; wrangler deploy also attempted).
# Written by Claude (Cowork session). Safe to delete after the update.
SLUG="other-large-industries-show-how-impoverished"
cd "$HOME/andymasley-site" || exit 1
set -x

git pull origin main || { echo "FAIL: git pull"; exit 1; }

# Force a fresh copy of the AI-and-environment hub post (theme lists parse from it).
mv .cache/substack/content/ai-and-the-environment.html _to_delete/ai-and-the-environment.cache.bak.html

npm run build || { echo "FAIL: build"; exit 1; }

# If the hub refetch failed, restore the old copy and rebuild.
HUB=.cache/substack/content/ai-and-the-environment.html
if [ ! -s "$HUB" ] || [ "$(wc -c < "$HUB")" -lt 10000 ]; then
  echo "WARN: hub post refetch failed; restoring previous copy"
  cp _to_delete/ai-and-the-environment.cache.bak.html "$HUB"
  npm run build || { echo "FAIL: rebuild after hub restore"; exit 1; }
fi

# The new post must be in the refreshed cache and the built site.
grep -q "\"$SLUG\"" .cache/substack/posts.json || { echo "FAIL: $SLUG not in posts.json"; exit 1; }
[ -s ".cache/substack/content/$SLUG.html" ] || { echo "FAIL: no cached content for $SLUG"; exit 1; }
[ "$(wc -c < ".cache/substack/content/$SLUG.html")" -ge 5000 ] || { echo "FAIL: cached content for $SLUG suspiciously small"; exit 1; }
[ -s "dist/writing/$SLUG/index.html" ] || { echo "FAIL: post page missing from dist"; exit 1; }

npm test || { echo "FAIL: tests"; exit 1; }

git status --short .cache

git add .cache
git commit -m "Refresh Substack and EA Forum caches: add $SLUG" -m "Substack blocks CI runner IPs, so the committed cache is what deploy
builds read. This adds the new post's content cache and the refreshed
posts lists so it appears on the site.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018FjbLiKPrghm2iKvVTEKg3" || { echo "FAIL: commit"; exit 1; }

git push origin main || { echo "FAIL: push (commit is local only; nothing deployed)"; exit 1; }

# Best-effort direct deploy; the push above also triggers the Actions deploy.
/opt/homebrew/bin/wrangler pages deploy dist --project-name=andymasley-site || echo "WARN: wrangler deploy failed; GitHub Actions will deploy from the push"

git log -1 --stat | head -25
echo "ALL-DONE"
