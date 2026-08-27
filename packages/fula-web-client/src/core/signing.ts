/**
 * Signed-request headers — parity with go-fula/blockchain/auth_signed.go:
 *
 *   bodyHash := sha256.Sum256(bodyBytes)
 *   action   := path.Base(req.URL.Path)
 *   message  := action + ":" + timestamp + ":" + base64.StdEncoding.EncodeToString(bodyHash[:])
 *   digest   := sha256.Sum256([]byte(message))
 *   sig, _   := privKey.Sign(digest[:])          // plain Ed25519 over the 32-byte digest
 *   X-Fula-Peer-ID: <peer id>, X-Fula-Timestamp: <unix seconds>, X-Fula-Signature: base64Std(sig)
 *
 * The server tolerates ±300 s of clock skew, uses no nonce, and signs neither the method nor the query.
 */
import type { FulaIdentity } from './identity.js';
import { sha256, toBase64Std, utf8 } from './encoding.js';

export const HEADER_PEER_ID = 'X-Fula-Peer-ID';
export const HEADER_TIMESTAMP = 'X-Fula-Timestamp';
export const HEADER_SIGNATURE = 'X-Fula-Signature';

/** Max skew accepted by the Blox (go-fula `maxTimestampSkew`). */
export const MAX_TIMESTAMP_SKEW_SEC = 300;

export interface SignedHeaders {
  'X-Fula-Peer-ID': string;
  'X-Fula-Timestamp': string;
  'X-Fula-Signature': string;
}

/** The exact string go-fula signs (exported for golden tests). */
export async function buildSignedMessage(
  action: string,
  timestampSec: number | string,
  body: Uint8Array,
): Promise<string> {
  const bodyHash = await sha256(body);
  return `${action}:${timestampSec}:${toBase64Std(bodyHash)}`;
}

export async function buildSignedDigest(
  action: string,
  timestampSec: number | string,
  body: Uint8Array,
): Promise<Uint8Array> {
  return sha256(utf8(await buildSignedMessage(action, timestampSec, body)));
}

export async function signHeaders(
  identity: FulaIdentity,
  action: string,
  body: Uint8Array,
  timestampSec: number,
): Promise<SignedHeaders> {
  const digest = await buildSignedDigest(action, timestampSec, body);
  const sig = await identity.privateKey.sign(digest);
  return {
    [HEADER_PEER_ID]: identity.peerIdString,
    [HEADER_TIMESTAMP]: String(timestampSec),
    [HEADER_SIGNATURE]: toBase64Std(sig),
  };
}
