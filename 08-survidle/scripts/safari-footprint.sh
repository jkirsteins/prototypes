#!/bin/zsh
# Measure what real Safari holds against its memory-kill threshold.
#
#   npm run test:safari            build, serve dist locally, measure 150 s
#   npm run test:safari -- 40      the same, for 40 s
#   SURVIDLE_URL=<url> SURVIDLE_MATCH=<urlmatch> scripts/safari-footprint.sh [seconds]
#                                  measure an already-served build instead
#
# Opens the url in real Safari (Apple Events), lands by clicking through the
# opening modals with JavaScript from Apple Events, and every ten seconds
# prints the tab's WebContent process, its phys_footprint, and the game
# clock. phys_footprint is the number WebKit's memory pressure handler
# compares against its kill threshold, so it is the number behind "This
# webpage was reloaded because it was using significant memory". A kill
# shows as the pid changing while the counter kept on window resets.
#
# Needs, once, in Safari's Develop menu: Allow JavaScript from Apple Events.
# Keep the Safari window uncovered: Safari stops delivering frames to a
# covered window and the game's clock stops with them.
#
# Measured 2026-09-17 on seed 17, a landing left to run for 150 s:
#   before the forage-scan fix (e1e45170)  11 GB, 22 GB, 19 GB, then killed
#   after it (db90a1b1)                    389-402 MB, flat, two forecasts in
SECS=${1:-150}
URL=${SURVIDLE_URL:-}; MATCH=${SURVIDLE_MATCH:-}
PORT=5189; SERVER=
if [ -z "$URL" ]; then
  [ -f dist/index.html ] || { echo "no dist/: run npm run build first, or use npm run test:safari"; exit 1; }
  npx vite preview --port $PORT --strictPort >/dev/null 2>&1 &
  SERVER=$!
  for i in $(seq 1 30); do curl -s -o /dev/null --max-time 2 http://localhost:$PORT/prototypes/08/ && break; sleep 1; done
  URL="http://localhost:$PORT/prototypes/08/?seed=17"; MATCH=$PORT
fi
cleanup() { osascript -e "tell application \"Safari\" to close (every document whose URL contains \"$MATCH\")" >/dev/null 2>&1; [ -n "$SERVER" ] && kill $SERVER 2>/dev/null; rm -rf $T; }
trap cleanup EXIT
T=$(mktemp -d)
cat > $T/sample.js <<'JS'
(() => { const clock = ((document.querySelector('#weather')||{textContent:''}).textContent.match(/\d\d:\d\d/)||['?'])[0]; const overlay = document.querySelector('#overlay:not([hidden])'); const modal = overlay ? overlay.textContent.trim().slice(0,12) : ''; window.__probe = (window.__probe ?? 0) + 1; return `${clock} ${modal ? 'modal:' + modal : 'playing'} probe#${window.__probe}`; })()
JS
cat > $T/land.js <<'JS'
(() => { const c = (t) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t); if (b) { b.click(); return t; } return null; }; return ['Land', 'Begin', 'OK', 'Got it', 'Continue'].map(c).filter(Boolean).join(',') || 'nothing'; })()
JS
js() { osascript -e "set js to read POSIX file \"$T/$1\"" -e "tell application \"Safari\" to do JavaScript js in (first document whose URL contains \"$MATCH\")" 2>&1 | tr -d '\n'; }
fpmb() { footprint -p $1 2>/dev/null | awk '/phys_footprint/ { v=$2; u=$3; if (u ~ /^KB/) v/=1024; else if (u ~ /^GB/) v*=1024; else if (u ~ /^B/) v/=1048576; printf "%.0f", v; exit }'; }
heaviest() { for p in $(pgrep -f 'com.apple.WebKit.WebContent'); do echo "$(fpmb $p) $p"; done | sort -n | tail -1 | awk '{print $2}'; }
osascript -e 'tell application "Safari" to activate' -e "tell application \"Safari\" to make new document with properties {URL:\"$URL\"}" >/dev/null 2>&1
t=0
while [ $t -le $SECS ]; do
  r=$(js sample.js)
  case "$r" in *modal:*) js land.js >/dev/null ;; esac
  P=$(heaviest)
  echo "t+${t}s  pid $P  footprint $(fpmb $P) MB  $r"
  sleep 10; t=$((t+10))
done
