import { ethers } from 'ethers';

// Web port: `multiformats/bases/base58` (multibase, `z`-prefixed) → ethers v5's built-in base58 codec, which
// encodes/decodes the same alphabet without the multibase prefix. Buffer hex parsing → `ethers.utils.arrayify`.
const base58 = ethers.utils.base58;

/**
 * Convert PeerID to bytes32 format for smart contract usage
 */
export async function peerIdToBytes32(peerId: string): Promise<string> {
  try {
    // Accept the multibase form too (the mobile code prefixed 'z' before decoding).
    const plain = peerId.startsWith('z') ? peerId.slice(1) : peerId;
    const decoded = base58.decode(plain);

    let bytes32: string | undefined = undefined;

    // CIDv1 (Ed25519 public key) format
    const CID_HEADER = [0x00, 0x24, 0x08, 0x01, 0x12];
    const isCIDv1 = CID_HEADER.every((v, i) => decoded[i] === v);

    if (isCIDv1 && decoded.length >= 37) {
      const pubkey = decoded.slice(decoded.length - 32);
      bytes32 = ethers.utils.hexlify(pubkey);
    }

    // Legacy multihash format
    if (decoded.length === 34 && decoded[0] === 0x12 && decoded[1] === 0x20) {
      const digest = decoded.slice(2);
      bytes32 = ethers.utils.hexlify(digest);
    }

    if (!bytes32) {
      throw new Error(`Unsupported PeerID format or unexpected length: ${decoded.length}`);
    }

    // Reversible check
    const reconstructed = await bytes32ToPeerId(bytes32);
    if (reconstructed !== plain) {
      throw new Error(`Could not revert the encoded bytes32 back to original PeerID. Got: ${reconstructed}`);
    }

    return bytes32;
  } catch (err) {
    console.error('Failed to convert PeerID to bytes32:', peerId, err);
    throw err;
  }
}

/**
 * Reconstructs the full Base58 PeerID from a bytes32 digest retrieved from the contract.
 */
export async function bytes32ToPeerId(digestBytes32: string): Promise<string> {
  try {
    const hex = digestBytes32.startsWith('0x') ? digestBytes32 : `0x${digestBytes32}`;
    const pubkeyBytes = ethers.utils.arrayify(hex);

    const full = Uint8Array.from([
      0x00, 0x24, // CIDv1 prefix
      0x08, 0x01, // ed25519-pub key
      0x12, 0x20, // multihash: sha2-256, 32 bytes
      ...pubkeyBytes,
    ]);

    return base58.encode(full);
  } catch (err) {
    console.error('Failed to convert bytes32 to PeerID:', digestBytes32, err);
    return digestBytes32;
  }
}
