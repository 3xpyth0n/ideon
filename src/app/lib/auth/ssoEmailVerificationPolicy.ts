import { verifyIdToken } from "../oidc";
import { logSecurityEvent } from "../audit";

export type SsoBypassReason = "existing_user" | "pending_invitation";

export interface ResolveSsoEmailVerificationInput {
  accountType?: string | null;
  provider?: string | null;
  profile?: Record<string, unknown> | null;
  hasExistingUser: boolean;
  hasLinkedAccount: boolean;
  hasValidInvitation: boolean;
  idToken?: string | null;
}

export interface ResolveSsoEmailVerificationResult {
  hasUnverifiedClaim: boolean;
  shouldBlock: boolean;
  bypassReason?: SsoBypassReason;
}

const SSO_ACCOUNT_TYPES = new Set(["oauth", "oidc"]);

// Some identity providers send boolean claims as strings
const isFalseClaim = (value: unknown) => value === false || value === "false";
const isTrueClaim = (value: unknown) => value === true || value === "true";

function resolveUnverifiedEmail({
  hasExistingUser,
  hasLinkedAccount,
  hasValidInvitation,
}: Pick<
  ResolveSsoEmailVerificationInput,
  "hasExistingUser" | "hasLinkedAccount" | "hasValidInvitation"
>): ResolveSsoEmailVerificationResult {
  if (hasLinkedAccount) {
    return {
      hasUnverifiedClaim: true,
      shouldBlock: false,
      bypassReason: "existing_user",
    };
  }

  // An email match alone must never grant access to an existing account
  if (!hasExistingUser && hasValidInvitation) {
    return {
      hasUnverifiedClaim: true,
      shouldBlock: false,
      bypassReason: "pending_invitation",
    };
  }

  return { hasUnverifiedClaim: true, shouldBlock: true };
}

export async function resolveSsoEmailVerificationPolicy({
  accountType,
  provider,
  profile,
  hasExistingUser,
  hasLinkedAccount,
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
        if (isTrueClaim(claims.email_verified)) {
          return { hasUnverifiedClaim: false, shouldBlock: false };
        }
        if (isFalseClaim(claims.email_verified)) {
          return resolveUnverifiedEmail({
            hasExistingUser,
            hasLinkedAccount,
            hasValidInvitation,
          });
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
    "email_verified" in profile && isFalseClaim(profile.email_verified);
  const hasUnverifiedDiscordClaim =
    provider === "discord" &&
    "verified" in profile &&
    isFalseClaim(profile.verified);

  if (!hasUnverifiedEmailClaim && !hasUnverifiedDiscordClaim) {
    return { hasUnverifiedClaim: false, shouldBlock: false };
  }

  return resolveUnverifiedEmail({
    hasExistingUser,
    hasLinkedAccount,
    hasValidInvitation,
  });
}
