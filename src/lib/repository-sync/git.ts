import { execFile } from "node:child_process";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { getDb } from "@lib/db";
import { decryptApiKey } from "@lib/crypto";
import {
  parseRepositorySyncBundle,
  repositorySyncLimits,
  type RepositorySyncManifest,
} from "./manifest";
import {
  RepositoryRemoteSettingsError,
  validateRepositoryRemoteSettings,
  type RepositoryRemoteSettings,
} from "./remote-settings";

const executeFile = promisify(execFile);
const maximumGitOutputBytes = 2 * 1024 * 1024;

export class RepositoryGitError extends Error {
  constructor(
    readonly code:
      | "remote_unavailable"
      | "credentials_unavailable"
      | "branch_update_rejected"
      | "remote_tree_invalid",
  ) {
    super(code);
    this.name = "RepositoryGitError";
  }
}

export interface RepositoryGitSession {
  bundle: Record<string, Uint8Array>;
  commitBundle: (
    bundle: Readonly<Record<string, Uint8Array>>,
  ) => Promise<string | null>;
}

export function buildGitResolveEntries(
  urlValue: string,
  addresses: readonly string[],
): string[] {
  const url = new URL(urlValue);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) return [];
  const port = url.port || "443";
  return addresses.map((address) => {
    const resolved = isIP(address) === 6 ? `[${address}]` : address;
    return `${host}:${port}:${resolved}`;
  });
}

function createGitEnvironment(
  home: string,
  url: string,
  addresses: readonly string[],
  token?: string,
  username?: string,
) {
  const config = [
    ["http.followRedirects", "false"],
    ["protocol.allow", "never"],
    ["protocol.https.allow", "always"],
    ["credential.helper", ""],
  ];
  if (token) {
    const auth = Buffer.from(`${username ?? "oauth2"}:${token}`).toString(
      "base64",
    );
    config.push(["http.extraHeader", `Authorization: Basic ${auth}`]);
  }
  for (const entry of buildGitResolveEntries(url, addresses)) {
    config.push(["http.curloptResolve", entry]);
  }

  const environment: NodeJS.ProcessEnv = {
    PATH: process.env["PATH"],
    HOME: home,
    TMPDIR: process.env["TMPDIR"],
    TMP: process.env["TMP"],
    TEMP: process.env["TEMP"],
    LANG: process.env["LANG"],
    LC_ALL: process.env["LC_ALL"],
    NODE_ENV: process.env["NODE_ENV"],
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_CONFIG_COUNT: String(config.length),
  };
  config.forEach(([key, value], index) => {
    environment[`GIT_CONFIG_KEY_${index}`] = key;
    environment[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  return environment;
}

export function isGitAuthError(stderr: string): boolean {
  return /authentication failed|could not read username|could not prompt for username|invalid username or password|access denied|returned error: 401\b/i.test(
    stderr,
  );
}

async function runGit(
  cwd: string,
  environment: NodeJS.ProcessEnv,
  args: string[],
): Promise<string> {
  try {
    const result = await executeFile("git", args, {
      cwd,
      env: environment,
      encoding: "utf8",
      maxBuffer: maximumGitOutputBytes,
      timeout: 120000,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    const result = error as { code?: string | number; stderr?: string };
    const stderr = typeof result.stderr === "string" ? result.stderr : "";
    if (
      args[0] === "push" &&
      /non-fast-forward|fetch first|rejected/i.test(stderr)
    ) {
      throw new RepositoryGitError("branch_update_rejected");
    }
    if (isGitAuthError(stderr)) {
      throw new RepositoryGitError("credentials_unavailable");
    }
    throw new RepositoryGitError("remote_unavailable");
  }
}

async function findAccessToken(
  userId: string,
  settings: RepositoryRemoteSettings,
): Promise<string | undefined> {
  const url = new URL(settings.repositoryUrl);
  const targetHosts = new Set(
    [url.host, url.hostname].map((host) =>
      host.replace(/^www\./i, "").toLowerCase(),
    ),
  );
  const rows = await getDb()
    .selectFrom("userGitTokens")
    .select(["host", "token"])
    .where("userId", "=", userId)
    .where("enabled", "=", 1)
    .execute();
  const token = rows.find((row) => {
    const host = row.host
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "")
      .toLowerCase();
    return targetHosts.has(host);
  });
  if (!token) return undefined;

  try {
    return decryptApiKey(token.token, userId).trim();
  } catch {
    throw new RepositoryGitError("credentials_unavailable");
  }
}

function remotePath(settings: RepositoryRemoteSettings): string {
  return settings.repositoryPath
    ? `${settings.repositoryPath}/.ideon`
    : ".ideon";
}

function assertContained(root: string, path: string): void {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${sep}`)
  ) {
    throw new RepositoryGitError("remote_tree_invalid");
  }
}

async function assertSafeDirectory(
  repositoryRoot: string,
  target: string,
): Promise<boolean> {
  assertContained(repositoryRoot, target);
  const segments = relative(repositoryRoot, target).split(sep).filter(Boolean);
  let current = repositoryRoot;
  for (const segment of segments) {
    current = join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new RepositoryGitError("remote_tree_invalid");
    }
  }
  return true;
}

async function readDirectoryBundle(
  repositoryRoot: string,
  root: string,
): Promise<Record<string, Uint8Array> | null> {
  const bundle: Record<string, Uint8Array> = {};
  if (!(await assertSafeDirectory(repositoryRoot, root))) return null;

  const pending = [root];
  let totalBytes = 0;
  let fileCount = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      assertContained(root, path);
      if (entry.isSymbolicLink()) {
        throw new RepositoryGitError("remote_tree_invalid");
      }
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.isFile()) throw new RepositoryGitError("remote_tree_invalid");
      const fileInfo = await lstat(path);
      fileCount += 1;
      totalBytes += fileInfo.size;
      if (
        fileCount > repositorySyncLimits.files + 1 ||
        fileInfo.size > repositorySyncLimits.fileBytes ||
        totalBytes > repositorySyncLimits.bundleBytes
      ) {
        throw new RepositoryGitError("remote_tree_invalid");
      }
      const archivePath = `.ideon/${relative(root, path).split(sep).join("/")}`;
      bundle[archivePath] = new Uint8Array(await readFile(path));
    }
  }
  return bundle;
}

async function writeDirectoryBundle(
  repositoryRoot: string,
  root: string,
  bundle: Readonly<Record<string, Uint8Array>>,
): Promise<void> {
  const parent = join(root, "..");
  if (!(await assertSafeDirectory(repositoryRoot, parent))) {
    await mkdir(parent, { recursive: true });
    if (!(await assertSafeDirectory(repositoryRoot, parent))) {
      throw new RepositoryGitError("remote_tree_invalid");
    }
  }
  let rootInfo;
  try {
    rootInfo = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (rootInfo && (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())) {
    throw new RepositoryGitError("remote_tree_invalid");
  }
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const rootPrefix = `${resolve(root)}${sep}`;
  for (const [archivePath, content] of Object.entries(bundle)) {
    if (!archivePath.startsWith(".ideon/")) {
      throw new RepositoryGitError("remote_tree_invalid");
    }
    const path = resolve(root, archivePath.slice(".ideon/".length));
    if (!path.startsWith(rootPrefix)) {
      throw new RepositoryGitError("remote_tree_invalid");
    }
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content, { flag: "wx" });
  }
}

export function createEmptyRepositorySyncBundle(
  project: RepositorySyncManifest["project"],
): Record<string, Uint8Array> {
  const manifest: RepositorySyncManifest = {
    format: "ideon-repository",
    version: 1,
    project,
    blocks: [],
    links: [],
    canvasStatesPath: null,
    files: [],
  };
  return {
    ".ideon/manifest.json": new TextEncoder().encode(
      JSON.stringify(manifest, null, 2),
    ),
  };
}

export async function withRemoteRepository<T>(
  value: unknown,
  userId: string,
  project: RepositorySyncManifest["project"],
  callback: (session: RepositoryGitSession) => Promise<T>,
): Promise<T> {
  const settings = await validateRepositoryRemoteSettings(value).catch(
    (error: unknown) => {
      if (error instanceof RepositoryRemoteSettingsError) {
        throw error;
      }
      throw new RepositoryGitError("remote_unavailable");
    },
  );
  const token = await findAccessToken(userId, settings);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "ideon-git-sync-"));
  const environment = createGitEnvironment(
    temporaryDirectory,
    settings.repositoryUrl,
    settings.resolvedAddresses,
    token,
    settings.repositoryUsername ?? undefined,
  );
  const repositoryDirectory = join(temporaryDirectory, "repository");
  const emptyGitConfig = join(temporaryDirectory, "gitconfig");
  await writeFile(emptyGitConfig, "", { flag: "wx" });
  environment.GIT_CONFIG_GLOBAL = emptyGitConfig;

  try {
    await mkdir(repositoryDirectory, { recursive: true });
    await runGit(temporaryDirectory, environment, [
      "init",
      "--initial-branch",
      settings.branch,
      repositoryDirectory,
    ]);
    await runGit(repositoryDirectory, environment, [
      "remote",
      "add",
      "origin",
      settings.repositoryUrl,
    ]);

    const branchRef = `refs/heads/${settings.branch}`;
    const remoteRef = `refs/remotes/origin/${settings.branch}`;
    const remoteBranch = await runGit(repositoryDirectory, environment, [
      "ls-remote",
      "--heads",
      "origin",
      branchRef,
    ]);
    const hasRemoteBranch = remoteBranch.trim().length > 0;

    if (hasRemoteBranch) {
      await runGit(repositoryDirectory, environment, [
        "fetch",
        "--depth=1",
        "--no-tags",
        "--filter=blob:none",
        "origin",
        `${branchRef}:${remoteRef}`,
      ]);
      await runGit(repositoryDirectory, environment, [
        "reset",
        "--hard",
        remoteRef,
      ]);
    }

    const sparsePath = remotePath(settings);
    await runGit(repositoryDirectory, environment, [
      "sparse-checkout",
      "init",
      "--cone",
    ]);
    await runGit(repositoryDirectory, environment, [
      "sparse-checkout",
      "set",
      "--cone",
      sparsePath,
    ]);
    if (hasRemoteBranch) {
      await runGit(repositoryDirectory, environment, [
        "checkout",
        settings.branch,
      ]);
    }

    const root = join(repositoryDirectory, sparsePath);
    const remoteBundle = await readDirectoryBundle(repositoryDirectory, root);
    const bundle = remoteBundle ?? createEmptyRepositorySyncBundle(project);

    const commitBundle = async (
      updatedBundle: Readonly<Record<string, Uint8Array>>,
    ): Promise<string | null> => {
      parseRepositorySyncBundle(updatedBundle);
      await writeDirectoryBundle(repositoryDirectory, root, updatedBundle);
      const pathspec = sparsePath;
      await runGit(repositoryDirectory, environment, [
        "add",
        "--all",
        "--",
        pathspec,
      ]);
      const status = await runGit(repositoryDirectory, environment, [
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        pathspec,
      ]);
      if (!status.trim()) {
        if (!hasRemoteBranch) {
          throw new RepositoryGitError("remote_tree_invalid");
        }
        return runGit(repositoryDirectory, environment, [
          "rev-parse",
          "HEAD",
        ]).then((commit) => commit.trim());
      }

      await runGit(repositoryDirectory, environment, [
        "-c",
        "user.name=Ideon",
        "-c",
        "user.email=ideon-sync@users.noreply.github.com",
        "commit",
        "-m",
        "Update Ideon board files",
      ]);
      const pushArgs = ["push"];
      if (!hasRemoteBranch) pushArgs.push("--set-upstream");
      pushArgs.push("origin", `HEAD:${branchRef}`);
      await runGit(repositoryDirectory, environment, pushArgs);
      return runGit(repositoryDirectory, environment, [
        "rev-parse",
        "HEAD",
      ]).then((commit) => commit.trim());
    };

    return await callback({ bundle, commitBundle });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
