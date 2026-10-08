/** Presentation port. Its producer is the held account owner, never the CRDT or chooser hints. */
export interface DeviceRosterSnapshot {
  readonly epoch: number;
  readonly generation?: number;
  readonly detached?: boolean;
  readonly currentDevice: string;
  readonly devices: readonly Readonly<{ id: string; state: 'certified' | 'pending' }>[];
}
export interface DeviceRoster {
  readonly detached?: boolean;
  read(): Promise<DeviceRosterSnapshot>;
}
