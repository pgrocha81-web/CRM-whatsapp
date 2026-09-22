import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { moveOpportunityStage } from "@/lib/crm/db";
import { handleOpportunityWon } from "@/lib/crm/won";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const Body = z.object({
  stage_id: z.string().uuid(),
  reason: z.string().max(300).optional(),
  /** valor fechado em centavos (opcional, ao marcar venda) */
  closed_value_cents: z.number().int().nonnegative().optional(),
});

/**
 * Move uma oportunidade de etapa (usado pelo Kanban).
 * Se a etapa de destino é VENDA FECHADA (is_won): cria evento no Google Calendar,
 * card no Trello e pede ao cliente os vencimentos de passaporte/visto.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  // quem chama precisa ser alguém da equipe logado (RLS confere is_active_staff)
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { data: visible } = await userClient.from("opportunities").select("id").eq("id", id).maybeSingle();
  if (!visible) return NextResponse.json({ error: "oportunidade não encontrada" }, { status: 404 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const sb = createSupabaseServiceClient();
  if (parsed.data.closed_value_cents !== undefined) {
    await sb.from("opportunities").update({ closed_value_cents: parsed.data.closed_value_cents }).eq("id", id);
  }
  const { stage, changed } = await moveOpportunityStage(sb, {
    opportunityId: id,
    toStageId: parsed.data.stage_id,
    reason: parsed.data.reason ?? "movido manualmente",
    actorId: user.id,
  });

  let integrations: { errors: string[] } | null = null;
  if (stage.is_won && changed) integrations = await handleOpportunityWon(sb, id);

  return NextResponse.json({ ok: true, stage: stage.name, integrations });
}
