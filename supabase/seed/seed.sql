-- ============================================================
-- Seed inicial: marcas, pipeline padrão e etapas do brief.
-- Rode com: supabase db reset (aplica migrations + este seed em dev)
-- ============================================================

insert into public.brands (slug, name) values
  ('koala_turismo', 'Koala Turismo'),
  ('orlando_com_koala', 'Orlando com Koala'),
  ('corrida_na_disney', 'Corrida na Disney')
on conflict (slug) do nothing;

insert into public.products (brand_id, slug, name, category)
select b.id, p.slug, p.name, p.category
from (values
  ('koala_turismo', 'passagem_aerea', 'Passagem aérea', 'transporte'),
  ('koala_turismo', 'hotel', 'Hotel', 'hospedagem'),
  ('koala_turismo', 'resort', 'Resort', 'hospedagem'),
  ('koala_turismo', 'cruzeiro', 'Cruzeiro', 'hospedagem'),
  ('koala_turismo', 'seguro_viagem', 'Seguro viagem', 'servico'),
  ('koala_turismo', 'aluguel_carro', 'Aluguel de carro', 'transporte'),
  ('koala_turismo', 'transfer', 'Transfer', 'transporte'),
  ('koala_turismo', 'pacote', 'Pacote', 'pacote'),
  ('koala_turismo', 'visto_americano', 'Visto americano', 'documentacao'),
  ('koala_turismo', 'visto_mexicano', 'Visto mexicano', 'documentacao'),
  ('koala_turismo', 'esta', 'ESTA', 'documentacao'),
  ('koala_turismo', 'eta', 'ETA', 'documentacao'),
  ('koala_turismo', 'dhl', 'Envio DHL', 'logistica'),
  ('orlando_com_koala', 'ingresso_disney', 'Ingresso Disney', 'ingresso'),
  ('orlando_com_koala', 'ingresso_universal', 'Ingresso Universal', 'ingresso'),
  ('orlando_com_koala', 'ingresso_seaworld', 'Ingresso SeaWorld', 'ingresso'),
  ('orlando_com_koala', 'consultoria_orlando', 'Consultoria Orlando', 'servico'),
  ('orlando_com_koala', 'guiamento', 'Guiamento', 'servico'),
  ('corrida_na_disney', 'inscricao_corrida', 'Inscrição de corrida runDisney', 'evento'),
  ('corrida_na_disney', 'pacote_corredor', 'Pacote para corredores', 'pacote')
) as p(brand_slug, slug, name, category)
join public.brands b on b.slug = p.brand_slug
on conflict (slug) do nothing;

insert into public.pipelines (name, is_default) values ('Pipeline Comercial', true)
on conflict do nothing;

insert into public.pipeline_stages (pipeline_id, name, position, is_won, is_lost, color)
select p.id, s.name, s.position, s.is_won, s.is_lost, s.color
from public.pipelines p
join (values
  ('NOVO LEAD', 1, false, false, '#3b82f6'),
  ('PRIMEIRO CONTATO', 2, false, false, '#3b82f6'),
  ('QUALIFICAÇÃO', 3, false, false, '#6366f1'),
  ('AGUARDANDO INFORMAÇÕES', 4, false, false, '#a855f7'),
  ('ORÇAMENTO EM PREPARAÇÃO', 5, false, false, '#f59e0b'),
  ('ORÇAMENTO ENVIADO', 6, false, false, '#f59e0b'),
  ('FOLLOW-UP', 7, false, false, '#eab308'),
  ('NEGOCIAÇÃO', 8, false, false, '#f97316'),
  ('AGUARDANDO PAGAMENTO', 9, false, false, '#f97316'),
  ('VENDA FECHADA', 10, true, false, '#22c55e'),
  ('PÓS-VENDA', 11, false, false, '#16a34a'),
  ('PERDIDO', 12, false, true, '#ef4444'),
  ('SEM INTERESSE', 13, false, true, '#6b7280')
) as s(name, position, is_won, is_lost, color) on true
where p.is_default = true
on conflict (pipeline_id, position) do nothing;

-- ------------------------------------------------------------
-- Templates de aviso (texto completo em docs/TEMPLATES_META.md).
-- approval_status começa 'pending' — atualizar para 'approved' quando a Meta aprovar.
-- ------------------------------------------------------------
insert into public.templates (meta_template_name, category, language, body_preview) values
  ('koala_viagem_1_semana', 'utility', 'pt_BR', 'Oi, {{1}}! 🐨✈️ Falta só 1 semana pra sua viagem para {{2}}! Embarque em {{3}}. ...'),
  ('koala_passaporte_vencendo', 'utility', 'pt_BR', 'Oi, {{1}}! 🐨 O passaporte de {{2}} vence em {{3}}. ...'),
  ('koala_visto_vencendo', 'marketing', 'pt_BR', 'Oi, {{1}}! 🐨 O visto americano de {{2}} vence em {{3}}. ... [Quero renovar]')
on conflict (meta_template_name) do nothing;
