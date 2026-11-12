import type { Annotation } from '../types';
import { loadAnnotationRecordForDocAsync, loadAnnotationRecordForDocSync, saveAnnotationsForDoc } from '../storage/storage';
import { migrateNotebook, notebookCarrier } from './document';
import { validateNotebookDocument } from './operations';

interface RecoveryStorage {
  exists: (key: string) => Promise<boolean>;
  save: (key: string, annotations: Annotation[], pageCount: number) => Promise<void>;
}
const storage: RecoveryStorage = {
  exists: async (key) => !!(loadAnnotationRecordForDocSync(key) ?? await loadAnnotationRecordForDocAsync(key)),
  save: (key, annotations, count) => saveAnnotationsForDoc(key, annotations, [], { notebookPageCount: count }),
};

/** Return a candidate only after a durable, untouched recovery snapshot exists. */
export async function prepareNotebookMigration(key: string, annotations: Annotation[], count: number, recovery = storage) {
  if (notebookCarrier(annotations)) return annotations;
  const converted = migrateNotebook(annotations, count);
  validateNotebookDocument(notebookCarrier(converted)!.notebookDocument!);
  const recoveryKey = `${key}:recovery:before-blocks-v1`;
  if (!await recovery.exists(recoveryKey)) await recovery.save(recoveryKey, annotations, count);
  return converted;
}
