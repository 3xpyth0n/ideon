import { describe, expect, it } from "vitest";
import { buildGitResolveEntries, isGitAuthError } from "./git";

describe("Git DNS pinning", () => {
  it("pins every resolved address to the HTTPS host and port", () => {
    expect(
      buildGitResolveEntries("https://git.example.test:8443/team/repo.git", [
        "203.0.113.12",
        "2001:db8::12",
      ]),
    ).toEqual([
      "git.example.test:8443:203.0.113.12",
      "git.example.test:8443:[2001:db8::12]",
    ]);
  });

  it("does not add DNS overrides for an IP literal", () => {
    expect(
      buildGitResolveEntries("https://[2001:db8::12]/team/repo.git", [
        "2001:db8::12",
      ]),
    ).toEqual([]);
  });
});

describe("Git auth error detection", () => {
  it.each([
    [
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    ],
    [
      "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/o/r'",
    ],
    [
      "fatal: Unable to access 'https://github.com/o/r': The requested URL returned error: 401",
    ],
    ["remote: HTTP Basic: Access denied"],
  ])("classifies auth failure as credentials_unavailable: %s", (stderr) => {
    expect(isGitAuthError(stderr)).toBe(true);
  });

  it.each([
    ["fatal: non-fast-forward"],
    [
      "fatal: Unable to access 'https://github.com/o/r': The requested URL returned error: 404",
    ],
    [
      "fatal: Unable to access 'https://github.com/o/r': Could not resolve host: github.com",
    ],
    ["fatal: bad revision 'abcdef'"],
    [""],
  ])("does not flag non-auth git failures: %s", (stderr) => {
    expect(isGitAuthError(stderr)).toBe(false);
  });
});
