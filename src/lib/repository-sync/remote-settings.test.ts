import { afterEach, describe, expect, it } from "vitest";
import {
  RepositoryRemoteSettingsError,
  validateRepositoryRemoteSettings,
} from "./remote-settings";

const originalAllowlist = process.env.GIT_ALLOWED_HOSTS;

afterEach(() => {
  if (originalAllowlist === undefined) {
    delete process.env.GIT_ALLOWED_HOSTS;
  } else {
    process.env.GIT_ALLOWED_HOSTS = originalAllowlist;
  }
});

describe("repository remote settings", () => {
  it("requires HTTPS without embedded credentials", async () => {
    await expect(
      validateRepositoryRemoteSettings({
        repositoryUrl: "http://github.com/team/project.git",
        branch: "main",
        repositoryPath: "",
      }),
    ).rejects.toMatchObject({ code: "invalid_url" });

    await expect(
      validateRepositoryRemoteSettings({
        repositoryUrl: "https://user@example.com/team/project.git",
        branch: "main",
        repositoryPath: "",
      }),
    ).rejects.toMatchObject({ code: "invalid_url" });
  });

  it("rejects private IP remotes unless their exact host is allowlisted", async () => {
    process.env.GIT_ALLOWED_HOSTS = "";
    await expect(
      validateRepositoryRemoteSettings({
        repositoryUrl: "https://127.0.0.1/team/project.git",
        branch: "main",
        repositoryPath: "",
      }),
    ).rejects.toBeInstanceOf(RepositoryRemoteSettingsError);

    process.env.GIT_ALLOWED_HOSTS = "127.0.0.1";
    await expect(
      validateRepositoryRemoteSettings({
        repositoryUrl: "https://127.0.0.1/team/project.git",
        branch: "main",
        repositoryPath: "",
      }),
    ).resolves.toMatchObject({ branch: "main" });
  });

  it("rejects unsafe branches and repository paths", async () => {
    await expect(
      validateRepositoryRemoteSettings({
        repositoryUrl: "https://127.0.0.1/team/project.git",
        branch: "../main",
        repositoryPath: "",
      }),
    ).rejects.toMatchObject({ code: "invalid_branch" });

    await expect(
      validateRepositoryRemoteSettings({
        repositoryUrl: "https://127.0.0.1/team/project.git",
        branch: "main",
        repositoryPath: "../outside",
      }),
    ).rejects.toMatchObject({ code: "invalid_path" });
  });

  it("defaults an omitted repository path to the repository root", async () => {
    process.env.GIT_ALLOWED_HOSTS = "127.0.0.1";

    await expect(
      validateRepositoryRemoteSettings({
        repositoryUrl: "https://127.0.0.1/team/project.git",
        branch: "main",
      }),
    ).resolves.toMatchObject({ repositoryPath: "" });
  });
});
