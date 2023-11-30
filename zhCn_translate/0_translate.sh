#!/usr/bin/env sh

cd ../translator || exit

npx ts-node-esm index.ts ./guides/bucketed-leaderboards/index.md