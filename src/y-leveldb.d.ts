declare module "y-leveldb" {
  import { Doc } from "yjs";
  export class LeveldbPersistence {
    constructor(dir: string);
    getYDoc(docName: string): Promise<Doc>;
    storeUpdate(docName: string, update: Uint8Array): Promise<void>;
    writeState(docName: string, ydoc: Doc): Promise<void>;
    clearDocument(docName: string): Promise<void>;
  }
}
