import { AuthUser } from "@auth";
import { Kysely } from "kysely";
import { database } from "@lib/types/db";
import { IntegrationImportSource } from "../types";

export interface ImportedNote {
  path: string;
  title: string;
  content: string;
}

export interface ImportedAsset {
  path: string;
  name: string;
  mimeType: string;
  content: Buffer;
}

export interface ImportedRelation {
  sourcePath: string;
  targetPath: string;
  label?: string;
}

export interface NormalizedImportData {
  suggestedProjectName: string;
  notes: ImportedNote[];
  assets: ImportedAsset[];
  relations: ImportedRelation[];
}

export interface IntegrationImportInput {
  source: IntegrationImportSource;
  projectName?: string;
  zipBuffer?: Buffer;
  directoryPath?: string;
}

export interface IntegrationImportContext {
  user: AuthUser;
  db: Kysely<database>;
  input: IntegrationImportInput;
}

export interface IntegrationImportResult {
  projectId: string;
  projectName: string;
  notesCount: number;
  assetsCount: number;
  relationsCount: number;
}

export interface IntegrationImporter {
  executeImport: (
    context: IntegrationImportContext,
  ) => Promise<IntegrationImportResult>;
}
