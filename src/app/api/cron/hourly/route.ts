import { NextResponse, type NextRequest } from "next/server";
import { runHourlyJobs } from "@/lib/avisos/jobs";
import { isAuthorizedCron } from "@/lib/http/cron-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Rotina de hora em hora (chamada pelo pg_cron do Supabase) — lembretes do bot e re-tentativas. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  const report = await runHourlyJobs(createSupabaseServiceClient());
  if (report.errors.length) console.error("[cron/hourly] erros:", report.errors);
  return NextResponse.json(report);
}

export const POST = GET;
