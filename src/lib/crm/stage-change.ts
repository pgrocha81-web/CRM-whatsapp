import { moveOpportunityStage, type DB } from "./db";
import { handleOpportunityWon } from "./won";

/**
 * Mudança de etapa feita por alguém da equipe (Kanban ou ficha).
 * Venda fechada dispara Calendar + Trello + pedido de documentos.
 */
export async function changeStageAsStaff(
  sb: DB,
  p: { opportunityId: string; stageId: string; actorId: string; reason?: string; closedValueCents?: number }
) {
  if (p.closedValueCents !== undefined) {
    await sb.from("opportunities").update({ closed_value_cents: p.closedValueCents }).eq("id", p.opportunityId);
  }
  const { stage, changed } = await moveOpportunityStage(sb, {
    opportunityId: p.opportunityId,
    toStageId: p.stageId,
    reason: p.reason ?? "movido manualmente",
    actorId: p.actorId,
  });
  const integrations = stage.is_won && changed ? await handleOpportunityWon(sb, p.opportunityId) : null;
  return { stage, changed, integrations };
}
