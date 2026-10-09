import { makeExportSource, type SourceInput } from '../legacy-export/source';
import { seed, modernKey } from '../legacy-source/fixture';
export {
  prepareLocalClear,
  clearLocalWorkspace,
  resumeLocalClear,
} from '../../src/crdt/localClear';
export async function seedSource(input: SourceInput) {
  const source = makeExportSource(input);
  try {
    await seed([0], [1, 2], source.updates);
  } finally {
    source.doc.destroy();
  }
  localStorage.removeItem(modernKey); // The generic fixture's unrelated fake ciphertext is not a real owner.
}
