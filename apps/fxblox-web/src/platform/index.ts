/**
 * Platform layer — interfaces + web implementations. Tests swap pieces with `vi.mock('@/platform/<module>')`.
 *
 *  KeyValueStore   platform/kvStore        idb-keyval `fxblox-kv` (AsyncStorage replacement, same key names)
 *  SecureStore     platform/secureStore    IDB `fxblox-secure` + non-extractable AES-GCM key (Keychain)
 *  LanHttp         platform/lanHttp        fetch + LNA + error taxonomy (axios)
 *  SseClient       platform/sse            fetch + ReadableStream parser (react-native-sse)
 *  Bluetooth       platform/bluetooth      BleTransport / BleSession / BleRegistry / ResponseAssembler
 *  Network         platform/network        navigator.onLine + generate_204 probe (NetInfo)
 *  Visibility      platform/visibility     visibilitychange (AppState)
 *  Clipboard/Share/Linking/DeviceInfo/Locale/Notifications/BackgroundTasks/Theme/QrScanner — web replacements
 *  notify          platform/notify         UI-free toast port (WS4 wires the fx-ui ToastProvider)
 */
export * from './kvStore';
export * as secureStore from './secureStore';
export { Service as SecureService } from './secureStore';
export * from './lanHttp';
export * from './sse';
export * from './network';
export * from './visibility';
export * from './clipboard';
export * from './share';
export * from './linking';
export * from './deviceInfo';
export * from './locale';
export * from './notifications';
export * from './backgroundTasks';
export * from './theme';
export * from './notify';
export * from './qrScanner';
export * from './bluetooth';
export { detectBrowserSupport, type BrowserSupport } from './browserSupport';
