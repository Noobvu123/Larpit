#!/bin/bash
# Local Mac preparation and testing. Account/signing/upload steps stay in Xcode.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export EXPO_NO_TELEMETRY=1
larpit_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$larpit_root"
larpit_mode="${1:-simulator}"
larpit_stage="checking prerequisites"
larpit_log=""

finish() {
  larpit_result=$?
  if [ "$larpit_result" -ne 0 ]; then
    printf '\nLarp It stopped while %s (exit %s).\n' "$larpit_stage" "$larpit_result"
    printf 'Keep the first error above and send it to the Full Stack chat.\n'
  fi
  if [ -n "$larpit_log" ]; then printf '\nBuild log: %s\n' "$larpit_log"; fi
  if [ -t 0 ]; then
    printf '\nPress Return to close this window.\n'
    read -r larpit_answer || true
  fi
  exit "$larpit_result"
}
trap finish EXIT

case "$larpit_mode" in
  simulator|xcode|testflight|web) ;;
  *) printf 'Unknown launch mode: %s\n' "$larpit_mode"; exit 1 ;;
esac

if [ "$(uname -s)" != "Darwin" ]; then
  printf 'Open this launcher on your Mac, from the extracted LarpIt folder.\n'
  exit 1
fi
umask 077
mkdir -p "$larpit_root/logs"
larpit_log="$larpit_root/logs/${larpit_mode}-$(date +%Y%m%d-%H%M%S)-$$.log"
exec > >(tee -a "$larpit_log") 2>&1
printf 'Larp It local %s launch\n' "$larpit_mode"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf 'Install Node.js 24 or newer from https://nodejs.org/ and open this launcher again.\n'
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  printf 'This integrated package requires Node.js 24 or newer.\n'
  exit 1
fi
node --version
npm --version
export NODE_BINARY="$(command -v node)"

if [ "$larpit_mode" != "web" ]; then
  if ! xcodebuild -version || ! xcrun --find simctl >/dev/null 2>&1; then
    printf 'Open Xcode and complete its first-launch setup.\n'
    printf 'Choose Xcode under Settings > Locations > Command Line Tools.\n'
    exit 1
  fi
  if ! command -v pod >/dev/null 2>&1; then
    printf 'CocoaPods is missing. If Homebrew is installed, run: brew install cocoapods\n'
    printf 'Otherwise see https://guides.cocoapods.org/using/getting-started\n'
    printf 'Use a supported Ruby installation. This launcher does not install system Ruby gems.\n'
    exit 1
  fi
  pod --version
fi

if [ "$larpit_mode" = "simulator" ]; then
  larpit_stage="selecting an installed iPhone simulator"
  xcrun simctl list devices available --json > "$larpit_root/logs/simulators.json"
  larpit_simulator="$(node scripts/select-simulator.cjs "$larpit_root/logs/simulators.json" "${LARPIT_SIMULATOR_UDID:-}")"
  printf 'Selected iPhone Simulator: %s\n' "$larpit_simulator"
fi

# Reuse dependencies only for this lockfile, Node major, OS and architecture.
larpit_fingerprint="$(node -e 'const fs=require("fs"),c=require("crypto");const h=c.createHash("sha256");for(const p of ["package.json","package-lock.json"])h.update(fs.readFileSync(p));h.update([process.versions.node.split(".")[0],process.platform,process.arch].join(":"));console.log(h.digest("hex"));')"
larpit_previous=""
if [ -f node_modules/.larpit-install-stamp ]; then larpit_previous="$(cat node_modules/.larpit-install-stamp)"; fi
if [ "$larpit_fingerprint" != "$larpit_previous" ] || [ ! -x node_modules/.bin/expo ]; then
  larpit_stage="installing locked dependencies"
  printf '\nInstalling locked app dependencies. The first install needs internet.\n'
  npm ci
  printf '%s\n' "$larpit_fingerprint" > node_modules/.larpit-install-stamp
else
  printf '\nApp dependencies are already installed.\n'
fi

if [ "$larpit_mode" = "web" ]; then
  larpit_stage="running the browser preview"
  printf '\nKeep Terminal open. Use the local address printed below if the browser does not open.\n'
  ./node_modules/.bin/expo start --web
  exit 0
fi

larpit_stage="updating the native project"
# The default layers app.json configuration onto ios/. Never delete user signing settings.
# --no-install keeps CocoaPods installation explicit and avoids a system-Ruby fallback.
./node_modules/.bin/expo prebuild --platform ios --no-install

larpit_stage="installing native iOS dependencies"
(
  cd ios
  pod install
)
# CocoaPods normally writes this absolute path. Supply a fallback if it did not,
# preserving any existing user config so Finder-launched Xcode need not inherit PATH.
larpit_stage="preparing the Xcode Node environment"
node scripts/prepare-xcode-node.cjs "$larpit_root/ios"
shopt -s nullglob
larpit_workspaces=(ios/*.xcworkspace)
if [ "${#larpit_workspaces[@]}" -ne 1 ]; then
  printf 'Expected one Xcode workspace under ios/, found %s.\n' "${#larpit_workspaces[@]}"
  exit 1
fi

if [ "$larpit_mode" = "testflight" ]; then
  open -a Xcode "${larpit_workspaces[0]}"
  open -a TextEdit "$larpit_root/IOS_TESTFLIGHT.md"
  printf '\nThe workspace and TestFlight instructions are open.\n'
  printf 'Choose your signing team and registered bundle identifier, then Product > Archive.\n'
  printf 'No archive, upload or TestFlight invitation has been created by this launcher.\n'
  exit 0
fi
if [ "$larpit_mode" = "xcode" ]; then
  open -a Xcode "${larpit_workspaces[0]}"
  printf '\nWorkspace ready. Choose an iPhone Simulator in Xcode.\n'
  printf 'For a self-contained demo, set Edit Scheme > Run > Build Configuration to Release.\n'
  printf 'Choose Product > Run, or use Run-LarpIt.command to build and install automatically.\n'
  exit 0
fi

larpit_stage="building the Release simulator app"
printf '\nBuilding Release for the simulator. No Apple signing account is needed for this build.\n'
printf 'The JavaScript and bundled photos are included in this build; Metro is not required.\n'
xcodebuild \
  -workspace "${larpit_workspaces[0]}" \
  -scheme LarpIt \
  -configuration Release \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$larpit_simulator" \
  -derivedDataPath "$larpit_root/.local-build/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  build
larpit_app="$larpit_root/.local-build/DerivedData/Build/Products/Release-iphonesimulator/LarpIt.app"
if [ ! -d "$larpit_app" ]; then
  printf 'The expected built app is missing: %s\n' "$larpit_app"
  exit 1
fi
larpit_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$larpit_app/Info.plist")"
if [ -z "$larpit_bundle_id" ]; then printf 'The built app is missing its bundle identifier.\n'; exit 1; fi
larpit_stage="starting the iPhone simulator"
open -a Simulator --args -CurrentDeviceUDID "$larpit_simulator"
# bootstatus -b boots a shut-down simulator and waits for it to become usable.
xcrun simctl bootstatus "$larpit_simulator" -b
larpit_stage="installing and opening Larp It"
xcrun simctl install "$larpit_simulator" "$larpit_app"
xcrun simctl launch "$larpit_simulator" "$larpit_bundle_id"
printf '\nLarp It is installed and the launch command succeeded. Verify the screen and complete the test flow.\n'
printf 'You can reopen it from the simulator Home Screen after closing Terminal.\n'
printf 'Use Record-Demo.command after the flow works to record your backup video.\n'
