export type SsoBypassReason = "existing_user" | "pending_invitation";

export interface ResolveSsoEmailVerificationInput {
  accountType?: string | null;
  provider?: string | null;
  profile?: Record<string, unknown> | null;
  hasExistingUser: boolean;
  hasValidInvitation: boolean;
}

export interface ResolveSsoEmailVerificationResult {
  hasUnverifiedClaim: boolean;
  shouldBlock: boolean;
  bypassReason?: SsoBypassReason;
}

const SSO_ACCOUNT_TYPES = new Set(["oauth", "oidc"]);

export function resolveSsoEmailVerificationPolicy({
  accountType,
  provider,
  profile,
  hasExistingUser,
  hasValidInvitation,
}: ResolveSsoEmailVerificationInput): ResolveSsoEmailVerificationResult {
  const isSsoAccount =
    typeof accountType === "string" && SSO_ACCOUNT_TYPES.has(accountType);
  if (!isSsoAccount || !profile) {
    return { hasUnverifiedClaim: false, shouldBlock: false };
  }

  const hasUnverifiedEmailClaim =
    "email_verified" in profile && profile.email_verified === false;
  const hasUnverifiedDiscordClaim =
    provider === "discord" &&
    "verified" in profile &&
    profile.verified === false;

  if (!hasUnverifiedEmailClaim && !hasUnverifiedDiscordClaim) {
    return { hasUnverifiedClaim: false, shouldBlock: false };
  }

  if (hasExistingUser) {
    return {
      hasUnverifiedClaim: true,
      shouldBlock: false,
      bypassReason: "existing_user",
    };
  }

  if (hasValidInvitation) {
    return {
      hasUnverifiedClaim: true,
      shouldBlock: false,
      bypassReason: "pending_invitation",
    };
  }

  return { hasUnverifiedClaim: true, shouldBlock: true };
}
