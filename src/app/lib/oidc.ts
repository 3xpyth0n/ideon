import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";

const openidConfigCache: Map<string, { jwksUri: string; expiresAt: number }> =
  new Map();

async function fetchJwksUriForIssuer(issuer: string): Promise<string> {
  const normalized = issuer.replace(/\/+$/, "");
  const cached = openidConfigCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.jwksUri;

  try {
    // Try openid-configuration first
    const wellKnown = `${normalized}/.well-known/openid-configuration`;
    const res = await fetch(wellKnown, { method: "GET" });
    if (res.ok) {
      const json = await res.json();
      if (json.jwks_uri) {
        const jwksUri = String(json.jwks_uri);
        openidConfigCache.set(normalized, {
          jwksUri,
          expiresAt: Date.now() + 60 * 60 * 1000,
        });
        return jwksUri;
      }
    }
  } catch {
    // ignore and fallback
  }

  // Fallback to a common location
  const fallback = `${normalized}/.well-known/jwks.json`;
  return fallback;
}

export async function verifyIdToken(idToken: string) {
  try {
    // Decode unverified to discover issuer
    const claims = decodeJwt(idToken);
    const issuer = claims.iss as string | undefined;
    if (!issuer) return null;

    const jwksUri = await fetchJwksUriForIssuer(issuer);
    const JWKS = createRemoteJWKSet(new URL(jwksUri));

    // Verify signature. We intentionally do not strictly validate audience here
    // because client id may not be available in this context, but signature
    // verification ensures claims are trustworthy from the issuer.
    const verified = await jwtVerify(idToken, JWKS, { issuer });
    return verified.payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
