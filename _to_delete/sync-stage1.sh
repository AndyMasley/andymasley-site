#!/bin/bash
# Stage 1 of site update: pull, refresh Substack/EA Forum caches via build, test.
# Written by Claude (Cowork session) — safe to delete after the update.
set -x
cd "$HOME/andymasley-site" || exit 1
git pull origin main
echo "PULL-EXIT:$?"
# Force a fresh fetch of the AI-and-environment hub post (theme lists parse from it);
# original kept as a backup in _to_delete/ in case the refetch fails.
mv .cache/substack/content/ai-and-the-environment.html _to_delete/ai-and-the-environment.cache.bak.html
npm run build
echo "BUILD-EXIT:$?"
npm test
echo "TEST-EXIT:$?"
git status --short
echo "SYNC-STAGE1-DONE"
