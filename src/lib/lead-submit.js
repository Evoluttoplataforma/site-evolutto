// Envio do DiagnosticoForm. Sucesso = persistência confirmada (HTTP 2xx).
// Sem DOM aqui: o componente injeta fetch, UI e tracking, o que permite testar com mocks.

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

// Campos que o Make sempre recebe (vazios quando ausentes) — automação nunca quebra.
const MAKE_FIELDS = ['nome', 'email', 'telefone', 'empresa', 'oque_faz', 'eu_sou', 'minha_empresa', 'consultores', 'projetos_entregues', 'projetos_ativos', 'faturamento', 'consentimento', 'tipo', 'origem', ...UTM_KEYS, 'gclid', 'fbclid'];

export const MSG = {
  retry: 'Não conseguimos registrar seu envio agora. Seus dados continuam no formulário — tente novamente em instantes.',
  uncertain: 'A conexão demorou e não conseguimos confirmar o envio. Verifique sua internet e tente novamente; se preferir, fale com a gente em contato@evolutto.com.',
  permanent: 'Não foi possível registrar seu envio. Seus dados continuam no formulário. Tente novamente ou fale com a gente em contato@evolutto.com.',
  preview: 'Ambiente de prévia: o envio está desativado e nenhum dado foi enviado. Use www.evolutto.com para se inscrever.',
};

// Hosts onde o formulário envia de verdade. Evita envios acidentais em prévias (*.workers.dev, localhost);
// não é controle de segurança: a API continua aceitando chamadas diretas.
export const CAPTURE_HOSTS = ['www.evolutto.com', 'evolutto.com'];
export const isCaptureHost = (hostname) => CAPTURE_HOSTS.includes(String(hostname || '').toLowerCase());

// Payload persistido: mesmo formato do formulário publicado.
export function buildLeadPayload(entries, { pathname, search }, tipo) {
  const dados = Object.fromEntries(entries);
  const p = new URLSearchParams(search);
  dados.origem = pathname;
  dados.tipo = tipo || 'diagnostico';
  const utm = {};
  UTM_KEYS.forEach((k) => { if (p.get(k)) utm[k] = p.get(k); });
  if (Object.keys(utm).length) dados.utm = utm;
  return dados;
}

// Corpo form-urlencoded do Make (mesma montagem da versão publicada).
export function buildMakeBody(dados, trackingData, search) {
  const p = new URLSearchParams(search);
  const u = dados.utm || {};
  const campos = Object.assign({}, trackingData || {});
  MAKE_FIELDS.forEach((k) => { if (campos[k] == null) campos[k] = ''; });
  Object.keys(dados).forEach((k) => { if (k !== 'utm') campos[k] = dados[k]; });
  UTM_KEYS.forEach((k) => { campos[k] = u[k] || campos[k] || ''; });
  campos.gclid = p.get('gclid') || campos.gclid || '';
  campos.fbclid = p.get('fbclid') || campos.fbclid || '';
  const usp = new URLSearchParams();
  Object.keys(campos).forEach((k) => {
    const v = campos[k];
    usp.append(k, v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  });
  return usp.toString();
}

async function postJson(fetchImpl, url, headers, body, timeoutMs) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body, signal: ctrl?.signal });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    return { ok: false, status: 0, timeout: err?.name === 'AbortError' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Classifica a falha para a mensagem: rede/timeout → incerto; 408/429/5xx → tentar de novo; demais 4xx → permanente.
export function classify(res) {
  if (res.ok) return 'ok';
  if (res.status === 0) return 'uncertain';
  if (res.status === 408 || res.status === 429 || res.status >= 500) return 'retry';
  return 'permanent';
}

// 1) função (se configurada); 2) se ela falhar, insert REST. Sucesso só com 2xx.
export async function persistLead(dados, { fetchImpl, webhook, supaUrl, anonKey, timeoutMs = 15000 }) {
  const body = JSON.stringify(dados);
  let last = { ok: false, status: 0 };
  if (webhook) {
    last = await postJson(fetchImpl, webhook, {}, body, timeoutMs);
    if (last.ok) return { ...last, via: 'webhook' };
  }
  if (anonKey && supaUrl) {
    last = await postJson(fetchImpl, `${supaUrl}/rest/v1/evolutto_leads`, { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Prefer: 'return=minimal' }, body, timeoutMs);
    if (last.ok) return { ...last, via: 'rest' };
  }
  return last;
}

// Controla um formulário: trava duplo envio, envia ao Make uma vez por conteúdo,
// converte e redireciona só após persistência confirmada.
export function createLeadSubmitter(deps) {
  const { fetchImpl, config, ui, track, getTrackingData, storage, redirect, wait = (ms) => new Promise((r) => setTimeout(r, ms)), redirectDelayMs = 900 } = deps;
  let inFlight = false;
  let done = false;
  const makeSent = new Set();

  return async function submit(dados, search) {
    if (inFlight || done) return { skipped: true };
    // Fora dos hosts de captura: nenhum envio (Supabase, Make), nenhuma conversão, nenhum redirect.
    if (!isCaptureHost(config.hostname)) {
      ui.error(MSG.preview);
      return { ok: false, kind: 'preview' };
    }
    inFlight = true;
    ui.busy(true);
    ui.error(null);

    // Make: fire-and-forget como na versão publicada. Com no-cors a resposta é opaca: o set registra
    // só que a requisição saiu sem erro de rede, NÃO que o Make aceitou. Falha de rede libera reenvio.
    const key = JSON.stringify(dados);
    if (config.makeWebhook && !makeSent.has(key)) {
      makeSent.add(key);
      try {
        Promise.resolve(fetchImpl(config.makeWebhook, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: buildMakeBody(dados, getTrackingData?.(), search), keepalive: true }))
          .catch(() => { makeSent.delete(key); });
      } catch (_) { makeSent.delete(key); }
    }

    const res = await persistLead(dados, { fetchImpl, ...config });
    const kind = classify(res);
    if (kind !== 'ok') {
      inFlight = false;
      ui.busy(false);
      ui.error(MSG[kind]);
      return { ok: false, kind, status: res.status };
    }

    done = true;
    try { storage?.setItem('evolutto_lead', key); } catch (_) {}
    try { track?.({ email: dados.email, phone: dados.telefone, name: dados.nome }); } catch (_) {}
    await wait(redirectDelayMs); // tempo do evento Lead (pixel + CAPI com keepalive) sair antes de navegar
    redirect(config.redirectTo);
    return { ok: true, via: res.via, status: res.status };
  };
}
