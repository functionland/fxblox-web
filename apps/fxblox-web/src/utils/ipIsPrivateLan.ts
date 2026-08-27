/**
 * Whitelist-style check for IPs we'd accept as a LAN HTTP target (verbatim from the mobile `aiTransport.ts`;
 * lifted into its own module so `platform/lanHttp` can use it without importing the AI transport selector).
 *
 * - Accept RFC1918 (`10/8`, `172.16-31/12`, `192.168/16`) and link-local `169.254/16`.
 * - Reject loopback (`127/8`).
 * - **Do NOT** blanket-reject `10.42.0.0/24` — in this codebase that's the hotspot AP subnet, not WireGuard.
 */
export function ipIsPrivateLan(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o1 = Number(m[1]);
  const o2 = Number(m[2]);
  if ([o1, o2, Number(m[3]), Number(m[4])].some((o) => o < 0 || o > 255)) return false;
  // 127/8 loopback — reject
  if (o1 === 127) return false;
  // 10/8
  if (o1 === 10) return true;
  // 192.168/16
  if (o1 === 192 && o2 === 168) return true;
  // 172.16/12
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  // 169.254/16 link-local
  if (o1 === 169 && o2 === 254) return true;
  return false;
}
