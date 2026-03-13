import { readdir, readFile } from "fs/promises";
import { basename, extname, normalize, relative, resolve } from "path";
import { unzipSync, strFromU8 } from "fflate";
import {
  ImportedAsset,
  ImportedNote,
  ImportedRelation,
  NormalizedImportData,
} from "@lib/integrations/import/types";

const WIKI_LINK_REGEX = /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function buildTitleFromPath(pathValue: string): string {
  const fileName = basename(pathValue, ".md");
  return fileName.replace(/[-_]/g, " ").trim() || "Untitled";
}

function findVaultRoots(paths: string[]): string[] {
  const roots = new Set<string>();

  for (const pathValue of paths) {
    const segments = normalizePath(pathValue).split("/").filter(Boolean);

    for (let index = 0; index < segments.length; index += 1) {
      if (segments[index] !== ".obsidian") {
        continue;
      }
      roots.add(segments.slice(0, index).join("/"));
    }
  }

  return Array.from(roots).sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length;
    }
    return left.localeCompare(right);
  });
}

function resolveVaultRoot(paths: string[]): string {
  const roots = findVaultRoots(paths);

  if (!roots.length) {
    throw {
      status: 400,
      message:
        "Invalid Obsidian vault: .obsidian folder was not found in the archive",
    };
  }

  return roots[0];
}

function stripVaultRoot(pathValue: string, vaultRoot: string): string | null {
  const normalizedPath = normalizePath(pathValue);

  if (!vaultRoot) {
    return normalizedPath;
  }

  if (normalizedPath === vaultRoot) {
    return "";
  }

  if (normalizedPath.startsWith(`${vaultRoot}/`)) {
    return normalizedPath.slice(vaultRoot.length + 1);
  }

  return null;
}

function isVaultConfigPath(pathValue: string): boolean {
  return pathValue === ".obsidian" || pathValue.startsWith(".obsidian/");
}

function isHiddenVaultPath(pathValue: string): boolean {
  const segments = normalizePath(pathValue).split("/").filter(Boolean);
  return segments.some(
    (segment) => segment.startsWith(".") && segment !== ".obsidian",
  );
}

function extractWikiTargets(content: string): string[] {
  const targets: string[] = [];

  for (const match of content.matchAll(WIKI_LINK_REGEX)) {
    const target = match[1]?.trim();
    if (target) {
      targets.push(target);
    }
  }

  return targets;
}

function resolveWikiTarget(
  rawTarget: string,
  markdownPaths: string[],
): string | null {
  const normalizedTarget = normalizePath(rawTarget);
  const targetLower = normalizedTarget.toLowerCase();

  const exactPathCandidates = [
    targetLower,
    targetLower.endsWith(".md") ? targetLower : `${targetLower}.md`,
  ];

  for (const candidate of exactPathCandidates) {
    const foundPath = markdownPaths.find((pathValue) =>
      pathValue.toLowerCase().endsWith(candidate),
    );
    if (foundPath) {
      return foundPath;
    }
  }

  const baseName = basename(normalizedTarget, extname(normalizedTarget))
    .toLowerCase()
    .trim();
  if (!baseName) {
    return null;
  }

  const foundByName = markdownPaths.find((pathValue) => {
    const name = basename(pathValue, ".md").toLowerCase().trim();
    return name === baseName;
  });

  return foundByName || null;
}

function parseNormalizedData(
  notes: ImportedNote[],
  assets: ImportedAsset[],
  suggestedProjectName: string,
): NormalizedImportData {
  const markdownPaths = notes.map((note) => note.path);
  const relations: ImportedRelation[] = [];

  for (const note of notes) {
    const targets = extractWikiTargets(note.content);
    for (const rawTarget of targets) {
      const targetPath = resolveWikiTarget(rawTarget, markdownPaths);
      if (!targetPath) {
        continue;
      }

      if (targetPath === note.path) {
        continue;
      }

      relations.push({
        sourcePath: note.path,
        targetPath,
      });
    }
  }

  const deduplicatedRelations = Array.from(
    new Map(
      relations.map((relation) => [
        `${relation.sourcePath}->${relation.targetPath}`,
        relation,
      ]),
    ).values(),
  );

  return {
    suggestedProjectName,
    notes,
    assets,
    relations: deduplicatedRelations,
  };
}

function isMarkdownFile(pathValue: string): boolean {
  return pathValue.toLowerCase().endsWith(".md");
}

function buildAsset(pathValue: string, content: Buffer): ImportedAsset {
  return {
    path: normalizePath(pathValue),
    name: basename(pathValue),
    mimeType: "application/octet-stream",
    content,
  };
}

export function parseObsidianZip(zipBuffer: Buffer): NormalizedImportData {
  const archive = unzipSync(new Uint8Array(zipBuffer));
  const archivePaths = Object.keys(archive).map((entryPath) =>
    normalizePath(entryPath),
  );
  const vaultRoot = resolveVaultRoot(archivePaths);
  const suggestedProjectName = vaultRoot
    ? basename(vaultRoot)
    : "Obsidian Import";

  const notes: ImportedNote[] = [];
  const assets: ImportedAsset[] = [];

  for (const [entryPath, content] of Object.entries(archive)) {
    const normalizedEntryPath = normalizePath(entryPath);
    if (!normalizedEntryPath) {
      continue;
    }

    const vaultRelativePath = stripVaultRoot(normalizedEntryPath, vaultRoot);
    if (!vaultRelativePath || isVaultConfigPath(vaultRelativePath)) {
      continue;
    }

    if (isHiddenVaultPath(vaultRelativePath)) {
      continue;
    }

    if (normalizedEntryPath.endsWith("/")) {
      continue;
    }

    if (isMarkdownFile(vaultRelativePath)) {
      notes.push({
        path: vaultRelativePath,
        title: buildTitleFromPath(vaultRelativePath),
        content: strFromU8(content),
      });
      continue;
    }

    assets.push(buildAsset(vaultRelativePath, Buffer.from(content)));
  }

  return parseNormalizedData(notes, assets, suggestedProjectName);
}

async function walkDirectory(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

export async function parseObsidianDirectory(
  directoryPath: string,
): Promise<NormalizedImportData> {
  const rootPath = resolve(normalize(directoryPath));
  const filePaths = await walkDirectory(rootPath);
  const relativePaths = filePaths.map((filePath) =>
    normalizePath(relative(rootPath, filePath)),
  );
  const vaultRoot = resolveVaultRoot(relativePaths);
  const suggestedProjectName = vaultRoot
    ? basename(vaultRoot)
    : basename(rootPath);

  const notes: ImportedNote[] = [];
  const assets: ImportedAsset[] = [];

  for (const filePath of filePaths) {
    const relativePath = normalizePath(relative(rootPath, filePath));
    const vaultRelativePath = stripVaultRoot(relativePath, vaultRoot);
    if (!vaultRelativePath || isVaultConfigPath(vaultRelativePath)) {
      continue;
    }

    if (isHiddenVaultPath(vaultRelativePath)) {
      continue;
    }

    const content = await readFile(filePath);

    if (isMarkdownFile(vaultRelativePath)) {
      notes.push({
        path: vaultRelativePath,
        title: buildTitleFromPath(vaultRelativePath),
        content: content.toString("utf8"),
      });
      continue;
    }

    assets.push(buildAsset(vaultRelativePath, content));
  }

  return parseNormalizedData(notes, assets, suggestedProjectName);
}
