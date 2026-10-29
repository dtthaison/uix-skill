# Mobile testing

For every mobile stack. It covers how to look at the app without disturbing the owner, Expo Go versus a development build, and the touch checks a script can run. For deep links and Maestro basics in Expo, see `references/stacks/react-native.md`.

## See the app safely

The owner may have simulators open for other work. Make your own and touch only that one.

Steps:

1. Create it: `xcrun simctl create "<App> iPhone" <device type> <runtime>`. It prints a UDID (the simulator's ID). List the choices with `xcrun simctl list devicetypes` and `xcrun simctl list runtimes`.
2. Boot it and use its UDID in every command: `xcrun simctl boot <udid>`. Never use `booted`, because it means "whichever one is running", and that may be the owner's. After the simulator boots, before you open Expo Go the first time, skip the Expo Go onboarding sheet: `xcrun simctl spawn <udid> defaults write host.exp.Exponent EXDevMenuIsOnboardingFinished -bool YES` and the same with `ExpoGoOnboardingFinished`.
3. Never shut down, erase or terminate apps on a simulator you did not create.
4. When you finish, delete yours: `xcrun simctl delete <udid>`.

To watch it on screen, open DeviceHub. Xcode 27 replaced Simulator.app with DeviceHub, at `/Applications/Xcode.app/Contents/Applications/DeviceHub.app`. `open -a Simulator` now fails. Run `open -a DeviceHub`, then choose your simulator in DeviceHub's device list. On an older Xcode, `open -a Simulator` still works.

## Expo Go or a development build

Expo Go is a ready-made app that Expo provides. It starts at once and needs no native build, so it is the fastest way to see a screen. It has limits, because it only holds the native code Expo put inside it:

- Native modules outside the Expo SDK do not load.
- Your own link scheme (`myapp://`) is not yours: Expo Go uses `exp://`. Universal links (web addresses that open the app) cannot work.
- The app icon, app name and splash screen are Expo Go's, not yours.
- Config plugins and `Info.plist` entries (native settings) need a native build, which Expo Go never rebuilds.
- On Android, from SDK 53, remote push (sent from a server) is not available in Expo Go. On iOS, the Expo FAQ says to test remote push in a development build. Local notifications still work in Expo Go.

A development build is your own copy of Expo Go, with your app's native parts inside.

Switch to a development build the first time you need one of these. Switch also before you test deep links, haptics or launch feel the way a user gets them.

How to switch, from the project root:

1. `npx expo install expo-dev-client`
2. `npx expo run:ios --device <udid>` with your own simulator's UDID (`--device` takes a name or a UDID). The first build takes several minutes.
3. Start Metro as usual. It now targets the development build, not Expo Go. Once `expo-dev-client` is installed, `npx expo start` opens the development build, so for check-mobile start Metro with `npx expo start --go --port <port>`.

`check-mobile.mjs` drives Expo Go by default (`appId: host.exp.Exponent`); keep the app running in Expo Go then. For a native iOS app (SwiftUI) pass `--native <bundle id> --app-path <.app>`; see `references/stacks/swiftui.md`.

## Interaction checks with Maestro

Use these when a screen answers to a gesture, not only a tap.

Maestro taps and swipes the app the way a finger does. It also drives native apps: start the flow with `appId: <bundle id>`, and check-mobile `--native` runs flows the same way. These commands are checked against Maestro 2.6.1. Run them in a flow file (`--flow`). Use an `id` (the `testID` prop in React Native, which names an element for tests) or visible `text` to pick the element.

Four examples:

```yaml
# Double tap: like a photo
- doubleTapOn:
    id: "photo-card"

# Long press: open a context menu
- longPressOn:
    id: "bag-row"

# Swipe on an element: reveal a row's delete action
- swipe:
    from:
      id: "bag-row"
    direction: LEFT
    duration: 400

# Swipe between two points, as percentages of the screen: pull a sheet down
- swipe:
    start: 50%, 30%
    end: 50%, 80%
    duration: 400
```

`direction` is `UP`, `DOWN`, `LEFT` or `RIGHT`. A percentage is 0 to 100 and reads as "x%, y%" from the top-left. After each gesture, assert the result (`assertVisible`, or `assertNotVisible` for a removed row). A gesture that changes nothing passes silently otherwise.

## Android

`check-mobile.mjs --platform android` runs the same check on Android emulators. It works for Expo apps only (`--app`), not native Android apps. It does this:

- It creates two emulators (AVDs, Android Virtual Devices) named `uix-...`: "Small Phone" (360x640 dp) and "Pixel 9 Pro XL". `--devices` takes those names or an AVD device id such as `pixel_7`. It deletes both when it ends.
- It installs Expo Go and points the phone at Metro through `adb reverse`, so the app URL uses `127.0.0.1`.
- It sets a 9:41 status bar, then shoots light, dark (night mode) and font scale 2.0 (the `xxxl` mode).
- Finding sizes are in dp (density-independent pixels). A touch target under 48 dp is flagged.
- A deep link opens the route even on a cold start. That differs from Expo Go on iOS.
- Expo Go on Android draws a floating "Tools" button. The script turns it off once per emulator and skips it in findings.
- It never touches an AVD it did not create. Every `adb` call that acts on a device names the serial of an emulator this run started, and the script checks that the serial still reports the AVD it created.
- It does not record video yet. `--video` only adds a note.

### What it needs

The SDK is found from `ANDROID_HOME` or `ANDROID_SDK_ROOT`, else from `sdkmanager` on the PATH, else `~/Library/Android/sdk`. It needs the `emulator` and `platform-tools` packages and one system image. Install them with:

```
sdkmanager "emulator" "platform-tools" "system-images;android-35;google_apis;arm64-v8a"
```

On an Intel Mac use `x86_64` in place of `arm64-v8a`.

### Watch a run

Run with `--keep`. The script keeps its emulators and prints their names in the notes. Open one with a window: `<sdk>/emulator/emulator -avd <kept AVD name>`. Delete it later: `<sdk>/cmdline-tools/latest/bin/avdmanager delete avd -n <name>` (avdmanager may not be on your PATH). Xcode's DeviceHub does not show Android emulators.

### By hand and in flows

- Changing dark mode or font scale while Expo Go is open can crash it ("runtime not ready"). The script restarts Expo Go after every setting change. Do the same if you change a setting by hand.
- A Maestro flow needs `appId: host.exp.exponent` on Android (the package id; the iOS id is `host.exp.Exponent`). The script runs a temp copy of your flow with the id swapped and adds a note. Your file stays as it is.
- Still needs a real Android phone: the feel of the back gesture, the extra font and display-size settings that Samsung, Xiaomi and other brands add to Android, a Zalo or Messenger share, and haptics. Say so in the report.

## Record motion

A still cannot show motion. Record it: `xcrun simctl io <udid> recordVideo <file>.mov`, stop with Ctrl-C. Before a still, wait for a list stagger to finish; a shot taken at 0 s shows cards still faded in.

## What cannot be automated

Say so in the report, and give the owner the manual check. Do not claim these as tested.

- **Pinch.** Maestro has no pinch command. By hand: pinch a zoomable image on a phone; it should zoom around your fingers and settle back.
- **Haptics.** Simulators have no Taptic Engine (the phone's vibration motor), so nothing is felt. By hand: on a phone, tap each control that should buzz and confirm the buzz is light and fires once.
- **Hand-offs to other apps.** Zalo, Messenger, MoMo and a share sheet's targets are not installed on a simulator. By hand: on a phone with them, tap the button and confirm the other app opens with the right content.
- **Reduce Motion as felt.** check-mobile does not turn it on. Read the code for `useReducedMotion` or `AccessibilityInfo`, then switch it on in the phone's Settings and look for big moves that should fade instead.
- **Launch speed on a real phone.** A simulator runs on a fast Mac. By hand: close the app, open it from the home screen with a stopwatch, and note the time until it is usable. Test a Release build, not a debug one.
