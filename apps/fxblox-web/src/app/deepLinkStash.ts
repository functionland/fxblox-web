/**
 * Deep-link stash (plan §WS4): a deep link (`/autopin-pair?…`, `/connectdapp/…`) received while the app is not
 * set up is stashed here by `RequireSetup`, and consumed at exactly one point — SetupComplete "Home" /
 * ConnectToExistingBlox "Add selected" (`consumeDeepLinkStash()`) — never by `RootGate`, so hydration timing
 * cannot race it. Lives in `sessionStorage`: survives reloads within the tab, not shared across tabs. Entries
 * expire after `DEEP_LINK_STASH_TTL_MS` so a link abandoned mid-setup cannot resurface much later in the same tab.
 */
import { useSyncExternalStore } from 'react';

export const DEEP_LINK_STASH_KEY = 'fx.deepLinkStash.v1';
/** A setup flow (Wi-Fi, pairing, retries) can take a while; anything older than this is treated as abandoned. */
export const DEEP_LINK_STASH_TTL_MS = 60 * 60 * 1000;

interface StashEntry {
  url: string;
  /** Epoch ms when stashed. */
  at: number;
}

const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function emit(): void {
  for (const cb of listeners) cb();
}

/** Basename-relative pathname of a deep-link route (an action on a paired Blox). */
export function isDeepLinkPath(pathname: string): boolean {
  return (
    pathname === '/autopin-pair' ||
    pathname === '/autopin-pair/' ||
    pathname.startsWith('/connectdapp/')
  );
}

/** Only same-origin, basename-relative deep-link URLs may be stashed (no open redirects, no `javascript:`). */
export function isStashableUrl(url: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//')) return false;
  const pathname = url.split(/[?#]/, 1)[0] ?? '';
  return isDeepLinkPath(pathname);
}

function readEntry(now = Date.now()): StashEntry | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(DEEP_LINK_STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StashEntry> | null;
    if (!parsed || typeof parsed.url !== 'string' || typeof parsed.at !== 'number') return null;
    if (!isStashableUrl(parsed.url)) return null;
    if (now - parsed.at > DEEP_LINK_STASH_TTL_MS) return null;
    return { url: parsed.url, at: parsed.at };
  } catch {
    return null;
  }
}

/** Stores `url` (pathname + search). Returns whether it was accepted. Idempotent for the same URL. */
export function stashDeepLink(url: string, now = Date.now()): boolean {
  if (!isStashableUrl(url)) return false;
  const s = storage();
  if (!s) return false;
  try {
    const current = readEntry(now);
    if (current?.url === url) return true;
    s.setItem(DEEP_LINK_STASH_KEY, JSON.stringify({ url, at: now } satisfies StashEntry));
    emit();
    return true;
  } catch {
    return false;
  }
}

export function peekDeepLinkStash(now = Date.now()): string | null {
  return readEntry(now)?.url ?? null;
}

/** Reads AND clears the stash (the single consumption point: SetupComplete "Home" / "Add selected"). */
export function consumeDeepLinkStash(): string | null {
  const v = peekDeepLinkStash();
  clearDeepLinkStash();
  return v;
}

export function clearDeepLinkStash(): void {
  const s = storage();
  if (!s) return;
  try {
    if (s.getItem(DEEP_LINK_STASH_KEY) === null) return;
    s.removeItem(DEEP_LINK_STASH_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function subscribeDeepLinkStash(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => peekDeepLinkStash();
const serverSnapshot = () => null;

/** Reactive view of the stash (SetupShell banner). */
export function useDeepLinkStash(): string | null {
  return useSyncExternalStore(subscribeDeepLinkStash, getSnapshot, serverSnapshot);
}
