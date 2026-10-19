-- Snapshot do schema de produção de public.evolutto_leads (somente leitura,
-- obtido de information_schema/pg_policies em 2026-10-19). Usado apenas em
-- testes isolados (PGlite). NÃO aplicar em produção.

create schema if not exists auth;
create or replace function auth.role() returns text
  language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role', true), current_user::text) $$;

create table public.evolutto_leads (
  id uuid not null default gen_random_uuid() primary key,
  nome text,
  telefone text,
  email text,
  empresa text,
  oque_faz text,
  eu_sou text,
  minha_empresa text,
  consultores text,
  projetos_entregues text,
  projetos_ativos text,
  faturamento text,
  tipo text not null default 'diagnostico'::text,
  origem text,
  utm jsonb,
  enviado_mailchimp boolean not null default false,
  enviado_crm boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.evolutto_leads enable row level security;
create policy evo_anon_leads on public.evolutto_leads for insert to public with check (true);
create policy evo_auth_leads on public.evolutto_leads for all to public
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
