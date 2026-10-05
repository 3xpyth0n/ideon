import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as ipaddr from "ipaddr.js";
import { z } from "zod";
import { isSafeUrl } from "../../app/lib/security-utils";

const repositoryPathPattern = /^[^\\<>:"|?*]+$/;
const repositoryBranchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

function isSafeRepositoryPath(path: string): boolean {
  if ([...path].some((character) => character.charCodeAt(0) < 0x20)) {
    return false;
  }
  if (!path) return true;
  if (
    !repositoryPathPattern.test(path) ||
    path.startsWith("/") ||
    path.endsWith("/")
  ) {
    return false;
  }
  return path
    .split("/")
    .every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.endsWith(".") &&
        !segment.endsWith(" ") &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    );
}

export const repositoryRemoteSettingsSchema = z
  .object({
    repositoryUrl: z.string().trim().min(1).max(2048),
    repositoryUsername: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .nullable()
      .default(null),
    branch: z.string().min(1).max(255).regex(repositoryBranchPattern),
    repositoryPath: z.string().max(512).default(""),
  })
  .strict()
  .superRefine((settings, context) => {
    if (!isSafeRepositoryPath(settings.repositoryPath)) {
      context.addIssue({
        code: "custom",
        path: ["repositoryPath"],
        message: "Invalid repository path",
      });
    }
  });

export type RepositoryRemoteSettings = z.infer<
  typeof repositoryRemoteSettingsSchema
> & { repositoryUrl: string; resolvedAddresses: string[] };

export class RepositoryRemoteSettingsError extends Error {
  constructor(
    readonly code:
      | "invalid_url"
      | "unsafe_host"
      | "invalid_branch"
      | "invalid_path",
  ) {
    super(code);
    this.name = "RepositoryRemoteSettingsError";
  }
}

function getPrivateHostAllowlist(): Set<string> {
  return new Set(
    (process.env.GIT_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function defaultRepositoryUsername(hostname: string): string {
  const host = hostname.toLowerCase();
  if (host === "github.com") return "x-access-token";
  if (host === "gitlab.com") return "oauth2";
  return "oauth2";
}

export async function validateRepositoryRemoteSettings(
  value: unknown,
): Promise<RepositoryRemoteSettings> {
  const parsed = repositoryRemoteSettingsSchema.safeParse(value);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "branch")) {
      throw new RepositoryRemoteSettingsError("invalid_branch");
    }
    if (
      parsed.error.issues.some((issue) => issue.path[0] === "repositoryUrl")
    ) {
      throw new RepositoryRemoteSettingsError("invalid_url");
    }
    throw new RepositoryRemoteSettingsError("invalid_path");
  }

  let url: URL;
  try {
    url = new URL(parsed.data.repositoryUrl);
  } catch {
    throw new RepositoryRemoteSettingsError("invalid_url");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname
  ) {
    throw new RepositoryRemoteSettingsError("invalid_url");
  }

  const host = url.host.toLowerCase();
  const privateHostAllowed = getPrivateHostAllowlist().has(host);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new RepositoryRemoteSettingsError("unsafe_host");
  }
  const resolvedAddresses = addresses.map(({ address }) => {
    try {
      return ipaddr.process(address).toString();
    } catch {
      throw new RepositoryRemoteSettingsError("unsafe_host");
    }
  });
  if (
    !privateHostAllowed &&
    addresses.some(
      ({ address }) => ipaddr.process(address).range() !== "unicast",
    )
  ) {
    throw new RepositoryRemoteSettingsError("unsafe_host");
  }
  if (!privateHostAllowed && !isSafeUrl(url.toString())) {
    throw new RepositoryRemoteSettingsError("unsafe_host");
  }

  const branch = parsed.data.branch;
  if (
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.split("/").some((segment) => segment.startsWith("."))
  ) {
    throw new RepositoryRemoteSettingsError("invalid_branch");
  }

  return {
    ...parsed.data,
    repositoryUrl: url.toString(),
    repositoryUsername:
      parsed.data.repositoryUsername || defaultRepositoryUsername(url.hostname),
    resolvedAddresses,
  };
}
