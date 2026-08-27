/**
 * Identity derivation — byte-for-byte parity with the mobile app.
 *
 * Mobile chain (apps/box → react-native-fula → go-fula):
 *   const keyPair = new HDKEY(password).createEDKeyPair(signature);   // @functionland/fula-sec(-web)
 *   fula.newClient(keyPair.secretKey.toString(), ...)                 // Uint8Array.toString() === join(',')
 *   → native passes the STRING through unchanged (FulaModule.java toByte/toString round-trip; Fula.swift same)
 *   → go-fula mobile/keygen.go:
 *        seed := sha256.Sum256([]byte(secret))
 *        pk, _, _ := crypto.GenerateEd25519Key(bytes.NewReader(seed[:]))
 *        return crypto.MarshalPrivateKey(pk)
 *   → host.ID() is the app peer id the Blox stores as `authorizer`.
 *
 * So: peerId = Ed25519 keypair from seed sha256(utf8("d0,d1,...,d63")).
 */
import { generateKeyPairFromSeed, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import type { Ed25519PrivateKey } from '@libp2p/interface';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { sha256, utf8 } from './encoding.js';

export interface FulaIdentity {
  /** The libp2p private key (Ed25519). `raw` is seed(32) || pub(32). */
  privateKey: Ed25519PrivateKey;
  /** "12D3KooW…" — equals the mobile app's `appPeerId` for the same secret. */
  peerIdString: string;
  /** The 32-byte Ed25519 seed (sha256 of the identity string). */
  seed: Uint8Array;
  /** The exact string that was hashed (what mobile passes to newClient). */
  identityString: string;
}

/**
 * Normalises the identity input to the string mobile hashes.
 * Accepts the 64-byte secretKey (Uint8Array) or the already-joined "12,34,…" string.
 * Buffers are converted via Uint8Array.from so `.toString()` semantics never leak in.
 */
export function identityStringFromSecretKey(secretKey: Uint8Array | string): string {
  if (typeof secretKey === 'string') return secretKey;
  return Array.from(Uint8Array.from(secretKey)).join(',');
}

export async function identityFromSecretKey(secretKey: Uint8Array | string): Promise<FulaIdentity> {
  const identityString = identityStringFromSecretKey(secretKey);
  const seed = await sha256(utf8(identityString));
  const privateKey = await generateKeyPairFromSeed('Ed25519', seed);
  const peerId = peerIdFromPrivateKey(privateKey);
  return { privateKey, peerIdString: peerId.toString(), seed, identityString };
}

export async function peerIdFromSecretKey(secretKey: Uint8Array | string): Promise<string> {
  return (await identityFromSecretKey(secretKey)).peerIdString;
}

/** Protobuf form of the private key, as go-libp2p `crypto.MarshalPrivateKey` produces (for golden tests). */
export function privateKeyProtobuf(id: FulaIdentity): Uint8Array {
  return privateKeyToProtobuf(id.privateKey);
}
