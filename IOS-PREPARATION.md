# iOS simulator preparation (2026-11-18)

Status: configuration applied locally, NOT committed, built or tested on iOS.

Use only the new ios-simulator-demo EAS profile. It selects emulator data and the authorized Expo project duytran2609s-team/duy-tran (436bf79b-03e4-4e26-9edf-326d49861910). Existing Android/Pilot configurations remain unchanged when MARCHIX_IOS_SIMULATOR is unset.

The opt-in refuses Android, non-emulator Firebase and existing MARCHIX_EAS_PROJECT_ID or MARCHIX_EXPO_PROJECT_ID. Do not delete existing credentials or project links to bypass this guard; review conflicts.

Before build: authenticate correct Expo account in CLI, verify permissions/quota, inspect source upload exclusions, run typecheck/unit/config checks. No credentials, paid plans, TestFlight or shared-data writes are authorized by this preparation.

When a Mac with Xcode/Simulator is available:
- Verify resolved config with MARCHIX_IOS_SIMULATOR=1 and EXPO_PUBLIC_FIREBASE_MODE=emulator.
- Build only with eas build --platform ios --profile ios-simulator-demo after upload/quota review.
- Install on Simulator. This development build needs Metro.
- Run a separate demo-marchix-mobile Firebase Emulator. If backend is on Windows, set its trusted LAN host explicitly; simulator localhost is not the Windows machine. Validate connectivity/HTTP behavior. Never expose emulators publicly.
- Test login/session, tasks on demo data, attachments/PDF/share, location permissions, keyboard/safe areas, background/resume and logout.
- Record build/device/OS and individual pass/fail results.
- Google Sign-In, APNs/push, TestFlight and physical-device signing remain separate unverified gates.

Expo Free was verified as 15 iOS +15 Android builds, 0 used; cloud Simulator sessions required a paid plan at inspection. No upgrade or build was triggered.

References:
https://docs.expo.dev/build-reference/simulators/
https://docs.expo.dev/build/eas-json/
