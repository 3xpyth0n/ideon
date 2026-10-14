import { createHash } from "node:crypto";
import { z } from "zod";

export const repositorySyncDirectory = ".ideon";
export const repositoryManifestPath = `${repositorySyncDirectory}/manifest.json`;

export const repositorySyncLimits = {
  manifestBytes: 2 * 1024 * 1024,
  fileBytes: 100 * 1024 * 1024,
  bundleBytes: 500 * 1024 * 1024,
  files: 10000,
} as const;

const safeRelativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((path) => {
    const segments = path.split("/");
    return segments.every(
      (segment) =>
        segment.length > 0 &&
        segment.length <= 128 &&
        segment.normalize("NFC") === segment &&
        segment !== "." &&
        segment !== ".." &&
        !/[\\<>:"|?*]/.test(segment) &&
        [...segment].every((character) => character.charCodeAt(0) >= 0x20) &&
        !/[. ]$/.test(segment) &&
        !segment.endsWith(".") &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    );
  });

const repositoryFileSchema = z
  .object({
    path: safeRelativePathSchema,
    kind: z.enum([
      "block-data",
      "link-data",
      "note",
      "note-document",
      "diagram",
      "asset",
      "canvas-state",
    ]),
    size: z.number().int().nonnegative().max(repositorySyncLimits.fileBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const repositoryManifestSchema = z
  .object({
    format: z.literal("ideon-repository"),
    version: z.literal(1),
    project: z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(255),
        description: z.string().max(10000).nullable(),
      })
      .strict(),
    blocks: z
      .array(
        z
          .object({
            id: z.uuid(),
            canvasId: z.union([z.literal("root"), z.uuid()]),
            blockType: z.string().min(1).max(64),
            parentBlockId: z.uuid().nullable(),
            position: z
              .object({
                x: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
                y: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
              })
              .strict(),
            dimensions: z
              .object({
                width: z.number().finite().positive().max(1_000_000).nullable(),
                height: z
                  .number()
                  .finite()
                  .positive()
                  .max(1_000_000)
                  .nullable(),
              })
              .strict(),
            dataPath: safeRelativePathSchema,
            contentPath: safeRelativePathSchema.nullable(),
            noteDocumentPath: safeRelativePathSchema.nullable(),
          })
          .strict(),
      )
      .max(100000),
    links: z
      .array(
        z
          .object({
            id: z.uuid(),
            canvasId: z.union([z.literal("root"), z.uuid()]),
            source: z.uuid(),
            target: z.uuid(),
            dataPath: safeRelativePathSchema,
          })
          .strict(),
      )
      .max(200000),
    canvasStatesPath: z.string().nullable(),
    files: z.array(repositoryFileSchema).max(repositorySyncLimits.files),
  })
  .strict();

export type RepositorySyncManifest = z.infer<typeof repositoryManifestSchema>;
export type RepositorySyncManifestDraft = Omit<RepositorySyncManifest, "files">;

export interface RepositorySyncFileInput {
  path: string;
  kind: RepositorySyncManifest["files"][number]["kind"];
  content: Uint8Array;
}

export class RepositorySyncFormatError extends Error {
  constructor(
    readonly code:
      | "invalid_manifest"
      | "invalid_path"
      | "unexpected_file"
      | "missing_file"
      | "invalid_size"
      | "checksum_mismatch"
      | "invalid_reference",
  ) {
    super(code);
    this.name = "RepositorySyncFormatError";
  }
}

function fail(
  code: ConstructorParameters<typeof RepositorySyncFormatError>[0],
): never {
  throw new RepositorySyncFormatError(code);
}

export function parseRepositorySyncManifest(
  value: unknown,
): RepositorySyncManifest {
  const result = repositoryManifestSchema.safeParse(value);
  if (!result.success) fail("invalid_manifest");

  const manifest = result.data;
  const blockIds = new Set<string>();
  const linkIds = new Set<string>();
  const fileEntries = new Map<string, (typeof manifest.files)[number]>();
  const foldedPaths = new Set<string>();

  for (const file of manifest.files) {
    const foldedPath = file.path.toLowerCase();
    const expectedPrefix = {
      "block-data": "blocks/",
      "link-data": "links/",
      note: "notes/",
      "note-document": "notes/",
      diagram: "diagrams/",
      asset: "assets/",
      "canvas-state": "canvases/",
    }[file.kind];
    if (file.path === "manifest.json" || foldedPaths.has(foldedPath)) {
      fail("invalid_path");
    }
    if (!file.path.startsWith(expectedPrefix)) {
      fail("invalid_path");
    }
    foldedPaths.add(foldedPath);
    fileEntries.set(file.path, file);
  }

  for (const block of manifest.blocks) {
    if (blockIds.has(block.id)) fail("invalid_reference");
    blockIds.add(block.id);
  }

  const referencedPaths = new Set<string>();
  const requireFile = (
    path: string,
    kinds: ReadonlySet<(typeof manifest.files)[number]["kind"]>,
  ) => {
    const file = fileEntries.get(path);
    if (!file || !kinds.has(file.kind) || referencedPaths.has(path)) {
      fail("invalid_reference");
    }
    referencedPaths.add(path);
  };

  const blockCanvases = new Map(
    manifest.blocks.map((block) => [block.id, block.canvasId]),
  );
  const blocksById = new Map(manifest.blocks.map((block) => [block.id, block]));
  for (const block of manifest.blocks) {
    const expectedContentPath =
      block.blockType === "text"
        ? `notes/${block.id}.md`
        : block.blockType === "mermaid"
          ? `diagrams/${block.id}.mmd`
          : null;
    const expectedNoteDocumentPath =
      block.blockType === "text" ? `notes/${block.id}.yjs.json` : null;
    if (
      block.dataPath !== `blocks/${block.id}.json` ||
      block.contentPath !== expectedContentPath ||
      (block.noteDocumentPath !== null &&
        block.noteDocumentPath !== expectedNoteDocumentPath)
    ) {
      fail("invalid_reference");
    }
    if (
      block.parentBlockId &&
      blockCanvases.get(block.parentBlockId) !== block.canvasId
    ) {
      fail("invalid_reference");
    }
    if (
      block.canvasId !== "root" &&
      blocksById.get(block.canvasId)?.blockType !== "subcanvas"
    ) {
      fail("invalid_reference");
    }
    let parentId = block.parentBlockId;
    const ancestors = new Set([block.id]);
    while (parentId) {
      if (ancestors.has(parentId)) fail("invalid_reference");
      ancestors.add(parentId);
      parentId = blocksById.get(parentId)?.parentBlockId ?? null;
    }
    requireFile(block.dataPath, new Set(["block-data"]));
    if (block.contentPath) {
      requireFile(
        block.contentPath,
        new Set([block.blockType === "text" ? "note" : "diagram"]),
      );
    }
    if (block.noteDocumentPath) {
      requireFile(block.noteDocumentPath, new Set(["note-document"]));
    }
  }

  for (const link of manifest.links) {
    if (linkIds.has(link.id)) fail("invalid_reference");
    linkIds.add(link.id);
    if (
      blockCanvases.get(link.source) !== link.canvasId ||
      blockCanvases.get(link.target) !== link.canvasId
    ) {
      fail("invalid_reference");
    }
    requireFile(link.dataPath, new Set(["link-data"]));
  }

  if (manifest.canvasStatesPath !== null) {
    requireFile(manifest.canvasStatesPath, new Set(["canvas-state"]));
  }

  if (
    manifest.files.some(
      (file) => file.kind !== "asset" && !referencedPaths.has(file.path),
    )
  ) {
    fail("invalid_reference");
  }
  if (
    manifest.files.some(
      (file) =>
        file.kind === "asset" &&
        file.path.slice("assets/".length).includes("/"),
    )
  ) {
    fail("invalid_path");
  }

  return manifest;
}

function parseManifest(bytes: Uint8Array): RepositorySyncManifest {
  if (bytes.byteLength > repositorySyncLimits.manifestBytes) {
    fail("invalid_manifest");
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail("invalid_manifest");
  }

  return parseRepositorySyncManifest(value);
}

export function parseRepositorySyncBundle(
  bundle: Readonly<Record<string, Uint8Array>>,
): RepositorySyncManifest {
  const manifestBytes = bundle[repositoryManifestPath];
  if (!(manifestBytes instanceof Uint8Array)) fail("missing_file");

  const manifest = parseManifest(manifestBytes);
  const expectedPaths = new Set([
    repositoryManifestPath,
    ...manifest.files.map((file) => `${repositorySyncDirectory}/${file.path}`),
  ]);
  const actualPaths = Object.keys(bundle);

  if (actualPaths.some((path) => !expectedPaths.has(path))) {
    fail("unexpected_file");
  }
  if (actualPaths.length !== expectedPaths.size) fail("missing_file");

  let bundleBytes = manifestBytes.byteLength;
  for (const file of manifest.files) {
    const path = `${repositorySyncDirectory}/${file.path}`;
    const bytes = bundle[path];
    if (!(bytes instanceof Uint8Array)) fail("missing_file");
    if (bytes.byteLength !== file.size) fail("invalid_size");

    bundleBytes += bytes.byteLength;
    if (bundleBytes > repositorySyncLimits.bundleBytes) fail("invalid_size");

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== file.sha256) fail("checksum_mismatch");
  }

  return manifest;
}

export function createRepositorySyncBundle(
  draft: RepositorySyncManifestDraft,
  files: readonly RepositorySyncFileInput[],
): Record<string, Uint8Array> {
  const sortedFiles = [...files].sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
  const bundle: Record<string, Uint8Array> = {};
  const manifest: RepositorySyncManifest = {
    ...draft,
    blocks: [...draft.blocks].sort((left, right) =>
      `${left.canvasId}/${left.id}`.localeCompare(
        `${right.canvasId}/${right.id}`,
        "en",
      ),
    ),
    links: [...draft.links].sort((left, right) =>
      `${left.canvasId}/${left.id}`.localeCompare(
        `${right.canvasId}/${right.id}`,
        "en",
      ),
    ),
    files: sortedFiles.map(({ path, kind, content }) => ({
      path,
      kind,
      size: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
    })),
  };

  bundle[repositoryManifestPath] = new TextEncoder().encode(
    JSON.stringify(manifest, null, 2),
  );
  for (const file of sortedFiles) {
    bundle[`${repositorySyncDirectory}/${file.path}`] = new Uint8Array(
      file.content,
    );
  }

  parseRepositorySyncBundle(bundle);
  return bundle;
}
