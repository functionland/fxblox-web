/**
 * Type surface for `@functionland/fula-sec-web@2.0.3`. The package ships `lib/esm/index.d.ts` as a bundle of
 * ambient `declare module` blocks whose root entry re-exports a non-existent `…/src/index` path, so TypeScript
 * cannot resolve `HDKEY` / `DID` from it. tsconfig `paths` points the package name at this file (runtime
 * resolution is untouched — Vite/Vitest load the real ESM build). Shapes copied from the package's own d.ts.
 */
export type Hex = string;

export interface EdKeypairLike {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  sign(msg: Uint8Array): Promise<Uint8Array>;
  export(format?: string): Promise<string>;
}

export interface ExportedKeyPair {
  publicKey: string;
  secretKey: string;
}

export class HDKEY {
  chainCode: string;
  constructor(password: string);
  createEDKeyPair(signedKey: Hex): EdKeypairLike;
  exportEDKeyPair(secretKey?: Uint8Array): ExportedKeyPair;
  isValidPath(path: string): boolean;
  deriveKeyPath(path: string, offset?: number): EdKeypairLike;
  exportKeyPath(path: string, offset?: number): ExportedKeyPair;
}

export class DID {
  publicKey: Uint8Array;
  constructor(secretKey: Uint8Array);
  extractDIDKey(did: string): Uint8Array;
  did(): string;
  static parseDID(did: string): { method: string; identifier: string };
  static isValidDID(did: string): boolean;
  createJWE(cleartext: string, recipients: unknown[], options?: { protectedHeader?: Record<string, unknown>; aad?: Uint8Array }): Promise<unknown>;
  decryptJWE(jwe: unknown): Promise<string>;
}
