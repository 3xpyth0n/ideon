import type { LeveldbPersistence } from "y-leveldb";
import * as Y from "yjs";
import { docs, getPersistence } from "./y-websocket/utils";

export interface ProjectYjsDoc {
  doc: Y.Doc;
  isLive: boolean;
  persist: () => Promise<void>;
}

export async function getProjectYjsDoc(
  projectId: string,
): Promise<ProjectYjsDoc | null> {
  const docName = `project-${projectId}`;
  const liveDoc = docs.get(docName);
  if (liveDoc) {
    return {
      doc: liveDoc,
      isLive: true,
      persist: async () => {},
    };
  }

  const persistence = getPersistence()?.provider as
    | LeveldbPersistence
    | undefined;
  if (!persistence) return null;

  const persistedDoc = await persistence.getYDoc(docName);
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(persistedDoc));
  } catch (error) {
    doc.destroy();
    throw error;
  } finally {
    persistedDoc.destroy();
  }

  return {
    doc,
    isLive: false,
    persist: async () => {
      await persistence.storeUpdate(docName, Y.encodeStateAsUpdate(doc));
    },
  };
}
