/**
 * pluginCatalog — the plugin catalogue the mobile GlobalBottomSheet / Plugin screen fetch from
 * raw.githubusercontent.com (`info.json` + `<name>/info.json`).
 */
import { PLUGIN_CATALOG_BASE } from '@/utils/constants';

export interface PluginInfo {
  name: string;
  description: string;
  version: string;
  usage?: { storage: string; compute: string; bandwidth: string; ram: string; gpu: string };
  rewards?: Array<{ type: string; currency: string; link: string }>;
  socials?: Array<{ telegram?: string; twitter?: string; email?: string; website?: string; discord?: string }>;
  requiredInputs?: Array<{ name: string; instructions: string; type: string; default: string }>;
  approved?: boolean;
  installed?: boolean;
  icon?: string;
  [key: string]: unknown;
}

const TIMEOUT_MS = 10_000;

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

function normalize(raw: unknown): PluginInfo[] {
  if (Array.isArray(raw)) return raw as PluginInfo[];
  if (raw && typeof raw === 'object') {
    const obj = raw as { plugins?: unknown };
    if (Array.isArray(obj.plugins)) return obj.plugins as PluginInfo[];
    // { [name]: info } map form
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v && typeof v === 'object')
      .map(([name, v]) => ({ name, ...(v as Record<string, unknown>) }) as PluginInfo);
  }
  return [];
}

export async function fetchPluginCatalog(base: string = PLUGIN_CATALOG_BASE): Promise<PluginInfo[]> {
  return normalize(await getJson<unknown>(`${base}/info.json`));
}

export async function fetchPluginInfo(name: string, base: string = PLUGIN_CATALOG_BASE): Promise<PluginInfo> {
  return getJson<PluginInfo>(`${base}/${encodeURIComponent(name)}/info.json`);
}

export function pluginIconUrl(name: string, file = 'icon.png', base: string = PLUGIN_CATALOG_BASE): string {
  return `${base}/${encodeURIComponent(name)}/${file}`;
}
