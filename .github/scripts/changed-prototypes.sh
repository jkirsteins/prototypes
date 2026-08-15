#!/usr/bin/env bash
# Prints the NN-* prototype directories this branch changed against main, one
# per line. Empty output means a push that touched no prototype - a docs or CI
# change - and the caller should publish nothing rather than replacing whatever
# preview is currently live.
#
# The merge base is required, not optional: actions/checkout fetches depth 1 by
# default and a shallow checkout has no merge base, which would silently look
# like "nothing changed" on a branch that changed plenty. So it fails loudly.
set -euo pipefail

if ! base="$(git merge-base origin/main HEAD 2>/dev/null)"; then
  echo "::error::no merge base with origin/main - the checkout needs fetch-depth: 0" >&2
  exit 1
fi

git diff --name-only "$base" HEAD \
  | awk -F/ '/^[0-9][0-9]-/ { print $1 }' \
  | sort -u
