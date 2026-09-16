/**
 * Tipos manuais do banco — enquanto o projeto Supabase real não existe,
 * mantemos isto à mão. Assim que houver um projeto Supabase configurado,
 * substituir por tipos gerados: `npx supabase gen types typescript`.
 */

export type LeadTemperature = "hot" | "warm" | "cold" | "undefined";
export type UserRole = "admin" | "manager" | "agent" | "viewer";
export type ConversationStatus = "open" | "pending_human" | "waiting_customer" | "closed";
export type MessageDirection = "inbound" | "outbound";
export type FollowupStatus = "scheduled" | "sent" | "skipped" | "cancelled" | "failed";

export interface Contact {
  id: string;
  name: string | null;
  phone: string;
  whatsapp_id: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  country: string;
  lead_source: string | null;
  source_campaign: string | null;
  source_instagram_handle: string | null;
  owner_id: string | null;
  brand_id: string | null;
  last_purchase_at: string | null;
  lifetime_value_cents: number;
  purchase_count: number;
  first_seen_at: string;
  last_interaction_at: string | null;
  opt_in_marketing: boolean | null;
  opt_out_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  contact_id: string;
  brand_id: string | null;
  product_id: string | null;
  title: string | null;
  pipeline_id: string;
  stage_id: string;
  estimated_value_cents: number | null;
  closed_value_cents: number | null;
  destination: string | null;
  travel_date_estimate: string | null;
  adults_count: number | null;
  children_count: number | null;
  children_ages: number[] | null;
  owner_id: string | null;
  probability: number | null;
  lead_temperature: LeadTemperature;
  lead_score: number;
  loss_reason: string | null;
  created_at: string;
  last_activity_at: string;
  next_activity_at: string | null;
  closed_at: string | null;
}

export interface Conversation {
  id: string;
  contact_id: string;
  current_opportunity_id: string | null;
  assigned_to: string | null;
  status: ConversationStatus;
  last_customer_message_at: string | null;
  unread_count: number;
  ai_summary: string | null;
  human_handoff_required: boolean;
  human_handoff_reason: string | null;
}
