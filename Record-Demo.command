#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
larpit_root="$(cd "$(dirname "$0")" && pwd)"
if [ "$(uname -s)" != Darwin ]; then
  printf 'Run this recording command on your Mac after the simulator demo works.\n'
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! xcrun --find simctl >/dev/null 2>&1; then
  printf 'Run Run-LarpIt.command first to check Node and Xcode.\n'
  exit 1
fi
umask 077
mkdir -p "$larpit_root/recordings"
larpit_inventory="$(mktemp)"
trap 'rm -f "$larpit_inventory"' EXIT
xcrun simctl list devices available --json > "$larpit_inventory"
larpit_simulator="$(node "$larpit_root/scripts/select-simulator.cjs" "$larpit_inventory" "${LARPIT_SIMULATOR_UDID:-}")"
node -e 'const fs=require("fs");const [file,id]=process.argv.slice(1);const devices=Object.values(JSON.parse(fs.readFileSync(file,"utf8")).devices).flat();if(!devices.some(d=>d.udid===id&&d.state==="Booted")){console.error("Open Larp It in the selected iPhone simulator before recording.");process.exit(1)}' "$larpit_inventory" "$larpit_simulator"
larpit_movie="$larpit_root/recordings/LarpIt-demo-$(date +%Y%m%d-%H%M%S)-$$.mov"
printf 'Recording to %s\nShow the working flow, then press Control-C to finish.\n' "$larpit_movie"
# simctl handles SIGINT and finalizes the movie. Never erase earlier recordings.
trap ':' INT
larpit_record_result=0
xcrun simctl io "$larpit_simulator" recordVideo "$larpit_movie" || larpit_record_result=$?
trap - INT
if [ -s "$larpit_movie" ]; then
  printf '\nRecording saved. Play it back before relying on it for the demo.\n'
  open "$larpit_movie"
else
  printf '\nNo completed recording was produced (exit %s).\n' "$larpit_record_result"
  exit 1
fi
