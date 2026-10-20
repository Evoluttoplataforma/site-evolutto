// Fluxo de envio do DiagnosticoForm com mocks (sem rede, sem leads reais).
import { describe, it, expect, vi } from 'vitest';
import { buildLeadPayload, buildMakeBody, createLeadSubmitter, persistLead, MSG } from '../src/lib/lead-submit.js';

const MAKE = 'https://make.example.invalid/hook';
const SUPA = 'https://supa.example.invalid';
const REST = `${SUPA}/rest/v1/evolutto_leads`;
const DADOS = { nome: 'Pessoa Sintética', telefone: '11900000000', email: 'teste@example.invalid', consentimento: 'aceito', origem: '/bootcamp/', tipo: 'vaga_bootcamp' };

const resp = (status) => ({ ok: status >= 200 && status < 300, status });

// fetch mock: Make sempre "aceita" (no-cors é opaco); REST/webhook seguem o roteiro.
function mockFetch(script) {
  const queue = [...script];
  return vi.fn((url, opts) => {
    if (url === MAKE) return Promise.resolve({ ok: false, status: 0, type: 'opaque' });
    const step = queue.shift() ?? 201;
    if (step === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    if (step === 'hang') {
      return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }
    if (step === 'slow-ok') return new Promise((r) => setTimeout(() => r(resp(201)), 20));
    return Promise.resolve(resp(step));
  });
}

function harness(script, config = {}) {
  const fetchImpl = mockFetch(script);
  const ui = { busy: vi.fn(), error: vi.fn() };
  const track = vi.fn();
  const redirect = vi.fn();
  const storage = { setItem: vi.fn() };
  const submit = createLeadSubmitter({
    fetchImpl, ui, track, redirect, storage,
    getTrackingData: () => ({ page: '/bootcamp/' }),
    wait: () => Promise.resolve(),
    config: { hostname: 'www.evolutto.com', redirectTo: '/obrigado', webhook: '', makeWebhook: MAKE, supaUrl: SUPA, anonKey: 'anon-sintetica', timeoutMs: 30, ...config },
  });
  const calls = (url) => fetchImpl.mock.calls.filter(([u]) => u === url);
  return { submit, fetchImpl, ui, track, redirect, storage, calls };
}

describe('sucesso só com persistência confirmada', () => {
  it('201 → converte uma vez, guarda sessão e redireciona', async () => {
    const h = harness([201]);
    const res = await h.submit(DADOS, '');
    expect(res).toMatchObject({ ok: true, via: 'rest', status: 201 });
    expect(h.track).toHaveBeenCalledTimes(1);
    expect(h.track).toHaveBeenCalledWith({ email: DADOS.email, phone: DADOS.telefone, name: DADOS.nome });
    expect(h.redirect).toHaveBeenCalledWith('/obrigado');
    expect(h.storage.setItem).toHaveBeenCalledTimes(1);
    const [, opts] = h.calls(REST)[0];
    expect(JSON.parse(opts.body)).toEqual(DADOS); // payload inalterado, inclusive consentimento
    expect(opts.headers.Prefer).toBe('return=minimal');
  });

  it('conversão acontece depois da resposta do banco', async () => {
    const order = [];
    const h = harness(['slow-ok']);
    h.track.mockImplementation(() => order.push('track'));
    const p = h.submit(DADOS, '');
    order.push('enviado');
    await p;
    expect(order).toEqual(['enviado', 'track']);
  });

  it('redirect comercial configurado é preservado (ex.: do-zero-a-escala)', async () => {
    const h = harness([201], { redirectTo: 'https://pay.example.invalid/checkout' });
    await h.submit(DADOS, '');
    expect(h.redirect).toHaveBeenCalledWith('https://pay.example.invalid/checkout');
  });
});

describe('falhas não geram sucesso falso', () => {
  it.each([
    [400, 'permanent'], [401, 'permanent'], [403, 'permanent'], [404, 'permanent'],
    [408, 'retry'], [429, 'retry'], [500, 'retry'], [502, 'retry'], [503, 'retry'],
  ])('HTTP %i → erro "%s", sem conversão, sem redirect, botão liberado', async (status, kind) => {
    const h = harness([status]);
    const res = await h.submit(DADOS, '');
    expect(res).toMatchObject({ ok: false, kind, status });
    expect(h.track).not.toHaveBeenCalled();
    expect(h.redirect).not.toHaveBeenCalled();
    expect(h.storage.setItem).not.toHaveBeenCalled();
    expect(h.ui.error).toHaveBeenLastCalledWith(MSG[kind]);
    expect(h.ui.busy).toHaveBeenLastCalledWith(false);
  });

  it('falha de rede → resultado incerto', async () => {
    const h = harness(['network']);
    expect(await h.submit(DADOS, '')).toMatchObject({ ok: false, kind: 'uncertain' });
    expect(h.ui.error).toHaveBeenLastCalledWith(MSG.uncertain);
    expect(h.track).not.toHaveBeenCalled();
  });

  it('timeout → aborta, resultado incerto, sem conversão', async () => {
    const h = harness(['hang']);
    expect(await h.submit(DADOS, '')).toMatchObject({ ok: false, kind: 'uncertain', status: 0 });
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it('sem destino de persistência configurado → erro, nunca sucesso', async () => {
    const h = harness([], { anonKey: '', supaUrl: '' });
    expect(await h.submit(DADOS, '')).toMatchObject({ ok: false, kind: 'uncertain' });
    expect(h.track).not.toHaveBeenCalled();
  });
});

describe('reenvio e concorrência', () => {
  it('erro seguido de reenvio bem-sucedido → uma conversão, um envio ao Make', async () => {
    const h = harness([503, 201]);
    expect((await h.submit(DADOS, '')).ok).toBe(false);
    expect((await h.submit(DADOS, '')).ok).toBe(true);
    expect(h.calls(REST)).toHaveLength(2);
    expect(h.calls(MAKE)).toHaveLength(1);
    expect(h.track).toHaveBeenCalledTimes(1);
    expect(h.redirect).toHaveBeenCalledTimes(1);
    expect(h.ui.error).toHaveBeenLastCalledWith(null); // mensagem limpa no reenvio
  });

  it('reenvio com dados corrigidos reenvia ao Make (conteúdo novo)', async () => {
    const h = harness([400, 201]);
    await h.submit(DADOS, '');
    await h.submit({ ...DADOS, telefone: '11911111111' }, '');
    expect(h.calls(MAKE)).toHaveLength(2);
  });

  it('duplo clique / envios concorrentes → um único POST', async () => {
    const h = harness(['slow-ok']);
    const [a, b, c] = await Promise.all([h.submit(DADOS, ''), h.submit(DADOS, ''), h.submit(DADOS, '')]);
    expect(a.ok).toBe(true);
    expect(b.skipped && c.skipped).toBe(true);
    expect(h.calls(REST)).toHaveLength(1);
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('após sucesso, novos envios são ignorados (replay)', async () => {
    const h = harness([201, 201]);
    await h.submit(DADOS, '');
    expect(await h.submit(DADOS, '')).toEqual({ skipped: true });
    expect(h.calls(REST)).toHaveLength(1);
  });
});

describe('trava por hostname (evita envio acidental em prévias)', () => {
  it.each(['www.evolutto.com', 'evolutto.com', 'WWW.EVOLUTTO.COM'])('%s → envia normalmente', async (hostname) => {
    const h = harness([201], { hostname });
    expect((await h.submit(DADOS, '')).ok).toBe(true);
  });

  it.each([
    'fix-captura-leads-site-evolutto.templum.workers.dev',
    'site-evolutto.templum.workers.dev',
    'localhost',
    '127.0.0.1',
    'evolutto.com.evil.example',
    'blog.evolutto.com',
    '',
  ])('%s → aviso de prévia; nada enviado, sem conversão, sem redirect', async (hostname) => {
    const h = harness([201], { hostname });
    expect(await h.submit(DADOS, '')).toEqual({ ok: false, kind: 'preview' });
    expect(h.fetchImpl).not.toHaveBeenCalled(); // nem Supabase nem Make
    expect(h.track).not.toHaveBeenCalled();
    expect(h.redirect).not.toHaveBeenCalled();
    expect(h.storage.setItem).not.toHaveBeenCalled();
    expect(h.ui.error).toHaveBeenCalledWith(MSG.preview);
    expect(h.ui.busy).not.toHaveBeenCalled();
  });
});

describe('rotas existentes', () => {
  it('função configurada e OK → não grava via REST (sem duplicar)', async () => {
    const h = harness([200], { webhook: 'https://fn.example.invalid/submit-lead' });
    expect(await h.submit(DADOS, '')).toMatchObject({ ok: true, via: 'webhook' });
    expect(h.calls(REST)).toHaveLength(0);
  });

  it('função falha → fallback REST; sucesso só se o REST confirmar', async () => {
    const r1 = await persistLead(DADOS, { fetchImpl: mockFetch([500, 201]), webhook: 'https://fn.example.invalid', supaUrl: SUPA, anonKey: 'k' });
    expect(r1).toMatchObject({ ok: true, via: 'rest' });
    const r2 = await persistLead(DADOS, { fetchImpl: mockFetch([500, 400]), webhook: 'https://fn.example.invalid', supaUrl: SUPA, anonKey: 'k' });
    expect(r2).toMatchObject({ ok: false, status: 400 });
  });

  it('falha de rede no Make libera novo envio ao Make no reenvio', async () => {
    const h = harness([503, 201]);
    h.fetchImpl.mockImplementationOnce(() => Promise.reject(new TypeError('make fora')));
    await h.submit(DADOS, '');
    await new Promise((r) => setTimeout(r, 0)); // deixa o catch do Make rodar
    await h.submit(DADOS, '');
    expect(h.calls(MAKE)).toHaveLength(2);
  });

  it('falha do Make não afeta a persistência', async () => {
    const h = harness([201]);
    h.fetchImpl.mockImplementationOnce(() => Promise.reject(new TypeError('make fora')));
    expect((await h.submit(DADOS, '')).ok).toBe(true);
  });
});

describe('montagem de payloads (compatível com a versão publicada)', () => {
  it('payload persistido: origem, tipo e só UTMs presentes', () => {
    const d = buildLeadPayload([['nome', 'X'], ['consentimento', 'aceito']], { pathname: '/', search: '?utm_source=a&gclid=g' }, 'diagnostico');
    expect(d).toEqual({ nome: 'X', consentimento: 'aceito', origem: '/', tipo: 'diagnostico', utm: { utm_source: 'a' } });
    expect(buildLeadPayload([], { pathname: '/', search: '' }, '').tipo).toBe('diagnostico');
  });

  it('corpo do Make: campos fixos sempre presentes, utm achatado, click ids da URL', () => {
    const d = buildLeadPayload([['nome', 'X']], { pathname: '/', search: '?utm_source=a' }, 'diagnostico');
    const body = new URLSearchParams(buildMakeBody(d, { page: '/', journey: [1] }, '?utm_source=a&gclid=g'));
    expect(body.get('nome')).toBe('X');
    expect(body.get('utm_source')).toBe('a');
    expect(body.get('gclid')).toBe('g');
    expect(body.get('empresa')).toBe('');
    expect(body.get('journey')).toBe('[1]');
    expect(body.has('utm')).toBe(false);
  });
});
