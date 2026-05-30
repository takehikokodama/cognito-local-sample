import crypto from "node:crypto";

export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  const computed =
    method === "S256"
      ? crypto.createHash("sha256").update(codeVerifier).digest("base64url")
      : codeVerifier;
  return computed === codeChallenge;
}
