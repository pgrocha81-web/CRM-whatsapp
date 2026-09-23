import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Rotas /api/cron/* só rodam com "Authorization: Bearer <CRON_SECRET>".
 * A Vercel Cron envia esse header automaticamente quando CRON_SECRET existe;
 * o pg_cron do Supabase envia o mesmo header (ver docs/AVISOS.md).
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
