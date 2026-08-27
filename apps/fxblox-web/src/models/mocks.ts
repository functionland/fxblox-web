/**
 * Mock data the mobile app keeps under `api/{users,hub,tower,connectedDApps,bloxHardware}.ts`. The Users tab and
 * the gallery still render these (decision: Users stays mock data). Image `require()`s were dropped — WS4 maps
 * the `imageKey`s to static imports.
 */
import type { TBloxFolderSize } from './blox';

export type TMockBlox = {
  id: string;
  totalStorage: number;
  poolAllocation: number;
  name: string;
  usageStats: { decentralizedId: string; storage: number }[];
};

export const mockBlockHardware: TMockBlox[] = [
  {
    id: '1',
    totalStorage: 800000,
    poolAllocation: 400000,
    name: 'Office Setup',
    usageStats: [
      { decentralizedId: 'key:abc12345xyz', storage: 500000 },
      { decentralizedId: 'ghoim234tnas09', storage: 30000 },
      { decentralizedId: '1plk09aslkm', storage: 28500 },
      { decentralizedId: 'lkj013980ma', storage: 15300 },
    ],
  },
];

export type TUser = {
  decentralizedId: string;
  peerId: string[];
  name?: string;
  imageKey?: 'sample';
};

export const mockUsers: TUser[] = [
  { decentralizedId: 'key:abc12345xyz', peerId: ['1'], name: 'Alice', imageKey: 'sample' },
  { decentralizedId: 'ghoim234tnas09', peerId: ['1'], name: 'Bob', imageKey: 'sample' },
  { decentralizedId: '1plk09aslkm', peerId: ['1'], name: 'Carol', imageKey: 'sample' },
  { decentralizedId: 'lkj013980ma', peerId: ['1'], name: 'Dave', imageKey: 'sample' },
];

export enum EDeviceStatus {
  InUse = 0,
  BackingUp = 1,
  NotInUse = 2,
  NotAvailable = 3,
}

export type TDevice = {
  name: string;
  capacity: number; // megabytes
  folderInfo: TBloxFolderSize;
  used?: number;
  free?: number;
  status: EDeviceStatus;
  associatedDevices: string[];
};

export type TMockConnectedDApp = {
  id: number;
  name: string;
  isConnected: boolean;
  tag: string;
  storageUsed: number;
  lastUpdate: Date;
};

export const mockConnectedDAppsData: Array<{ id: number; name: string; data: Record<'fileSync' | 'fotos', TMockConnectedDApp> }> = [
  {
    id: 1,
    name: 'Home Blox Setup',
    data: {
      fileSync: { id: 1, name: 'File Sync', isConnected: true, tag: 'Home Blox Setup', storageUsed: 450000, lastUpdate: new Date() },
      fotos: { id: 2, name: 'Fotos', isConnected: true, tag: 'Home Blox Setup', storageUsed: 921600, lastUpdate: new Date() },
    },
  },
  {
    id: 2,
    name: 'Office Blox System',
    data: {
      fileSync: { id: 3, name: 'File Sync', isConnected: true, tag: 'Home Blox Setup', storageUsed: 35000000, lastUpdate: new Date() },
      fotos: { id: 4, name: 'Fotos', isConnected: true, tag: 'Home Blox Setup', storageUsed: 27000000, lastUpdate: new Date() },
    },
  },
];
