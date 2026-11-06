# Android app build

The Android app is a Capacitor wrapper around the existing production CRM at
https://telecaller-76rg.vercel.app. It uses the existing authentication and backend;
it does not create a second database or copy customer data onto the device.

## Build and publish

1. Open the repository's **Actions** tab.
2. Select **Build Android APK** and choose **Run workflow** on the desired branch.
3. When the workflow succeeds, open **Releases** and download `telecaller.apk`.

The login page links to the latest public release. The first workflow run must complete
before that download link has an APK to serve.

The initial artifact is an unsigned debug APK for installation/testing. For wider
employee distribution, configure a protected Android signing key in GitHub Actions
before distributing a signed production build.

The app requires an internet connection because the CRM and its APIs remain hosted
on Vercel. Test sign-in, navigation, file selection/audio upload and report playback
on real Android devices before rolling it out to the whole team.
