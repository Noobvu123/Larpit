# Larp It integrated app

Version 1.2.0, iOS build 3. The revised frontend is connected to the delivered backend services. This is one Expo SDK 58 app with local storage, not two servers to start.

## Try it on your Mac

1. Extract `LarpIt_Integrated.zip` completely. Open its `LarpIt` folder.
2. Double-click **Run-LarpIt.command** to prepare dependencies, build a Release app, and launch it in an installed iPhone Simulator.
3. Keep Terminal open until the app launches. If preparation fails, the launcher identifies the failed stage and saves a log in `logs/`.

Prerequisites: **Node.js 24 or newer, Xcode with an iPhone simulator runtime, and CocoaPods**. Complete Xcode's initial setup and select its command-line tools under Settings > Locations. If Homebrew is already installed, CocoaPods can be installed with `brew install cocoapods`. The first setup needs internet. No paid build service or app API key is required for the local simulator workflow.

For Xcode itself, double-click **Open-in-Xcode.command**. It prepares and opens `ios/LarpIt.xcworkspace`. Choose an iPhone Simulator, set Edit Scheme > Run > Build Configuration to **Release**, then Product > Run. The workspace is created by CocoaPods on your Mac; it is not included as a compiled app in this source ZIP.

If macOS prevents double-clicking a downloaded script, open Terminal, type `cd `, drag the extracted LarpIt folder into Terminal, press Return, then run `bash Run-LarpIt.command`. Keep macOS security protections enabled. Do not run commands from an unreviewed download.

**Browser preview:** double-click `Run-LarpIt-Web.command`. This needs Node/npm but not Xcode or CocoaPods. It is useful for trying the screens; it does not verify native camera or iOS behavior.

## Try TestFlight

Double-click **Prepare-TestFlight.command** on the Mac. It prepares Xcode and opens `IOS_TESTFLIGHT.md`. Follow that guide to select your authorized signing team, use your registered bundle identifier, archive, validate, and upload through App Store Connect. `com.larpit.demo` is a simulator placeholder, not a registered team identifier.

**This ZIP is source, not a signed IPA or TestFlight invitation.** TestFlight still needs an active Apple Developer Program team, an App Store Connect app record, a signed device archive, Apple processing, and tester access. None has been created or uploaded from this Linux workspace. `TESTFLIGHT_CHECKLIST.md` contains concrete native tests and draft beta-testing text. Direct Xcode testing on a connected iPhone is also described in the guide.

## Connected flow

Welcome and tennis selection → empty home → New post → content type → tone for text → photo count and pose idea for photos → reference, capture/upload, confirm and review for each photo → topic for text → Instagram and/or LinkedIn → editable captions with Copy buttons → Instagram preview → LinkedIn preview → All done → saved post on home.

- Photos-only and written-only skip unused steps. Choose one to three photos.
- Each photo keeps its own reference, imported file, review and acceptance state.
- Photo ideas rank three bundled Unsplash references by tags. An unmatched idea is shown explicitly; users can browse the available examples.
- Templates produce distinct Instagram/LinkedIn captions using the user's topic and tone. Edits, copy, two regenerations, Back and platform previews are connected.
- Each preview confirmation records the displayed revision. Editing the draft requires reviewing updated previews before saving.
- Repeated completion returns one saved post. Home shows saved posts and supports reopening and deletion.
- Snapchat and TikTok are marked Coming later for new posts. Earlier saved posts retain their platform labels.
- Copy and photo sharing are user-triggered. Nothing is automatically published to a social account.

## AI and demo limits

The default build uses **local caption templates and manual photo review**. It does not run a live AI model, fabricate comparison scores, or guarantee engagement. Captions, sample photos and feedback are labelled accordingly. The supplied optional Ollama adapter is included but disabled and untested with a real model. See `LOCAL_AI.md`; its loopback connection is not a physical-iPhone networking solution.

Three supplied Unsplash photos are bundled with credits. The larger research catalog is not an app-ready, visually verified image library and is not silently included. Fonts and reference assets are local. No hosted model, social login, account credentials or runtime API key is configured.

## Data and compatibility

The backend owns new drafts and posts. iOS uses SQLite for records and durable app-owned photo copies. The web preview uses IndexedDB for records and photo Blobs. Frontend appearance and checklist preferences remain in AsyncStorage. There is no cloud sync between devices.

Earlier frontend v1 data is preserved. Supported unfinished drafts are imported, earlier posts remain visible, and incompatible platform drafts remain recoverable in the old data. Deleting a legacy post hides it from this version's history without deleting the recovery snapshot. New-post deletion removes backend records and unreferenced app-owned media, never picker originals.

## Development checks

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run export:ios
npm run export:web
```

`npm run ios` uses the Expo development workflow. The supplied Run-LarpIt launcher builds Release for the standalone simulator demo. Configure native identity in `app.json` before preparation so future generation keeps your signing choice.

Read `VERIFICATION.md` for actual results and remaining limits. `INTEGRATION_HANDOFF.md` is the concise update to relay to the main Prepare for Larp Hacks chat. It has not been sent automatically.

## Backup recording

After the simulator flow works, double-click **Record-Demo.command**, perform the short demo, then press Control-C. The script opens the movie for playback. A recording has not been made here because your Mac simulator is not accessible from this workspace.
