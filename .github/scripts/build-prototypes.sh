#!/usr/bin/env bash
# Builds prototypes into a destination directory, one NN/ per prototype.
#
#   build-prototypes.sh <dest> <base-prefix> [dir ...]
#
# <base-prefix> is the URL path a prototype's assets hang off, WITH a trailing
# slash: "/prototypes/" for the published site, "/prototypes/preview/<slug>/"
# for a branch preview. The prototype's own number is appended, so the base is
# always "<prefix><NN>/" - the same shape vite.config.ts hardcodes, which is
# why a preview needs no config change and the published build is unaffected
# by passing the flag explicitly.
#
# Named directories build only those; none builds every NN-* directory.
#
# A Godot prototype cannot be previewed: its export path is baked into
# project.godot and there is no per-run override, so it is skipped with a
# warning rather than failing a run that was not about it.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: build-prototypes.sh <dest> <base-prefix> [dir ...]" >&2
  exit 2
fi

dest="$1"; shift
prefix="$1"; shift

# Positional rebinding rather than an array: bash 3.2 errors on ${#a[@]} for an
# empty array under `set -u`, and macOS ships bash 3.2.
if [ "$#" -eq 0 ]; then
  set -- [0-9][0-9]-*/
fi

mkdir -p "$dest"
for dir in "$@"; do
  dir="${dir%/}"
  num="${dir%%-*}"
  if [ -f "$dir/package.json" ]; then
    (cd "$dir" && npm ci && npm run build -- --base="${prefix}${num}/")
  elif [ -f "$dir/project.godot" ]; then
    if [ "$prefix" != "/prototypes/" ]; then
      echo "::warning::$dir is a Godot prototype and has no per-run base override, so it is not previewed"
      continue
    fi
    # --import first: a fresh checkout has no .godot/, and the export needs the
    # import cache to exist before it can pack anything.
    (cd "$dir" \
      && mkdir -p dist \
      && godot --headless --import \
      && godot --headless --export-release Web dist/index.html)
  else
    echo "::error::$dir has neither package.json nor project.godot, so it cannot be built"
    exit 1
  fi
  mkdir -p "$dest/$num"
  cp -R "$dir/dist/." "$dest/$num/"
done
