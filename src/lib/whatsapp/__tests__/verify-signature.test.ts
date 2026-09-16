import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "../verify-signature";

describe("verifyMetaSignature", () => {
  const appSecret = "test-secret";
  const body = JSON.stringify({ hello: "world" });

  function sign(payload: string, secret: string) {
    return "sha256=" + createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  }

  it("aceita uma assinatura válida", () => {
    const signature = sign(body, appSecret);
    expect(verifyMetaSignature(body, signature, appSecret)).toBe(true);
  });

  it("rejeita assinatura com secret errado", () => {
    const signature = sign(body, "outro-secret");
    expect(verifyMetaSignature(body, signature, appSecret)).toBe(false);
  });

  it("rejeita assinatura ausente", () => {
    expect(verifyMetaSignature(body, null, appSecret)).toBe(false);
  });

  it("rejeita header sem prefixo sha256=", () => {
    expect(verifyMetaSignature(body, "abc123", appSecret)).toBe(false);
  });

  it("rejeita payload alterado após assinatura", () => {
    const signature = sign(body, appSecret);
    const tamperedBody = JSON.stringify({ hello: "world!" });
    expect(verifyMetaSignature(tamperedBody, signature, appSecret)).toBe(false);
  });
});
