// Prova isolada (PGlite, Postgres em memória) de que o payload do formulário publicado
// é rejeitado pelo schema atual e aceito após a migração emergencial.
// Nenhuma conexão remota: o schema de produção vem de db/snapshot/evolutto_leads.sql.
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { buildLeadPayload } from '../src/lib/lead-submit.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SNAPSHOT = read('db/snapshot/evolutto_leads.sql');
const MIGRATION = read('db/migrations/20261019120000_evolutto_leads_consentimento.sql');
const ROLLBACK = read('db/rollback/20261019120000_evolutto_leads_consentimento.down.sql');
const COMPONENT = read('src/components/DiagnosticoForm.astro');

// Campos reais do componente (atributo name=), para o teste acompanhar o formulário.
const FIELD_NAMES = [...COMPONENT.matchAll(/\bname="([a-z_]+)"/g)].map((m) => m[1]);
const SIMPLE_FIELDS = ['nome', 'telefone', 'email', 'consentimento'];

const SAMPLE = {
  nome: 'Pessoa Sintética', telefone: '(11) 90000-0000', email: 'teste@example.invalid', empresa: 'Empresa Exemplo',
  oque_faz: 'Consultoria de exemplo', eu_sou: 'Consultor autônomo', minha_empresa: 'Consultoria', consultores: 'Somente eu',
  faturamento: 'R$ 15 a 50 mil/mês', projetos_entregues: '1 a 5', projetos_ativos: 'Nenhum', consentimento: 'aceito',
};
const loc = { pathname: '/consultoria/', search: '?utm_source=google&utm_medium=cpc&utm_campaign=teste&gclid=x' };
const fullPayload = () => buildLeadPayload(FIELD_NAMES.map((k) => [k, SAMPLE[k]]), loc, 'diagnostico');
const simplePayload = () => buildLeadPayload(SIMPLE_FIELDS.map((k) => [k, SAMPLE[k]]), { pathname: '/bootcamp/', search: '' }, 'vaga_bootcamp');

async function setup() {
  const db = new PGlite();
  await db.exec(SNAPSHOT);
  await db.exec(`
    create role anon nologin;
    grant usage on schema public, auth to anon;
    grant insert on public.evolutto_leads to anon;
    grant execute on function auth.role() to anon;
  `);
  return db;
}

// Emula o INSERT do PostgREST (POST /rest/v1/evolutto_leads, Prefer: return=minimal):
// toda chave do JSON precisa ser coluna (senão HTTP 400 / PGRST204) e só as colunas
// enviadas entram no INSERT, então os DEFAULTs continuam valendo. Executa como anon (RLS ativa).
async function postgrestInsert(db, payload) {
  const { rows } = await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='evolutto_leads'`);
  const cols = new Set(rows.map((r) => r.column_name));
  const unknown = Object.keys(payload).filter((k) => !cols.has(k));
  if (unknown.length) return { status: 400, code: 'PGRST204', unknown };
  const list = Object.keys(payload).map((k) => `"${k}"`).join(', ');
  await db.exec('set role anon');
  try {
    await db.query(`insert into public.evolutto_leads (${list}) select ${list} from json_populate_record(null::public.evolutto_leads, $1::json)`, [JSON.stringify(payload)]);
    return { status: 201 };
  } catch (err) {
    return { status: 400, error: err.message };
  } finally {
    await db.exec('reset role');
  }
}

describe('schema evolutto_leads × payload do formulário', () => {
  let db;
  beforeEach(async () => { db = await setup(); });

  it('o componente ainda envia exatamente os campos esperados', () => {
    expect(FIELD_NAMES.sort()).toEqual(Object.keys(SAMPLE).sort());
  });

  it('ANTES da migração: payload publicado é rejeitado só por causa de consentimento', async () => {
    for (const payload of [fullPayload(), simplePayload()]) {
      const res = await postgrestInsert(db, payload);
      expect(res).toMatchObject({ status: 400, code: 'PGRST204', unknown: ['consentimento'] });
    }
  });

  it('DEPOIS da migração: variantes full e simple são aceitas como anon, com consentimento preservado', async () => {
    await db.exec(MIGRATION);
    expect((await postgrestInsert(db, fullPayload())).status).toBe(201);
    expect((await postgrestInsert(db, simplePayload())).status).toBe(201);

    const { rows } = await db.query(`select tipo, origem, consentimento, utm, enviado_crm, created_at is not null as tem_recebimento from public.evolutto_leads order by tipo`);
    expect(rows).toEqual([
      { tipo: 'diagnostico', origem: '/consultoria/', consentimento: 'aceito', utm: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'teste' }, enviado_crm: false, tem_recebimento: true },
      { tipo: 'vaga_bootcamp', origem: '/bootcamp/', consentimento: 'aceito', utm: null, enviado_crm: false, tem_recebimento: true },
    ]);
  });

  it('migração não tem default nem preenche registros antigos', async () => {
    await db.exec(`insert into public.evolutto_leads (nome, tipo) values ('antigo', 'diagnostico')`);
    await db.exec(MIGRATION);
    const col = await db.query(`select column_default, is_nullable, data_type from information_schema.columns where table_name='evolutto_leads' and column_name='consentimento'`);
    expect(col.rows[0]).toEqual({ column_default: null, is_nullable: 'YES', data_type: 'text' });
    const old = await db.query(`select consentimento from public.evolutto_leads where nome='antigo'`);
    expect(old.rows[0].consentimento).toBeNull();
    // não cria coluna de data de aceite
    const extra = await db.query(`select count(*)::int n from information_schema.columns where table_name='evolutto_leads' and column_name like 'consentimento%'`);
    expect(extra.rows[0].n).toBe(1);
  });

  it('migração é idempotente', async () => {
    await db.exec(MIGRATION);
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });

  // Na emulação o anon não tem GRANT de SELECT; em produção o bloqueio vem da RLS. A migração não mexe em nenhum dos dois.
  it('anon continua sem leitura após a migração', async () => {
    await db.exec(MIGRATION);
    await postgrestInsert(db, fullPayload());
    await db.exec('set role anon');
    await expect(db.query('select * from public.evolutto_leads')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });

  it('rollback recusa apagar coluna com evidência de consentimento', async () => {
    await db.exec(MIGRATION);
    await postgrestInsert(db, simplePayload());
    await expect(db.exec(ROLLBACK)).rejects.toThrow(/Rollback abortado/);
  });

  it('rollback remove a coluna quando ela está vazia', async () => {
    await db.exec(MIGRATION);
    await db.exec(ROLLBACK);
    const res = await postgrestInsert(db, simplePayload());
    expect(res.code).toBe('PGRST204');
  });
});
