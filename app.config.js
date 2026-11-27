const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, withGradleProperties } = require('expo/config-plugins');

// Opt-in simulator preparation only; existing Android/Pilot config is unchanged.
const iosSimulator = process.env.MARCHIX_IOS_SIMULATOR === '1';
if (iosSimulator) {
  if (process.env.EAS_BUILD_PLATFORM === 'android') throw new Error('iOS simulator profile cannot build Android.');
  if (process.env.EXPO_PUBLIC_FIREBASE_MODE !== 'emulator') throw new Error('iOS simulator preparation requires emulator mode.');
  if (process.env.MARCHIX_EAS_PROJECT_ID?.trim() || process.env.MARCHIX_EXPO_PROJECT_ID?.trim()) {
    throw new Error('Existing EAS linkage present: review it before using the isolated iOS simulator project.');
  }
}

const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
const staging = process.env.EXPO_PUBLIC_FIREBASE_MODE === 'staging';
const pilot = process.env.EXPO_PUBLIC_FIREBASE_MODE === 'pilot';
const lanApk = process.env.MARCHIX_LAN_APK === '1';
const id = pilot ? 'vn.marchix.quanly.pilot' : staging ? 'vn.marchix.quanly.staging' : 'vn.marchix.quanly.emulator';
const plugins = lanApk || pilot ? [] : ['expo-dev-client'];
const pushProjectId = (staging || pilot) ? process.env.MARCHIX_EAS_PROJECT_ID?.trim() : undefined;
const easProjectId = iosSimulator ? '436bf79b-03e4-4e26-9edf-326d49861910' : pushProjectId || (pilot ? process.env.MARCHIX_EXPO_PROJECT_ID?.trim() : undefined);
const googleServicesFile = pushProjectId ? process.env.MARCHIX_GOOGLE_SERVICES_FILE?.trim() : undefined;
const appIcon = './assets/marhub-app-icon-multicolor.png';
if (pushProjectId) plugins.push(['expo-notifications', { defaultChannel: 'workspace' }]);
plugins.push(['expo-location', {
  locationWhenInUsePermission: 'Cho phép MarHub kiểm tra vị trí văn phòng khi bạn chấm công.',
}]);
plugins.push(config => withGradleProperties(config, mod => {
  const key = 'android.packagingOptions.pickFirsts';
  const sharedCpp = '**/libc++_shared.so';
  const existing = mod.modResults.find(item => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = [...new Set([...existing.value.split(',').filter(Boolean), sharedCpp])].join(',');
  } else {
    mod.modResults.push({ type: 'property', key, value: sharedCpp });
  }
  return mod;
}));

if (lanApk) {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST?.trim();
  if (staging || pilot || net.isIP(host || '') !== 4) {
    throw new Error('Bản APK thử cần địa chỉ IPv4 của máy chạy Firebase Emulator.');
  }

  plugins.push(config => {
    config = withAndroidManifest(config, mod => {
      const application = mod.modResults.manifest.application[0];
      application.$['android:networkSecurityConfig'] = '@xml/marchix_emulator_network';
      return mod;
    });
    return withDangerousMod(config, ['android', async mod => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'marchix_emulator_network.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">${host}</domain>
  </domain-config>
</network-security-config>
`);
      return mod;
    }]);
  });
}

if ((staging || pilot) && iosClientId) {
  plugins.push(['@react-native-google-signin/google-signin', {
    iosUrlScheme: iosClientId.split('.').reverse().join('.'),
  }]);
}

module.exports = {
  name: 'MarHub',
  slug: iosSimulator ? 'duy-tran' : 'marchix-mobile',
  ...(iosSimulator ? { owner: 'duytran2609s-team' } : {}),
  version: pilot ? '0.6.8' : '0.4.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: appIcon,
  android: { package: id, ...(googleServicesFile ? { googleServicesFile } : {}),
    ...(pilot ? { versionCode: 19, allowBackup: false } : lanApk ? { versionCode: 5 } : {}) },
  ios: { bundleIdentifier: id, supportsTablet: false },
  web: { favicon: appIcon },
  ...(easProjectId ? { extra: {
    eas: { projectId: easProjectId },
    ...(pushProjectId ? { workspacePushEnabled: true } : {}),
  } } : {}),
  plugins,
};
