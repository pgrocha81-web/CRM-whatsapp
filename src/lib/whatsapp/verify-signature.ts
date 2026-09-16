import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida a assinatura HMAC-SHA256 que a Meta envia em todo webhook
 * (header X-Hub-Signature-256), usando o App Secret do Meta App.
 * Documentação: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating-payloads
 *
 * NUNCA processar um payload de webhook sem essa validação passar —
 * caso contrário qualquer um pode forjar requisições para o endpoint.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expectedSignature = signatureHeader.slice("sha256=".length);

  const computedSignature = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const computedBuffer = Buffer.from(computedSignature, "hex");

  if (expectedBuffer.length !== computedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, computedBuffer);
}
