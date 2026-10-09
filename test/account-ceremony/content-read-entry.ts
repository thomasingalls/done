/** Actual client modules bundled together so the process-local history brand is shared. */
export { verifyCertificationHistory } from '../../account-protocol/admissionHistory';
export { verifyInboundPage, verifyStoredInbound } from '../../src/crdt/accountInbound';
export { Y } from '../../src/crdt/yjs';
export { verifyInstalledSuccessor, parseInstalledSuccessor } from '../../src/crdt/accountSuccessor';
export { encodeSpoolEntry, extendSpoolWitness } from '../../src/crdt/spoolRecord';
export { emptySpoolWitness } from '../../src/crdt/contentRecord';
