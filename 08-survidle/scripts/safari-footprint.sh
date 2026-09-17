#!/bin/zsh
# Measure what real Safari holds against its memory-kill threshold.
#
#   scripts/safari-footprint.sh <url> <urlmatch> [seconds]
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
URL=$1; MATCH=$2; SECS=${3:-150}
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
osascript -e "tell application \"Safari\" to close (every document whose URL contains \"$MATCH\")" >/dev/null 2>&1
rm -rf $T
