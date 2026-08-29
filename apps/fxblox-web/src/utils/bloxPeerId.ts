/**
 * Accepting a Blox peer id that a person pasted.
 *
 * This is how someone who already set their Blox up on the phone adds it to the web app: the mobile app's
 * Users tab lists "Bloxs' PeerId" with a copy button, and that value is all the web app needs — it identifies
 * the Blox, and management runs over libp2p through the relay, so no LAN address is involved.
 *
 * Pasting is lossy in practice, so this is deliberately forgiving about the wrapping and strict about the id:
 * surrounding whitespace, a `/p2p/<id>` fragment, or a whole circuit multiaddr all reduce to the id itself.
 * A multiaddr's LAST `/p2p/` component is the Blox — in `…/p2p/<relay>/p2p-circuit/p2p/<blox>` the first one
 * is the relay, and taking that would add the wrong device.
 */

/** Base58btc, as libp2p encodes an Ed25519 peer id: `12D3KooW` + 44 chars, 52 total. No 0, O, I or l. */
const BLOX_PEER_ID_RE = /^12D3KooW[1-9A-HJ-NP-Za-km-z]{44}$/;

/**
 * The peer id in `input`, or null if there isn't a well-formed one.
 *
 * Returning null rather than throwing keeps this usable directly as a form validator.
 */
export function normalizeBloxPeerId(input: string): string | null {
  let candidate = input.trim();
  if (candidate.length === 0) return null;
  if (candidate.includes('/p2p/')) {
    const parts = candidate.split('/p2p/');
    candidate = parts[parts.length - 1]!.split('/')[0]!;
  }
  candidate = candidate.trim();
  return BLOX_PEER_ID_RE.test(candidate) ? candidate : null;
}

export function isBloxPeerId(input: string): boolean {
  return normalizeBloxPeerId(input) !== null;
}
