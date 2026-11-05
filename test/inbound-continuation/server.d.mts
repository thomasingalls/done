export type Observation = {
  dropped: number;
  forwarded: number;
  streams: { publisher: string; ready: number; dropped: number; forwarded: number }[];
  batches: {
    code: number;
    reader: string;
    requests: { publisher: string; after: number; limit: number }[];
  }[];
};
export function service(
  directory: string,
  packaged: string,
): Promise<{
  withhold(value: boolean): void;
  counts(): Observation;
  close(): Promise<void>;
}>;
