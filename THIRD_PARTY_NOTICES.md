# Third-party sources

All application dependencies are open-source packages with public GitHub repositories. Packages are installed through their normal package registry with a committed lockfile. No hosted API services are used.

| Component | GitHub source | License / usage |
| --- | --- | --- |
| Expo, Expo Router, Camera, Image Picker, Font, Splash Screen, Device, Status Bar | https://github.com/expo/expo | MIT |
| React | https://github.com/facebook/react | MIT |
| React Native | https://github.com/facebook/react-native | MIT |
| React Native Web | https://github.com/necolas/react-native-web | MIT |
| Safe Area Context | https://github.com/AppAndFlow/react-native-safe-area-context | MIT |
| Native Screens | https://github.com/software-mansion/react-native-screens | MIT |
| Expo vector icon package | https://github.com/expo/vector-icons | MIT; upstream font notices included in package |
| Ionicons | https://github.com/ionic-team/ionicons | MIT |
| Anton font package | https://github.com/expo/google-fonts | MIT package; SIL Open Font License for Anton font |
| Anton font | https://github.com/google/fonts/tree/main/ofl/anton | OFL-1.1; see licenses/Anton-OFL.txt |

## Bundled photos

Photo assets are from the Full Stack Unsplash research catalog, individually checked on their original pages for free standard-Unsplash licensing and visually reviewed before inclusion. They are not Getty, iStock or Unsplash+ assets. Local bundling avoids a runtime image-search API. No image has been used to train an AI model.

- `portrait.jpg`: Jadon Johnson, https://unsplash.com/photos/ENeIBJ-3WaE
- `seated.jpg`: Ahmed, https://unsplash.com/photos/Oip1nwclZ8A
- `equipment.jpg`: Butterfly Doe, https://unsplash.com/photos/pPJtHB1zoIE

License: https://unsplash.com/license . Photographer credits are also shown in the app.

## App identity

The black Larp It wordmark on tennis-ball green is taken from the user's selected UI Design asset. No Nike logo or paid Nike font is included.

## Expo MIT notice

Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Full-flow additions

- Expo FileSystem, Asset, Clipboard, Sharing and MediaLibrary: https://github.com/expo/expo (MIT), used through SDK-matched packages.
- AsyncStorage: https://github.com/react-native-async-storage/async-storage (MIT), appearance/checklist preferences and preserved legacy records.
- The app integrates the user's `LarpIt_Backend_Handoff.zip` service version 0.2.0. It does not add or claim any hosted AI service.
- `assets/logo.png` is the supplied revised “Black Larp It wordmark on green” artwork.

## Integration additions

- Expo SQLite: https://github.com/expo/expo (MIT), durable native records.
- fake-indexeddb: https://github.com/dumbmatter/fakeIndexedDB (Apache-2.0), development tests only.
- react-test-renderer: https://github.com/facebook/react (MIT), development tests only.

The original frontend supplied the photo provenance entries above. Integration reused those existing image files; no new image catalog, scraping or model training was added.
