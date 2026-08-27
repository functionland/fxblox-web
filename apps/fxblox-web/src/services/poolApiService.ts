/**
 * pools.fx.land join server. Only `/join` (+429 handling) and `/health` exist server-side — the mobile app's
 * `/leave` and `/cancel` calls were dead routes and are NOT ported; leaving / cancelling goes through the
 * contract (`usePools.leavePool` / `cancelJoinRequest`).
 */
import { env } from '@/config/env';
import type { SupportedChain } from '@/contracts/types';

export interface JoinPoolRequest {
  peerId: string;
  kuboPeerId?: string;
  account: string;
  chain: SupportedChain;
  poolId: number;
}

export interface JoinPoolResponse {
  status: 'ok' | 'err';
  msg: string;
  transactionHash?: string;
  errors?: Array<{ field: string; message: string }>;
}

const FETCH_TIMEOUT_MS = 60000;

export class PoolApiService {
  static BASE_URL = env.POOLS_URL;

  private static async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private static handleAbortError(error: unknown): JoinPoolResponse | null {
    if (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError') {
      return { status: 'err', msg: 'Request timed out. Please try again.' };
    }
    return null;
  }

  private static async handleResponse(response: Response): Promise<JoinPoolResponse> {
    if (response.status === 429) {
      return { status: 'err', msg: 'Too many requests. Please wait a few minutes and try again.' };
    }

    if (!response.ok) {
      try {
        const errorData = (await response.json()) as JoinPoolResponse;
        if (errorData.errors?.length) {
          errorData.msg = errorData.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
        }
        return errorData;
      } catch {
        return { status: 'err', msg: `HTTP error! status: ${response.status}` };
      }
    }

    const data = (await response.json()) as JoinPoolResponse;
    if (data.errors?.length) {
      data.msg = data.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    }
    return data;
  }

  static async joinPool(request: JoinPoolRequest): Promise<JoinPoolResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      return await this.handleResponse(response);
    } catch (error) {
      const abortResult = this.handleAbortError(error);
      if (abortResult) return abortResult;
      console.error('Pool API join error:', error);
      return { status: 'err', msg: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  /** `GET /health` — reachability + CORS feature-detect for the Diagnostics probes. */
  static async health(timeoutMs = 5000): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/health`, { method: 'GET' }, timeoutMs);
      return response.ok;
    } catch {
      return false;
    }
  }
}
