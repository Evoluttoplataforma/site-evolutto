-- Rollback de 20261019120000_evolutto_leads_consentimento.sql
--
-- ATENÇÃO: com o formulário atual publicado, remover a coluna volta a fazer
-- TODO insert falhar (HTTP 400). O rollback preferencial é manter a coluna
-- (é aditiva e inofensiva) e reverter apenas o código do site.
--
-- Este script só remove a coluna se nenhuma linha tiver valor nela, para nunca
-- apagar evidência de consentimento já coletada.

do $$
begin
  if exists (select 1 from public.evolutto_leads where consentimento is not null) then
    raise exception 'Rollback abortado: há registros com consentimento preenchido. Preserve a coluna.';
  end if;
  alter table public.evolutto_leads drop column if exists consentimento;
end $$;

notify pgrst, 'reload schema';
