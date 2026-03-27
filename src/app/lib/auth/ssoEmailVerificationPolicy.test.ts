import { describe, expect, it } from "vitest";
import { resolveSsoEmailVerificationPolicy } from "./ssoEmailVerificationPolicy";

describe("resolveSsoEmailVerificationPolicy", () => {
  it("allows unverified SSO email for existing users", async () => {
    const result = await resolveSsoEmailVerificationPolicy({
      accountType: "oidc",
      provider: "oidc",
      profile: { email_verified: false },
      hasExistingUser: true,
      hasValidInvitation: false,
    });

    expect(result).toEqual({
      hasUnverifiedClaim: true,
      shouldBlock: false,
      bypassReason: "existing_user",
    });
  });

  it("allows unverified SSO email for invited users", async () => {
    const result = await resolveSsoEmailVerificationPolicy({
      accountType: "oauth",
      provider: "google",
      profile: { email_verified: false },
      hasExistingUser: false,
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
      hasValidInvitation: false,
    });

    expect(result).toEqual({ hasUnverifiedClaim: false, shouldBlock: false });
  });
});
