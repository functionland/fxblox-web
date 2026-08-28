import type { FC, SVGProps } from 'react';
export * from './dApps';
export * from './pool';
export * from './blox';
export * from './account';
export * from './mocks';

export enum EBloxInteractionType {
  HomeBloxSetup = 'HomeBloxSetup',
  OfficeBloxUnit = 'OfficeBloxUnit',
}

export type TBloxInteraction = {
  peerId?: string;
  title: string;
  darkIcon?: FC<SVGProps<SVGSVGElement>>;
  lightIcon?: FC<SVGProps<SVGSVGElement>>;
};

export enum EConnectionStatus {
  notConnected = 'notConnected',
  connecting = 'connecting',
  connected = 'connected',
  failed = 'failed',
  bleConnecting = 'bleConnecting',
  bleConnected = 'bleConnected',
  bleFailed = 'bleFailed',
  /** A typed LAN address did not answer. `failed` names the hotspot, which is not what was tried. */
  lanFailed = 'lanFailed',
}
