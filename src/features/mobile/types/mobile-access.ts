export type Device = { id: string; name: string; fingerprint: string };
export type MobileStatus = {
  enabled: boolean;
  listening: boolean;
  name: string;
  fingerprint: string | null;
  openRouter: boolean;
  remoteAddress: string;
  routerStatus: string;
  addresses: { host: string; port: number }[];
  devices: Device[];
};
export type MobileInvite = { url: string; expires: number };
