/** Presentation port. Its producer is the held account owner, never the CRDT or chooser hints. */
export const deviceCode = (id: string): string => id.slice(0, 8);

export interface DeviceRosterSnapshot {
  readonly epoch: number;
  readonly generation?: number;
  readonly detached?: boolean;
  readonly currentDevice: string;
  readonly devices: readonly Readonly<{ id: string; state: 'certified' | 'pending' }>[];
}
export interface DeviceRoster {
  readonly automaticHistory?:
    | import('./automaticHistoryMaintenance').AutomaticHistoryRuntime
    | undefined;
  readonly localHistory?: import('../crdt/automaticLocalRetention').LocalRetentionView | undefined;
  readonly detached?: boolean;
  readonly transition?: string | undefined;
  history?(
    command: import('./historyMaintenance').HistoryMaintenanceCommand,
  ): Promise<import('./historyMaintenance').HistoryMaintenanceStatus>;
  remove?(target: string): Promise<'pending' | 'applying'>;
  read(): Promise<DeviceRosterSnapshot>;
}
