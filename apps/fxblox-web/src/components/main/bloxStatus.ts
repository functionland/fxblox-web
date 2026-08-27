// Connection status → dot / colour / i18n key, shared by the Blox hero, BloxManager cards and the sheets.
import type { ColorToken, FxStatus } from '@functionland/fx-ui';
import type { TBloxConectionStatus } from '@/models/blox';

export function statusToDot(status?: TBloxConectionStatus): FxStatus {
  switch (status) {
    case 'CONNECTED':
      return 'connected';
    case 'CHECKING':
    case 'SWITCHING':
      return 'checking';
    default:
      return 'disconnected';
  }
}

export function statusToColor(status?: TBloxConectionStatus): ColorToken {
  switch (status) {
    case 'CONNECTED':
      return 'successBase';
    case 'CHECKING':
    case 'SWITCHING':
      return 'warningBase';
    default:
      return 'errorBase';
  }
}

/** i18n key for the mobile status labels (`CONNECTED`, `SWITCHING...`, …, `UNKNOWN`). */
export function statusLabelKey(status?: TBloxConectionStatus): string {
  return status ? `main.blox.status.${status}` : 'main.blox.status.unknown';
}

export const isBusyStatus = (status?: TBloxConectionStatus): boolean =>
  status === 'CHECKING' || status === 'SWITCHING';
