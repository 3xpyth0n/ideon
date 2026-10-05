import { createHash } from "node:crypto";
import {
  createRepositorySyncBundle,
  parseRepositorySyncBundle,
  parseRepositorySyncManifest,
  RepositorySyncFormatError,
  type RepositorySyncFileInput,
  type RepositorySyncManifest,
} from "./manifest";

export type RepositorySyncConflictMode = "git-wins" | "ideon-wins" | "manual";

export interface RepositorySyncConflict {
  path: string;
  kind: "project" | "block" | "link" | "file";
}

export interface RepositorySyncMergeResult {
  bundle: Record<string, Uint8Array>;
  conflicts: RepositorySyncConflict[];
}

export class RepositorySyncMergeError extends Error {
  constructor(readonly code: "different_project" | "inconsistent_graph") {
    super(code);
    this.name = "RepositorySyncMergeError";
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function equal<T>(left: T | null, right: T | null): boolean {
  return left === null || right === null
    ? left === right
    : stableJson(left) === stableJson(right);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeEntityValue(
  path: string,
  kind: "block" | "link",
  base: unknown,
  ideon: unknown,
  git: unknown,
  mode: RepositorySyncConflictMode,
  conflicts: RepositorySyncConflict[],
): unknown {
  if (equal(ideon, git)) return ideon;
  if (equal(ideon, base)) return git;
  if (equal(git, base)) return ideon;
  if (isPlainObject(ideon) && isPlainObject(git) && isPlainObject(base)) {
    const result: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(base),
      ...Object.keys(ideon),
      ...Object.keys(git),
    ]);
    for (const key of [...keys].sort()) {
      result[key] = mergeEntityValue(
        `${path}/${key}`,
        kind,
        base[key] ?? null,
        ideon[key] ?? null,
        git[key] ?? null,
        mode,
        conflicts,
      );
    }
    return result;
  }
  conflicts.push({ path, kind });
  return mode === "git-wins" ? git : ideon;
}

function mergeEntityMap<T extends { id: string }>(
  kind: "block" | "link",
  base: readonly T[],
  ideon: readonly T[],
  git: readonly T[],
  mode: RepositorySyncConflictMode,
  conflicts: RepositorySyncConflict[],
): T[] {
  const baseById = new Map(base.map((entry) => [entry.id, entry]));
  const ideonById = new Map(ideon.map((entry) => [entry.id, entry]));
  const gitById = new Map(git.map((entry) => [entry.id, entry]));
  const ids = new Set([
    ...baseById.keys(),
    ...ideonById.keys(),
    ...gitById.keys(),
  ]);
  const merged: T[] = [];

  for (const id of [...ids].sort()) {
    const selected = mergeEntityValue(
      `${kind}s/${id}`,
      kind,
      baseById.get(id) ?? null,
      ideonById.get(id) ?? null,
      gitById.get(id) ?? null,
      mode,
      conflicts,
    );
    if (selected) merged.push(selected as T);
  }

  return merged;
}

function fileSignature(
  file: RepositorySyncManifest["files"][number] | null,
): string | null {
  return file ? `${file.kind}:${file.sha256}:${file.size}` : null;
}

function mergeFileMap(
  base: RepositorySyncManifest["files"],
  ideon: RepositorySyncManifest["files"],
  git: RepositorySyncManifest["files"],
  mode: RepositorySyncConflictMode,
  conflicts: RepositorySyncConflict[],
): RepositorySyncManifest["files"] {
  const baseByPath = new Map(base.map((file) => [file.path, file]));
  const ideonByPath = new Map(ideon.map((file) => [file.path, file]));
  const gitByPath = new Map(git.map((file) => [file.path, file]));
  const paths = new Set([
    ...baseByPath.keys(),
    ...ideonByPath.keys(),
    ...gitByPath.keys(),
  ]);
  const merged: RepositorySyncManifest["files"] = [];

  for (const path of [...paths].sort()) {
    const baseFile = baseByPath.get(path) ?? null;
    const ideonFile = ideonByPath.get(path) ?? null;
    const gitFile = gitByPath.get(path) ?? null;
    const baseSignature = fileSignature(baseFile);
    const ideonSignature = fileSignature(ideonFile);
    const gitSignature = fileSignature(gitFile);
    let selected: typeof baseFile;

    if (ideonSignature === gitSignature) {
      selected = ideonFile;
    } else if (ideonSignature === baseSignature) {
      selected = gitFile;
    } else if (gitSignature === baseSignature) {
      selected = ideonFile;
    } else {
      conflicts.push({ path: `.ideon/${path}`, kind: "file" });
      selected = mode === "git-wins" ? gitFile : ideonFile;
    }

    if (selected) merged.push(selected);
  }

  return merged;
}

function mergeProject<T>(
  field: "name" | "description" | "canvasStatesPath",
  base: T,
  ideon: T,
  git: T,
  mode: RepositorySyncConflictMode,
  conflicts: RepositorySyncConflict[],
): T {
  if (equal(ideon, git)) return ideon;
  if (equal(ideon, base)) return git;
  if (equal(git, base)) return ideon;

  conflicts.push({ path: `project/${field}`, kind: "project" });
  return mode === "git-wins" ? git : ideon;
}

function getFileBytes(
  path: string,
  hash: string,
  bundles: readonly Readonly<Record<string, Uint8Array>>[],
): Uint8Array {
  const bundlePath = `.ideon/${path}`;
  for (const bundle of bundles) {
    const bytes = bundle[bundlePath];
    if (bytes && createHash("sha256").update(bytes).digest("hex") === hash) {
      return bytes;
    }
  }
  throw new RepositorySyncFormatError("missing_file");
}

export function mergeRepositorySyncBundles(
  baseValue: unknown,
  ideonBundle: Readonly<Record<string, Uint8Array>>,
  gitBundle: Readonly<Record<string, Uint8Array>>,
  mode: RepositorySyncConflictMode,
): RepositorySyncMergeResult {
  const baseManifest = parseRepositorySyncManifest(baseValue);
  const ideonManifest = parseRepositorySyncBundle(ideonBundle);
  const gitManifest = parseRepositorySyncBundle(gitBundle);

  if (
    baseManifest.project.id !== ideonManifest.project.id ||
    baseManifest.project.id !== gitManifest.project.id
  ) {
    throw new RepositorySyncMergeError("different_project");
  }

  const conflicts: RepositorySyncConflict[] = [];
  const project = {
    id: baseManifest.project.id,
    name: mergeProject(
      "name",
      baseManifest.project.name,
      ideonManifest.project.name,
      gitManifest.project.name,
      mode,
      conflicts,
    ),
    description: mergeProject(
      "description",
      baseManifest.project.description,
      ideonManifest.project.description,
      gitManifest.project.description,
      mode,
      conflicts,
    ),
  };
  const blocks = mergeEntityMap(
    "block",
    baseManifest.blocks,
    ideonManifest.blocks,
    gitManifest.blocks,
    mode,
    conflicts,
  );
  const links = mergeEntityMap(
    "link",
    baseManifest.links,
    ideonManifest.links,
    gitManifest.links,
    mode,
    conflicts,
  );
  const canvasStatesPath = mergeProject(
    "canvasStatesPath",
    baseManifest.canvasStatesPath,
    ideonManifest.canvasStatesPath,
    gitManifest.canvasStatesPath,
    mode,
    conflicts,
  );
  const files = mergeFileMap(
    baseManifest.files,
    ideonManifest.files,
    gitManifest.files,
    mode,
    conflicts,
  );

  const sourceBundles = [ideonBundle, gitBundle];
  const fileInputs: RepositorySyncFileInput[] = files.map((file) => ({
    path: file.path,
    kind: file.kind,
    content: getFileBytes(file.path, file.sha256, sourceBundles),
  }));

  try {
    const bundle = createRepositorySyncBundle(
      {
        format: "ideon-repository",
        version: 1,
        project,
        blocks,
        links,
        canvasStatesPath,
      },
      fileInputs,
    );
    return { bundle, conflicts };
  } catch (error) {
    if (error instanceof RepositorySyncFormatError) {
      throw new RepositorySyncMergeError("inconsistent_graph");
    }
    throw error;
  }
}
