import type { CapacitorConfig } from '@capacitor/cli';

/**
 * FlyCheap — Capacitor remote-WebView shell (same pattern as K9 Pulse).
 * The native app is a thin wrapper; the WebView loads the live web app directly,
 * so UI/data ship via the web deploy with no rebuild. Rebuild only for native-shell
 * changes (push, version bump). See docs/mobile-app + IOS_SHIPPING_RUNBOOK.
 */
const config: CapacitorConfig = {
  appId: 'Miro.k9.flycheap',
  appName: 'FlyCheap',
  webDir: 'www',
  server: {
    url: 'https://flycheap.18dn.com/',
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0a3a6b',
  },
};

export default config;
