import { parentPort, workerData } from 'node:worker_threads';
import { collectSql } from './node-collector.mjs';
parentPort.postMessage(collectSql(workerData.path, workerData.surface, workerData.limits));
