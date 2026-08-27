/**
 * Chromium-only gate (decision D5). Web Bluetooth, WebTransport and Chrome's Local Network Access are all required
 * for the device features; WebKit/Gecko lack at least one of them.
 */
export interface BrowserSupport {
  supported: boolean;
  chromium: boolean;
  webBluetooth: boolean;
  webTransport: boolean;
  reasons: string[];
}

export function detectBrowserSupport(nav: Navigator = navigator, win: Window = window): BrowserSupport {
  const uaData = (nav as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData;
  const brands = uaData?.brands?.map((b) => b.brand.toLowerCase()) ?? [];
  const ua = nav.userAgent.toLowerCase();
  const chromium =
    brands.some((b) => b.includes('chromium') || b.includes('google chrome') || b.includes('microsoft edge')) ||
    (/chrome|crios|edg/.test(ua) && !/firefox|fxios/.test(ua) && !(/safari/.test(ua) && !/chrome|crios/.test(ua)));
  const webBluetooth = 'bluetooth' in nav;
  const webTransport = 'WebTransport' in win;
  const reasons: string[] = [];
  if (!chromium) reasons.push('not-chromium');
  if (!webBluetooth) reasons.push('no-web-bluetooth');
  if (!webTransport) reasons.push('no-webtransport');
  return { supported: chromium && webBluetooth && webTransport, chromium, webBluetooth, webTransport, reasons };
}
