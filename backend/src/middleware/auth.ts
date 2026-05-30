import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthUser {
  sub: string;
  email: string;
  groups: string[];
  tenantId: string;
}

export type AppVariables = {
  user: AuthUser;
};

type JwksParam = Parameters<typeof jwtVerify>[1];

const ISSUER = process.env.OIDC_ISSUER ?? "http://localhost:4000";
const JWKS_URI = process.env.OIDC_JWKS_URI ?? "http://localhost:4000/.well-known/jwks.json";

export function buildAuthMiddleware(issuer: string, jwks: JwksParam) {
  return async (
    c: Context<{ Variables: AppVariables }>,
    next: Next,
  ): Promise<Response | undefined> => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await jwtVerify(token, jwks, { issuer });

      if (payload.token_use !== "access") {
        return c.json({ error: "Unauthorized: not an access token" }, 401);
      }

      c.set("user", {
        sub: payload.sub as string,
        email: payload.email as string,
        groups: (payload["cognito:groups"] as string[]) ?? [],
        tenantId: payload["custom:tenant_id"] as string,
      });

      await next();
    } catch {
      return c.json({ error: "Unauthorized: invalid token" }, 401);
    }
  };
}

export const authMiddleware = buildAuthMiddleware(ISSUER, createRemoteJWKSet(new URL(JWKS_URI)));
