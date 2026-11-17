# Gauss Moto Digital Twin

Simulation-only Expo app for the Polestar 3 vehicle digital twin. Behavior is ported from the browser twin in `gaussmoto_vehicle_digital_twin_v2`. This app does not talk to that project’s Python static server, and it does not add simulation rules.

There is no real CAN bus, ECU, credential, or network attack. Frame IDs are the demonstration values from the web app. Geometry and the AEB, ACC, ABS, and charging rules are illustrative and match that code. A scenario **PASS** means the synthetic assertions passed.

## Model

`assets/models/polestar_3_2027.glb` is already in this repo (about 36 MB). To refresh it from the browser project, copy the file and leave the source tree unchanged:

```powershell
Copy-Item "D:\Elevatics Projects AI\gaussmoto_vehicle_digital_twin_v2\gaussmoto_vehicle_digital_twin_v2\assets\polestar_3_2027.glb" -Destination ".\assets\models\polestar_3_2027.glb"
```

Metro treats `.glb` as an asset (`metro.config.js`).

## Development build

Use a development build. Expo Go cannot host this `expo-gl` / Three.js scene.

```powershell
npm install
npx expo run:android
npx expo run:ios
npx expo start --dev-client
```

`npm run android` and `npm run ios` are the same native builds. After the dev client is installed, `npm start` opens the dev-client bundler.

Check the port without a device:

```powershell
npm run typecheck
npm run simtest
```

`simtest` resets to nominal, runs all 15 scenarios with their original assertions, and exits non-zero if any assertion fails.

Android and iOS both use the same TypeScript simulation (`src/sim/simulator.ts`, `src/sim/domains.ts`). The UI subscribes to that state. The 3D stage is `src/components/VehicleScene.tsx`, which drives the viewer ported from `viewer3d.js`.

## What changed for phones and tablets

The desktop three-column page is not cloned.

- Phone: the 3D viewport is first. HUD (ADAS, battery, security, speed, gear, body, warnings), camera buttons, and layer chips sit on the model. Controls live in section tabs so the canvas stays mounted. Tablet (shortest side 600 or wider): viewport and controls sit side by side.
- Portrait is supported. Landscape keeps a taller stage on phones.
- Touch targets are at least 44 pt. Rejected commands show a toast.
- Orbit is drag to rotate and pinch to zoom. There is no pan. Distance stays between 3.5 and 18, matching the web camera limits. Scroll-wheel zoom is the desktop control this replaces.
- The UI uses the system font. The web app loads DM Sans and Manrope.
- Phones cap the pixel ratio at 1.25, turn antialiasing off, and skip the shadow map. Larger screens cap the pixel ratio at 1.6 and use a 512px shadow map. The web viewer used 2048.
- Overlay labels are small bitmap textures. React Native has no DOM canvas, which the web viewer used for text sprites.
- Top View is an SVG equivalent of the web `#topView` and stays available from the stage. If the GLB or WebGL fails (including a 45s load timeout), the app switches to that view.
- CSV, JSON, and the scenario test report go out through the share sheet instead of a browser download.
- The 2D tailgate control calls the tailgate command. The web SVG called `setDoor('trunk')`, which did not change the tailgate because `trunk` is not a door key. The 3D tailgate still uses `ANCHOR_Boot_8`.

## 3D

On a phone, Three.js cannot create DOM images, so embedded GLB textures are written to the cache as `file://` images before upload. If that load fails, the stage falls back to Top view and a toast explains why.

The viewer loads `polestar_3_2027.glb` and animates the same anchors: front and rear doors at ±π/3, tailgate at −0.8726646. Cameras are Perspective, Front, Rear, Side, Top, ADAS, and reset, using the web `CAMERA_POSITIONS`. Radar and targets, trajectory, and labels start on. Taps use the same anchor and wheel names. Headlight, taillight, brake, reverse, and turn-signal glow, plus the lead vehicle, pedestrian, cyclist, radar fan, projected path, TPMS rings, window labels, charge halo, security ring, and wiper sweep, follow the web scene.

`three` is pinned at 0.164.1 so `GLTFLoader` matches `viewer3d.js`. `@react-three/fiber` is 9.8.2 and `@react-three/drei` is 10.7.9. Fiber 9 is required on React 19; Fiber 8 crashes at startup because its reconciler still reads `ReactCurrentOwner`. Fiber 9 still accepts Three 0.156 and newer, so the loader stays on 0.164.1. Do not bump `three` unless the loader behavior is checked against the web viewer.

Navigation is a React Navigation native stack with the header hidden. Section chips, not a second navigator, switch the control deck so the 3D canvas stays mounted.
