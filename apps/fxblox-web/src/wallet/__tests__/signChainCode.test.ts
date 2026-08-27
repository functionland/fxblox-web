/**
 * The identity signature must be byte-identical to the mobile LinkPassword screen:
 *   msgHex = '0x' + Buffer.from(new HDKEY(password).chainCode).toString('hex'); personal_sign([msgHex, account.toLowerCase()])
 */
import { describe, expect, test, vi } from 'vitest';
import { HDKEY } from '@functionland/fula-sec-web';
import { chainCodeFor, chainCodeMessageHex, personalSignParams, signChainCode, utf8ToHex } from '../signChainCode';

const PASSWORD = 'correct horse battery staple';
const ACCOUNT = '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('signChainCode', () => {
  test('chainCode is deterministic for a password and matches fula-sec-web directly', () => {
    expect(chainCodeFor(PASSWORD)).toBe(new HDKEY(PASSWORD).chainCode);
    expect(chainCodeFor(PASSWORD)).toBe(chainCodeFor(PASSWORD));
    expect(chainCodeFor(PASSWORD)).not.toBe(chainCodeFor('other'));
  });

  test('message hex equals the mobile Buffer.from(msg).toString("hex") form', () => {
    const cc = chainCodeFor(PASSWORD);
    const mobile = '0x' + Buffer.from(cc).toString('hex');
    expect(chainCodeMessageHex(cc)).toBe(mobile);
    expect(utf8ToHex('héllo')).toBe(Buffer.from('héllo').toString('hex'));
  });

  test('personal_sign params are [msgHex, account.toLowerCase()]', () => {
    const cc = chainCodeFor(PASSWORD);
    expect(personalSignParams(cc, ACCOUNT)).toEqual([chainCodeMessageHex(cc), ACCOUNT.toLowerCase()]);
  });

  test('signChainCode calls provider.request with method personal_sign and returns the signature', async () => {
    const request = vi.fn(async () => '0xsignature');
    const sig = await signChainCode({ request }, ACCOUNT, PASSWORD);
    expect(sig).toBe('0xsignature');
    expect(request).toHaveBeenCalledWith({ method: 'personal_sign', params: [chainCodeMessageHex(chainCodeFor(PASSWORD)), ACCOUNT.toLowerCase()] });
  });

  test('an empty signature or missing account/provider is rejected', async () => {
    await expect(signChainCode({ request: async () => '' }, ACCOUNT, PASSWORD)).rejects.toThrow(/empty signature/);
    await expect(signChainCode({ request: async () => '0x1' }, '', PASSWORD)).rejects.toThrow(/Account/);
  });
});
