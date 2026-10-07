/** Presentation port. Its producer is the held account owner, never the CRDT or chooser hints. */
export interface DeviceRosterSnapshot {
  readonly epoch: number;
  readonly currentDevice: string;
  readonly devices: readonly Readonly<{ id: string; state: 'certified' | 'pending' }>[];
}
export interface DeviceRoster {
  read(): Promise<DeviceRosterSnapshot>;
}
