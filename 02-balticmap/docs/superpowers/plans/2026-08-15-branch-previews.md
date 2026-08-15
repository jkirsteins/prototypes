# Branch Previews on GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A push to any branch except main publishes that branch's changed
prototypes to `https://jkirsteins.github.io/prototypes/preview/<slug>/NN/`
without changing what `/prototypes/NN/` serves.

**Architecture:** The Pages deploy stays on the artifact mechanism
(`upload-pages-artifact` + `deploy-pages`), which publishes one artifact as the
whole site. Every run therefore assembles the whole site: main's tree, built
from a worktree of `origin/main` and cached against main's SHA, plus - on a
branch - the changed prototypes rebuilt with an overridden Vite `base` and
copied under `preview/<slug>/`. The build loop moves out of the workflow into
two shell scripts so it can be run and checked locally.

**Tech Stack:** GitHub Actions, `actions/checkout@v4`, `actions/cache@v4`,
`actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`, bash, Vite 5,
Godot 4.7.1 headless export.

**Spec:** `02-balticmap/docs/superpowers/specs/2026-08-15-run-structure-attack-design.md`,
section A.

## Global Constraints

- This plan touches REPO-ROOT files, outside `02-balticmap`: `.github/`, and
  the repo `CLAUDE.md`. Stage with explicit paths, never `git add -A` - several
  sessions work in this repo at once.
- Every prototype's `vite.config.ts` keeps `base: "/prototypes/NN/"` hardcoded.
  The preview override is a `--base` flag at the CI call site and nowhere else.
- Scripts must run under bash 3.2, which is what macOS ships, so they can be
  checked locally before pushing. No `${#array[@]}` on a possibly-empty array
  under `set -u`, no associative arrays, no `mapfile`.
- No branch name reaches a shell through `${{ }}` interpolation. Branch names
  may contain shell metacharacters; pass them through `env:` instead.
- `concurrency: group: pages` is unchanged.
- The slug is the branch name lowercased with every character outside
  `[a-z0-9-]` replaced by `-`.

---

### Task 1: Extract the build loop into a script

The workflow's inline build loop becomes a script that takes a destination and
a base prefix. Main's behaviour is unchanged: the same seven directories, built
the same way, into the same `_site/NN/` paths. Passing `--base=/prototypes/NN/`
explicitly produces exactly what `vite.config.ts` already hardcodes.

**Files:**
- Create: `.github/scripts/build-prototypes.sh`
- Modify: `.github/workflows/pages.yml` (the `Build and assemble prototypes`
  step)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `.github/scripts/build-prototypes.sh <dest> <base-prefix> [dir ...]`.
  `<dest>` is a directory that will hold one `NN/` subdirectory per prototype
  built. `<base-prefix>` is a URL path with a trailing slash; the prototype's
  number and a slash are appended to it to form the Vite `base`. With no
  directories named, every `NN-*` directory is built. Exit status 0 on success,
  1 with a `::error::` line on an unbuildable directory.

- [ ] **Step 1: Write the script**

```bash
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
```

- [ ] **Step 2: Make it executable and run it for one prototype**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
chmod +x .github/scripts/build-prototypes.sh
rm -rf /tmp/site-check
.github/scripts/build-prototypes.sh /tmp/site-check /prototypes/ 02-balticmap
```

Expected: the build runs and `/tmp/site-check/02/index.html` exists.

- [ ] **Step 3: Assert the published base is unchanged**

```bash
grep -c '"/prototypes/02/assets/' /tmp/site-check/02/index.html
```

Expected: a count of 1 or more, and no occurrence of `preview` anywhere in the
file. If this fails, `npm run build -- --base=` is not reaching Vite and the
script is wrong, not the workflow.

- [ ] **Step 4: Assert a preview base changes the asset paths**

```bash
rm -rf /tmp/site-preview
.github/scripts/build-prototypes.sh /tmp/site-preview /prototypes/preview/demo/ 02-balticmap
grep -c '"/prototypes/preview/demo/02/assets/' /tmp/site-preview/02/index.html
```

Expected: a count of 1 or more. This is the whole mechanism the preview rests
on, proven before any workflow YAML is written.

- [ ] **Step 5: Assert a Godot prototype is skipped rather than fatal**

```bash
rm -rf /tmp/site-godot
.github/scripts/build-prototypes.sh /tmp/site-godot /prototypes/preview/demo/ 04-3dtest
echo "exit=$?"
```

Expected: `exit=0` and a `::warning::` line naming `04-3dtest`. No `godot`
binary is needed for this, because the skip happens before the export.

- [ ] **Step 6: Point the workflow at the script**

In `.github/workflows/pages.yml`, replace the body of the
`Build and assemble prototypes` step with:

```yaml
      - name: Build and assemble prototypes
        run: |
          set -euo pipefail
          .github/scripts/build-prototypes.sh _site /prototypes/
          cp .github/pages-index.html _site/index.html
```

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/build-prototypes.sh .github/workflows/pages.yml
git commit -m "ci: the build loop is a script, and the base is an argument to it"
```

---

### Task 2: Detect which prototypes a branch changed

**Files:**
- Create: `.github/scripts/changed-prototypes.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: `.github/scripts/changed-prototypes.sh`, printing zero or more
  `NN-*` directory names one per line, sorted and deduplicated. Exit status 1
  with a `::error::` line when no merge base with `origin/main` exists, which
  is what a shallow checkout looks like.

- [ ] **Step 1: Write the script**

```bash
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
```

- [ ] **Step 2: Make it executable and run it on this branch**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
chmod +x .github/scripts/changed-prototypes.sh
.github/scripts/changed-prototypes.sh
```

Expected: no output. This branch has changed only docs and `.github/`, which is
exactly the case that must publish no preview.

- [ ] **Step 3: Run it against a commit that did touch a prototype**

```bash
git log --oneline -5 -- 02-balticmap/src
```

Take the newest SHA printed, then:

```bash
git diff --name-only "$(git merge-base origin/main <that-sha>)" <that-sha> \
  | awk -F/ '/^[0-9][0-9]-/ { print $1 }' | sort -u
```

Expected: `02-balticmap`. This exercises the same pipeline the script runs, on
history that is known to contain a prototype change.

- [ ] **Step 4: Prove the shallow-checkout failure is loud**

```bash
rm -rf /tmp/shallow && git clone --depth 1 file:///Users/janis.kirsteins/Projects/prototypes /tmp/shallow
cd /tmp/shallow && cp /Users/janis.kirsteins/Projects/prototypes/.github/scripts/changed-prototypes.sh . \
  && bash changed-prototypes.sh; echo "exit=$?"
cd /Users/janis.kirsteins/Projects/prototypes
```

Expected: `exit=1` and the `::error::` line about `fetch-depth: 0`. A shallow
clone of a single branch has no `origin/main` to merge-base against, which is
the CI failure mode this guards.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/changed-prototypes.sh
git commit -m "ci: which prototypes a branch changed, and a loud failure when the history is not there"
```

---

### Task 3: Preview mode in the workflow

Every run now assembles the site the same way: build main's tree from a
worktree of `origin/main` into `main-site/` (cached against main's SHA), copy
it to `_site/`, and on a branch add the changed prototypes under
`_site/preview/<slug>/`. A push to main takes the identical path and warms the
cache for the next preview.

**Files:**
- Modify: `.github/workflows/pages.yml` (whole file)

**Interfaces:**
- Consumes: `.github/scripts/build-prototypes.sh` and
  `.github/scripts/changed-prototypes.sh` from tasks 1 and 2.
- Produces: a `build` job output `deploy` (`true`/`false`) that the `deploy`
  job gates on, and a preview URL in the job summary.

- [ ] **Step 1: Replace the triggers and add the input**

```yaml
on:
  # Every branch, not only main: a push to a branch publishes that branch's
  # changed prototypes under preview/<slug>/ beside main's site. A push that
  # touches no prototype publishes nothing at all, so a docs commit does not
  # replace a preview somebody is playing.
  push:
  workflow_dispatch:
    inputs:
      prototypes:
        description: "Prototype directories to preview, space separated. Empty means whatever this branch changed against main."
        required: false
        default: ""
```

- [ ] **Step 2: Give the build job its output and a deep checkout**

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      deploy: ${{ steps.mode.outputs.deploy }}
    steps:
      - uses: actions/checkout@v4
        with:
          # The merge base is what changed-prototypes.sh diffs against, and the
          # default depth of 1 does not have one.
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: "**/package-lock.json"
```

- [ ] **Step 3: Add the mode step**

Insert directly after `setup-node`. The branch name and the dispatch input
arrive through `env` rather than `${{ }}` interpolation, because a branch name
is attacker-controlled text and interpolation would put it inside the shell.

```yaml
      - name: Decide what this run publishes
        id: mode
        env:
          REF_NAME: ${{ github.ref_name }}
          INPUT_PROTOTYPES: ${{ inputs.prototypes }}
        run: |
          set -euo pipefail
          echo "sha=$(git rev-parse origin/main)" >> "$GITHUB_OUTPUT"
          if [ "$REF_NAME" = "main" ]; then
            echo "preview=false" >> "$GITHUB_OUTPUT"
            echo "deploy=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          slug=$(printf '%s' "$REF_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')
          dirs="$INPUT_PROTOTYPES"
          if [ -z "$dirs" ]; then
            dirs=$(.github/scripts/changed-prototypes.sh | tr '\n' ' ')
          fi
          if [ -z "${dirs// /}" ]; then
            echo "::notice::no prototype changed on $REF_NAME, so nothing is published"
            echo "preview=false" >> "$GITHUB_OUTPUT"
            echo "deploy=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "preview=true" >> "$GITHUB_OUTPUT"
          echo "deploy=true" >> "$GITHUB_OUTPUT"
          echo "slug=$slug" >> "$GITHUB_OUTPUT"
          echo "dirs=$dirs" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 4: Gate everything after it on `deploy`**

Add `if: steps.mode.outputs.deploy == 'true'` to every remaining step in the
`build` job, and give the `deploy` job:

```yaml
  deploy:
    needs: build
    if: needs.build.outputs.deploy == 'true'
```

- [ ] **Step 5: Cache main's tree and build it on a miss**

Replace the Godot detection step and the build step with this sequence. The
Godot steps move below the worktree because what matters is whether MAIN has
Godot prototypes, and main is what the worktree holds.

```yaml
      - name: Restore main's built tree
        id: mainsite
        if: steps.mode.outputs.deploy == 'true'
        uses: actions/cache@v4
        with:
          path: main-site
          key: site-main-${{ steps.mode.outputs.sha }}
      - name: Check out main beside the branch
        if: steps.mode.outputs.deploy == 'true' && steps.mainsite.outputs.cache-hit != 'true'
        run: git worktree add --detach main-tree origin/main
      - name: Detect Godot prototypes on main
        id: godot
        if: steps.mode.outputs.deploy == 'true' && steps.mainsite.outputs.cache-hit != 'true'
        run: |
          if ls main-tree/[0-9][0-9]-*/project.godot >/dev/null 2>&1; then
            echo "needed=true" >> "$GITHUB_OUTPUT"
          else
            echo "needed=false" >> "$GITHUB_OUTPUT"
          fi
```

Keep the three existing Godot steps (`Cache Godot`, `Install Godot`,
`Put Godot on PATH`) exactly as they are, but change each `if:` to:

```yaml
        if: steps.mode.outputs.deploy == 'true' && steps.mainsite.outputs.cache-hit != 'true' && steps.godot.outputs.needed == 'true'
```

(`Install Godot` keeps its extra `&& steps.godot-cache.outputs.cache-hit != 'true'`.)

Then the main-tree build:

```yaml
      - name: Build main's tree
        if: steps.mode.outputs.deploy == 'true' && steps.mainsite.outputs.cache-hit != 'true'
        run: |
          set -euo pipefail
          (cd main-tree \
            && "$GITHUB_WORKSPACE/.github/scripts/build-prototypes.sh" \
                 "$GITHUB_WORKSPACE/main-site" /prototypes/)
          cp main-tree/.github/pages-index.html main-site/index.html
```

- [ ] **Step 6: Assemble and add the preview**

```yaml
      - name: Assemble the site
        if: steps.mode.outputs.deploy == 'true'
        env:
          SLUG: ${{ steps.mode.outputs.slug }}
          DIRS: ${{ steps.mode.outputs.dirs }}
        run: |
          set -euo pipefail
          mkdir -p _site
          cp -R main-site/. _site/
          if [ "${{ steps.mode.outputs.preview }}" != "true" ]; then exit 0; fi
          # shellcheck disable=SC2086 - DIRS is a space-separated list on purpose
          .github/scripts/build-prototypes.sh \
            "_site/preview/$SLUG" "/prototypes/preview/$SLUG/" $DIRS
          {
            echo "### Preview"
            for dir in $DIRS; do
              num="${dir%%-*}"
              echo "- https://jkirsteins.github.io/prototypes/preview/$SLUG/$num/"
            done
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 7: Check the file parses as YAML**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pages.yml')); print('ok')"
```

Expected: `ok`. A workflow that does not parse fails with no useful message in
the Actions UI, so this is worth catching locally.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: a branch publishes itself beside main, and main's tree is cached under it"
```

---

### Task 4: Write down how to use it

**Files:**
- Modify: `CLAUDE.md` (repo root, the `Every prototype must be linked from the
  landing page` section is a good neighbour for this)

- [ ] **Step 1: Add the section**

```markdown
## Previewing a branch

A push to any branch except main publishes that branch's changed prototypes to

    https://jkirsteins.github.io/prototypes/preview/<branch-slug>/NN/

beside main's site, which keeps serving `/prototypes/NN/` throughout. The slug
is the branch name lowercased with anything outside `[a-z0-9-]` replaced by
`-`. Which prototypes are built is `git diff` against the merge base with main,
so a docs-only push publishes nothing and leaves whatever preview is live
alone. `gh workflow run pages.yml --ref <branch> -f prototypes=02-balticmap`
overrides that if you want a preview of something you have not changed.

Three things follow from the fact that Pages publishes ONE artifact as the
WHOLE site, and each of them will bite somebody:

- **There is one preview slot.** The most recent preview push across all
  branches is the one that is live, and this repo regularly has several
  sessions working at once.
- **A push to main wipes the live preview.** Main's run publishes main. Push
  the branch again to get the preview back; that is why the trigger is a push
  rather than something you have to remember to run.
- **The workflow used is the one on the branch.** A branch cut before branch
  previews existed cannot preview itself until it is rebased.

A Godot prototype cannot be previewed - its export path is baked into
`project.godot` - and is skipped with a warning rather than failing the run.
```

- [ ] **Step 2: Note the override beside the `base` rule**

In the same file, the `vite.config.ts` bullet under
`Per-prototype conventions` reads that `base` must be `/prototypes/NN/`. Append
to it:

```markdown
  CI passes `--base` explicitly for a branch preview, so the value in the file
  is the default rather than the only value ever used. Do not read the flag in
  `vite.config.ts`; the override belongs at the call site.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: how to preview a branch, and the three ways one artifact bites"
```

---

### Task 5: Verify end to end against the real site

Nothing before this proves the deploy works. There is no local runner for
Actions, so this task is the test.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/branch-previews
```

- [ ] **Step 2: Confirm the run published nothing**

```bash
gh run watch "$(gh run list --branch feature/branch-previews --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: the `build` job succeeds, its log holds
`::notice::no prototype changed`, and the `deploy` job is skipped. This branch
changed no prototype, so publishing nothing is the correct behaviour, and
seeing it is the proof that a docs push cannot clobber a live preview.

- [ ] **Step 3: Force a real preview through the dispatch override**

```bash
gh workflow run pages.yml --ref feature/branch-previews -f prototypes=02-balticmap
gh run watch "$(gh run list --workflow pages.yml --branch feature/branch-previews --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: green, and a `### Preview` block in the job summary naming
`/prototypes/preview/feature-branch-previews/02/`.

- [ ] **Step 4: Check all three URLs**

```bash
curl -sI https://jkirsteins.github.io/prototypes/preview/feature-branch-previews/02/ | head -1
curl -s https://jkirsteins.github.io/prototypes/preview/feature-branch-previews/02/ | grep -o '/prototypes/preview/feature-branch-previews/02/assets/[^"]*' | head -3
curl -s https://jkirsteins.github.io/prototypes/02/ | grep -o '/prototypes/02/assets/[^"]*' | head -3
```

Expected: `HTTP/2 200`, preview asset paths under the preview prefix, and
main's page still pointing at `/prototypes/02/assets/`. Pages can take a minute
to serve a new deploy; re-run rather than concluding failure on the first 404.

- [ ] **Step 5: Play it**

Open `https://jkirsteins.github.io/prototypes/preview/feature-branch-previews/02/`
in a browser, start a run, and confirm the map draws, a card plays and the
audio loads. A 200 on the HTML says nothing about whether the assets resolved.

- [ ] **Step 6: Merge to main**

```bash
git checkout main && git pull && git merge --no-ff feature/branch-previews
```

Ask before pushing main. Then confirm main's own run is green and
`/prototypes/02/` is unchanged.
