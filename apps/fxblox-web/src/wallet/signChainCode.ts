/**
 * The identity signature step, byte-identical to `LinkPassword.screen.tsx`:
 *   msg      = new HDKEY(password).chainCode
 *   msgHex   = '0x' + hex(utf8(msg))                       // Buffer.from(msg).toString('hex')
 *   sig      = personal_sign([msgHex, account.toLowerCase()])
 * The signature then seeds `HDKEY(password).createEDKeyPair(sig)` → the 64-byte DID secretKey → app peerId, so
 * web and mobile derive ONE identity for the same password + wallet.
 */
import { HDKEY } from '@functionland/fula-sec-web';
import type { Eip1193Provider } from './types';

export function utf8ToHex(text: string): string {
  return Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function chainCodeFor(password: string): string {
  return new HDKEY(password).chainCode;
}

export function chainCodeMessageHex(chainCode: string): string {
  return '0x' + utf8ToHex(chainCode);
}

/** `[msgHex, account]` exactly as passed to `provider.request({ method: 'personal_sign' })`. */
export function personalSignParams(chainCode: string, account: string): [string, string] {
  return [chainCodeMessageHex(chainCode), account.toLowerCase()];
}

export async function signChainCode(provider: Eip1193Provider, account: string, password: string): Promise<string> {
  if (!provider) throw new Error('Provider not available');
  if (!account) throw new Error('Account not available');
  const chainCode = chainCodeFor(password);
  const params = personalSignParams(chainCode, account);
  const signature = await provider.request({ method: 'personal_sign', params });
  if (typeof signature !== 'string' || !signature) {
    throw new Error('Wallet returned an empty signature');
  }
  return signature;
}
