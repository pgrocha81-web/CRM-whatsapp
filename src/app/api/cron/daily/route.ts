import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobs } from "@/lib/avisos/jobs";
import { isAuthorizedCron } from "@/lib/http/cron-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Rotina diária (Vercel Cron, 8h de São Paulo) — avisos de viagem e de vencimento. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  const report = await runDailyJobs(createSupabaseServiceClient());
  if (report.errors.length) console.error("[cron/daily] erros:", report.errors);
  return NextResponse.json(report);
}
