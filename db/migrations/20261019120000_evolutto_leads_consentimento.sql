-- Migração emergencial: coluna consentimento em public.evolutto_leads
--
-- Contexto: desde 24/06/2026 (commit 4c057ff) o DiagnosticoForm envia o campo
-- `consentimento`, que não existe na tabela. O PostgREST rejeita o INSERT inteiro
-- (HTTP 400) e nenhuma inscrição é persistida.
--
-- Escopo mínimo e aditivo:
--   - sem DEFAULT e sem backfill: registros anteriores ficam NULL (= sem evidência);
--   - armazena exatamente o valor enviado pelo checkbox (hoje "aceito");
--   - NÃO é data de aceite. created_at continua sendo a data de RECEBIMENTO pelo
--     banco; a data/versão do aceite exige mudança própria, fora desta migração.
--
-- Não altera RLS, políticas, funções nem outras colunas.

alter table public.evolutto_leads
  add column if not exists consentimento text;

comment on column public.evolutto_leads.consentimento is
  'Valor do checkbox de consentimento enviado pelo formulário do site (ex.: "aceito"). '
  'NULL = sem evidência registrada (inclui todos os registros anteriores a 2026-10-19). '
  'Não representa data de aceite; created_at é a data de recebimento.';

-- Recarrega o cache de schema do PostgREST (Supabase também faz isso via event trigger).
notify pgrst, 'reload schema';
