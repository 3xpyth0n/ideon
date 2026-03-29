import { verifyIdToken } from "../oidc";
import { logSecurityEvent } from "../audit";

export type SsoBypassReason = "existing_user" | "pending_invitation";

export interface ResolveSsoEmailVerificationInput {
  accountType?: string | null;
  provider?: string | null;
  profile?: Record<string, unknown> | null;
  hasExistingUser: boolean;
  hasValidInvitation: boolean;
  idToken?: string | null;
}

export interface ResolveSsoEmailVerificationResult {
  hasUnverifiedClaim: boolean;
  shouldBlock: boolean;
  bypassReason?: SsoBypassReason;
}

const SSO_ACCOUNT_TYPES = new Set(["oauth", "oidc"]);

export async function resolveSsoEmailVerificationPolicy({
  accountType,
  provider,
  profile,
  hasExistingUser,
  hasValidInvitation,
  idToken,
}: ResolveSsoEmailVerificationInput): Promise<ResolveSsoEmailVerificationResult> {
  const isSsoAccount =
    typeof accountType === "string" && SSO_ACCOUNT_TYPES.has(accountType);

  if (!isSsoAccount) {
    return { hasUnverifiedClaim: false, shouldBlock: false };
  }

  // If id_token is present, try to verify it and trust its email_verified claim
  if (idToken) {
    try {
      const claims = await verifyIdToken(idToken);
      if (claims && "email_verified" in claims) {
        const emailVerified = claims.email_verified as boolean;
        if (emailVerified === true) {
          return { hasUnverifiedClaim: false, shouldBlock: false };
        }
        if (emailVerified === false) {
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
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await logSecurityEvent("sso:id_token_verify:error", "failure", {
        error: msg,
        provider,
      });
      // Fall through to profile-based checks
    }
  }

  // Fall back to profile values
  if (!profile) {
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
