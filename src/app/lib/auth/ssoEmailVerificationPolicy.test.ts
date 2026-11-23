import { describe, expect, it } from "vitest";
import { resolveSsoEmailVerificationPolicy } from "./ssoEmailVerificationPolicy";

describe("resolveSsoEmailVerificationPolicy", () => {
  it("allows unverified SSO email for an already linked account", async () => {
    const result = await resolveSsoEmailVerificationPolicy({
      accountType: "oidc",
      provider: "oidc",
      profile: { email_verified: false },
      hasExistingUser: true,
      hasLinkedAccount: true,
      hasValidInvitation: false,
    });

    expect(result).toEqual({
      hasUnverifiedClaim: true,
      shouldBlock: false,
      bypassReason: "existing_user",
    });
  });

  it.each([
    ["boolean claim", { email_verified: false }, false],
    ["string claim", { email_verified: "false" }, false],
    ["pending invitation", { email_verified: false }, true],
  ])(
    "blocks linking an unverified email to an existing user (%s)",
    async (_label, profile, hasValidInvitation) => {
      const result = await resolveSsoEmailVerificationPolicy({
        accountType: "oidc",
        provider: "oidc",
        profile,
        hasExistingUser: true,
        hasLinkedAccount: false,
        hasValidInvitation,
      });

      expect(result).toEqual({ hasUnverifiedClaim: true, shouldBlock: true });
    },
  );

  it("allows unverified SSO email for invited users", async () => {
    const result = await resolveSsoEmailVerificationPolicy({
      accountType: "oauth",
      provider: "google",
      profile: { email_verified: false },
      hasExistingUser: false,
      hasLinkedAccount: false,
      hasValidInvitation: true,
    });

    expect(result).toEqual({
      hasUnverifiedClaim: true,
      shouldBlock: false,
      bypassReason: "pending_invitation",
    });
  });

  it("blocks unknown unverified SSO users", async () => {
    const result = await resolveSsoEmailVerificationPolicy({
      accountType: "oidc",
      provider: "oidc",
      profile: { email_verified: false },
      hasExistingUser: false,
      hasLinkedAccount: false,
      hasValidInvitation: false,
    });

    expect(result).toEqual({ hasUnverifiedClaim: true, shouldBlock: true });
  });

  it("applies the same policy to Discord verified=false", async () => {
    const result = await resolveSsoEmailVerificationPolicy({
      accountType: "oauth",
      provider: "discord",
      profile: { verified: false },
      hasExistingUser: false,
      hasLinkedAccount: false,
      hasValidInvitation: true,
    });

    expect(result).toEqual({
      hasUnverifiedClaim: true,
      shouldBlock: false,
      bypassReason: "pending_invitation",
    });
  });

  it("does not block SSO when verification claim is absent", async () => {
    const result = await resolveSsoEmailVerificationPolicy({
      accountType: "oauth",
      provider: "google",
      profile: { sub: "abc123" },
      hasExistingUser: false,
      hasLinkedAccount: false,
      hasValidInvitation: false,
    });

    expect(result).toEqual({ hasUnverifiedClaim: false, shouldBlock: false });
  });

  it("never applies to credentials provider flows", async () => {
    const result = await resolveSsoEmailVerificationPolicy({
      accountType: "credentials",
      provider: "credentials",
      profile: { email_verified: false },
      hasExistingUser: false,
      hasLinkedAccount: false,
      hasValidInvitation: false,
    });

    expect(result).toEqual({ hasUnverifiedClaim: false, shouldBlock: false });
  });
});
