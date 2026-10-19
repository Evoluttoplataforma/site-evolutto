// Teste em navegador real (Edge/Chrome via playwright-core) do DiagnosticoForm já buildado em dist/.
// TODA requisição externa é interceptada: Supabase, Make, pixels etc. nunca são chamados de verdade.
// Uso: npm run build && npm run test:e2e
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml', '.ico': 'image/x-icon' };

function serveDist() {
  const server = http.createServer(async (req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let file = join(DIST, p);
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(DIST, p, 'index.html'); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const OBRIGADO = /\/obrigado\/?(\?.*)?$/;
const SYNTH = { nome: 'Pessoa Sintética E2E', telefone: '11900000000', email: 'e2e@example.invalid', empresa: 'Empresa Teste', oque: 'Teste automatizado' };

async function newPage(browser, base, persistPlan) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const log = { rest: [], make: [], external: new Set(), leads: 0 };
  await page.exposeFunction('__e2eLead', () => { log.leads += 1; });
  // Conta chamadas a trk.lead (conversão) sem alterar o comportamento do kit.
  await page.addInitScript(() => {
    const wrap = () => {
      const t = window.trk;
      if (t && typeof t.lead === 'function' && !t.__e2e) {
        const orig = t.lead;
        t.lead = function (...a) { window.__e2eLead(); try { return orig.apply(this, a); } catch (_) {} };
        t.__e2e = true;
      }
    };
    setInterval(wrap, 20);
  });
  let n = 0;
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.port === new URL(base).port && LOCAL_HOSTS.includes(url.hostname)) return route.continue();
    log.external.add(url.host);
    if (url.pathname.endsWith('/rest/v1/evolutto_leads')) {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
      log.rest.push(JSON.parse(req.postData() || '{}'));
      const step = persistPlan[Math.min(n++, persistPlan.length - 1)];
      const status = typeof step === 'object' ? step.status : step;
      if (typeof step === 'object' && step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs));
      try { return await route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, body: '' }); } catch { return; }
    }
    if (url.host.endsWith('make.com')) { log.make.push(req.postData() || ''); return route.fulfill({ status: 200, body: 'Accepted' }); }
    return route.fulfill({ status: 204, body: '' }); // pixels, GA, CAPI, fontes externas etc.
  });
  return { page, ctx, log };
}

async function fillFull(page) {
  await page.fill('#nome', SYNTH.nome);
  await page.fill('#telefone', SYNTH.telefone);
  await page.fill('#email', SYNTH.email);
  await page.fill('#empresa', SYNTH.empresa);
  await page.fill('#oque', SYNTH.oque);
  await page.selectOption('#eu_sou', { index: 1 });
  await page.check('#consentimento');
}
async function fillSimple(page) {
  await page.fill('#nome', SYNTH.nome);
  await page.fill('#telefone', SYNTH.telefone);
  await page.fill('#email', SYNTH.email);
  await page.check('#consentimento');
}
const submit = (page) => page.click('#form-diagnostico button[type="submit"]');
const errorText = (page) => page.locator('#form-erro').evaluate((el) => (el.classList.contains('hidden') ? '' : el.textContent));

const results = [];
async function scenario(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: e.message }); }
}

// Hosts mapeados para o servidor local (sem DNS real): o de produção e um de prévia.
const PROD_HOST = 'www.evolutto.com';
// .workers.dev é HSTS (força HTTPS); um host fictício equivalente exercita a mesma regra.
const PREVIEW_HOST = 'fix-captura-leads-site-evolutto.preview.test';
const LOCAL_HOSTS = [PROD_HOST, PREVIEW_HOST, '127.0.0.1'];
const server = await serveDist();
const port = server.address().port;
const base = `http://${PROD_HOST}:${port}`;
const previewBase = `http://${PREVIEW_HOST}:${port}`;
const browser = await chromium.launch({
  channel: process.env.E2E_CHANNEL || 'msedge',
  headless: true,
  args: [`--host-resolver-rules=MAP ${PROD_HOST} 127.0.0.1, MAP ${PREVIEW_HOST} 127.0.0.1`],
});
const allExternal = new Set();

async function run(plan, path, fn, origin = base) {
  const s = await newPage(browser, base, plan);
  try { await s.page.goto(origin + path, { waitUntil: 'load' }); await fn(s); }
  finally { s.log.external.forEach((h) => allExternal.add(h)); await s.ctx.close(); }
}

await scenario('home (full): 201 → conversão 1x, Make 1x, redirect /obrigado', () => run([201], '/', async ({ page, log }) => {
  await fillFull(page);
  await Promise.all([page.waitForURL(OBRIGADO, { timeout: 10000 }), submit(page)]);
  assert.equal(log.rest.length, 1);
  assert.equal(log.rest[0].consentimento, 'aceito');
  assert.equal(log.rest[0].tipo, 'diagnostico');
  assert.equal(log.make.length, 1);
  assert.equal(log.leads, 1);
}));

await scenario('home (full): 400 → erro visível, campos preservados, sem conversão/redirect', () => run([400], '/', async ({ page, log }) => {
  await fillFull(page);
  await submit(page);
  await page.waitForFunction(() => !document.getElementById('form-erro').classList.contains('hidden'));
  assert.match(await errorText(page), /Não foi possível registrar/);
  assert.equal(await page.inputValue('#nome'), SYNTH.nome);
  assert.equal(await page.inputValue('#email'), SYNTH.email);
  assert.equal(await page.isChecked('#consentimento'), true);
  assert.equal(await page.isEnabled('#form-diagnostico button[type="submit"]'), true);
  await page.waitForTimeout(1200);
  assert.ok(!page.url().includes('/obrigado'));
  assert.equal(log.leads, 0);
}));

await scenario('home (full): 503 → reenvio → 201: 2 POSTs, 1 conversão, 1 Make', () => run([503, 201], '/', async ({ page, log }) => {
  await fillFull(page);
  await submit(page);
  await page.waitForFunction(() => !document.getElementById('form-erro').classList.contains('hidden'));
  assert.match(await errorText(page), /tente novamente/i);
  await Promise.all([page.waitForURL(OBRIGADO, { timeout: 10000 }), submit(page)]);
  assert.equal(log.rest.length, 2);
  assert.equal(log.make.length, 1);
  assert.equal(log.leads, 1);
}));

await scenario('home (full): triplo clique com resposta lenta → 1 POST', () => run([{ status: 201, delayMs: 800 }], '/', async ({ page, log }) => {
  await fillFull(page);
  const btn = page.locator('#form-diagnostico button[type="submit"]');
  await btn.click();
  await btn.click({ force: true }).catch(() => {});
  await btn.click({ force: true }).catch(() => {});
  await page.waitForURL(OBRIGADO, { timeout: 10000 });
  assert.equal(log.rest.length, 1);
  assert.equal(log.leads, 1);
}));

await scenario('home (full): timeout (>15 s) → erro "incerto", sem conversão', () => run([{ status: 201, delayMs: 17000 }], '/', async ({ page, log }) => {
  await fillFull(page);
  await submit(page);
  await page.waitForFunction(() => !document.getElementById('form-erro').classList.contains('hidden'), null, { timeout: 20000 });
  assert.match(await errorText(page), /não conseguimos confirmar/);
  assert.equal(log.leads, 0);
  assert.ok(!page.url().includes('/obrigado'));
}));

await scenario('bootcamp (simple): 201 → tipo vaga_bootcamp, redirect /obrigado', () => run([201], '/bootcamp/', async ({ page, log }) => {
  await fillSimple(page);
  await Promise.all([page.waitForURL(OBRIGADO, { timeout: 10000 }), submit(page)]);
  assert.equal(log.rest[0].tipo, 'vaga_bootcamp');
  assert.equal(log.rest[0].origem, '/bootcamp/');
  assert.equal(log.leads, 1);
}));

await scenario('do-zero-a-escala (simple): 201 → tipo do-zero-a-escala, redirect configurado', () => run([201], '/do-zero-a-escala/?utm_source=teste&utm_medium=e2e', async ({ page, log }) => {
  const expected = await page.getAttribute('#form-diagnostico', 'data-redirect');
  await fillSimple(page);
  await Promise.all([page.waitForURL(`**${expected}**`, { timeout: 10000 }), submit(page)]);
  assert.equal(log.rest[0].tipo, 'do-zero-a-escala');
  assert.deepEqual(log.rest[0].utm, { utm_source: 'teste', utm_medium: 'e2e' });
}));

await scenario('validação HTML5: sem consentimento não envia nada', () => run([201], '/', async ({ page, log }) => {
  await page.fill('#nome', SYNTH.nome);
  await page.fill('#telefone', SYNTH.telefone);
  await page.fill('#email', SYNTH.email);
  await page.selectOption('#eu_sou', { index: 1 });
  await submit(page);
  await page.waitForTimeout(500);
  assert.equal(log.rest.length, 0);
  assert.equal(log.make.length, 0);
}));

await scenario('prévia (host fora da lista): aviso de prévia, nada enviado, sem conversão/redirect', () => run([201], '/', async ({ page, log }) => {
  await fillFull(page);
  await submit(page);
  await page.waitForFunction(() => !document.getElementById('form-erro').classList.contains('hidden'));
  assert.match(await errorText(page), /Ambiente de prévia/);
  await page.waitForTimeout(1200);
  assert.equal(log.rest.length, 0);
  assert.equal(log.make.length, 0);
  assert.equal(log.leads, 0);
  assert.ok(!page.url().includes('/obrigado'));
  assert.equal(await page.inputValue('#nome'), SYNTH.nome);
}, previewBase));

await scenario('localhost (127.0.0.1): também bloqueado', () => run([201], '/bootcamp/', async ({ page, log }) => {
  await fillSimple(page);
  await submit(page);
  await page.waitForTimeout(800);
  assert.equal(log.rest.length + log.make.length + log.leads, 0);
}, `http://127.0.0.1:${port}`));

await browser.close();
server.close();

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms} ms)${r.ok ? '' : `\n      ${r.error}`}`);
console.log(`\nHosts externos interceptados (nenhum foi contatado): ${[...allExternal].sort().join(', ')}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} cenários passaram`);
process.exit(failed ? 1 : 0);
