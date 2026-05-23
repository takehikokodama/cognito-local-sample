import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Context, Next } from "hono";

export interface AuthUser {
  sub: string;
  email: string;
  groups: string[];
  tenantId: string;
}

export type AppVariables = {
  user: AuthUser;
};

const ISSUER = process.env.OIDC_ISSUER ?? "http://localhost:4000";
const JWKS_URI =
  process.env.OIDC_JWKS_URI ??
  "http://localhost:4000/.well-known/jwks.json";

const jwks = createRemoteJWKSet(new URL(JWKS_URI));

export async function authMiddleware(
  c: Context<{ Variables: AppVariables }>,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER });

    if (payload["token_use"] !== "access") {
      return c.json({ error: "Unauthorized: not an access token" }, 401);
    }

    c.set("user", {
      sub: payload.sub as string,
      email: payload["email"] as string,
      groups: (payload["cognito:groups"] as string[]) ?? [],
      tenantId: payload["custom:tenant_id"] as string,
    });

    await next();
  } catch {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }
}
