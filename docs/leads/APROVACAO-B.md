# Aprovação B — deploy da correção do formulário (preparado, NÃO publicado)

Estado em 19/10/2026: A aplicada (schema verificado; captura em produção ainda não comprovada). B pronta para revisão.
Depois do deploy, a **confirmação funcional em produção continua pendente** até uma inscrição válida real ou um teste explicitamente autorizado.

## O que muda para o visitante
- Sucesso (conversão, `sessionStorage`, redirect) **só depois de HTTP 2xx** da gravação em `evolutto_leads`.
- Falha → mensagem na tela (`role="alert"`), campos preservados, botão liberado. Mensagens: tentar de novo (408/429/5xx), incerto (rede/timeout 15 s), permanente (outros 4xx).
- Um envio por vez; após sucesso, novos envios são ignorados.
- Make: mesmo corpo/destino, fire-and-forget; sem reenvio do mesmo conteúdo se a requisição saiu sem erro de rede (não é confirmação de entrega).
- **Inalterados**: destinos (REST Supabase com chave anon, webhook Make), `PUBLIC_*` usadas, campos, variantes `full`/`simple`, `tipo`, `redirectTo`.
- **Limite**: duplo clique resolvido, mas timeout após gravação + reenvio ainda pode duplicar a linha (resolvido só no desenho C).
- Efeito esperado nos relatórios: queda de conversões reportadas (antes contavam envios que falhavam).

## Commits propostos (branch `fix/captura-leads`)

**Commit 1 — ferramentas de teste e registro de A** (sem efeito no site publicado)
| Arquivo | Motivo |
|---|---|
| `package.json`, `package-lock.json` | scripts `test`/`test:e2e`; devDependencies `vitest`, `@electric-sql/pglite`, `playwright-core` (lockfile: só adições, nenhuma versão existente alterada) |
| `db/migrations/20261019120000_evolutto_leads_consentimento.sql` | migração A aplicada (registro) |
| `db/rollback/20261019120000_evolutto_leads_consentimento.down.sql` | rollback protegido de A |
| `db/snapshot/evolutto_leads.sql` | schema de produção para testes isolados |
| `tests/evolutto-leads-schema.test.js` | prova de A em PGlite |
| `docs/leads/EXECUCAO-A-2026-10-19.md` | registro da execução |

**Commit 2 — correção do formulário (B)**
| Arquivo | Motivo |
|---|---|
| `src/lib/lead-submit.js` (novo) | lógica de envio testável |
| `src/components/DiagnosticoForm.astro` | config via `data-*`, `#form-erro`, script processado pelo Astro |
| `tests/lead-submit.test.js` | 25 testes com mocks |
| `tests/browser/form.e2e.mjs` | teste em navegador real com rede interceptada |
| `docs/leads/CAPTURA-EMERGENCIAL.md`, `docs/leads/APROVACAO-B.md` | plano, aceite e rollback |

**Fora dos commits**: `db/proposed/` e `tests/crm-sync-schema.test.js` (rascunho C), `docs/leads/INTEGRACAO-ORBIT.md` (C), `docs/leads/RECUPERACAO-HISTORICA.md` (D), `.cursor/` (preexistente, não relacionado), `dist/` (ignorado), qualquer arquivo em `C:\Users\GSN\Documents\Evolutto-Privado\`.

Revert de B = reverter só o commit 2.

## Destino e procedimento de deploy
- Destino: Cloudflare Worker `site-evolutto` (assets estáticos, `wrangler.jsonc`, `./dist`), domínio `www.evolutto.com`.
- Integração: **Workers Builds** (Git do Cloudflare) ligada a `Evoluttoplataforma/site-evolutto`; sem GitHub Actions. Evidência: check "Workers Builds: site-evolutto" e comentários do bot `cloudflare-workers-and-pages` nos PRs #1 e #2.
- **Produção = `70569f5`, não `main`** (corrigido em 19/10/2026). Último build com sucesso: `70569f5` (28/08/2026 11:54 UTC; Worker `site-evolutto` modificado no mesmo instante). **Os builds de `ea5a33d` (12:09 UTC) e `5f2aa33` (13:15 UTC) falharam** (check "Workers Builds: site-evolutto" = failure). O HTML publicado não tem as mudanças desses dois commits (links absolutos do blog, script de redirect do apex). Causa da falha não verificada: log só no painel; suspeita (não confirmada) na linha com URL absoluta adicionada ao `public/_redirects` em `ea5a33d`.
- Consequência para B: a branch parte de `5f2aa33`. O build de prévia e o build de produção após o merge podem falhar pelo mesmo motivo; se não falharem, o merge publica **pela primeira vez** também as mudanças de `ea5a33d` e `5f2aa33`.
- **Branches que não são de produção geram prévias** (versões com "Commit Preview URL" e "Branch Preview URL" em `*.templum.workers.dev`), sem publicar em produção (PR #1: a config da branch nunca chegou à produção).
- **Não verificado sem acesso ao Cloudflare**: branch de produção configurada, comandos de build/deploy, variáveis de build (nomes), ID da versão ativa, configuração atual de prévias.

### Prévias gravam em produção (risco antes do push)
- Prévias usam o mesmo código e os mesmos destinos: o formulário tem URL/chave do Supabase e webhook do Make como fallback no código, então **variáveis por ambiente sozinhas não isolam** os dados.
- Verificado (GET, 19/10/2026): prévias antigas dos PRs #1 e #2 e `site-evolutto.templum.workers.dev` estão **públicas, sem proteção de acesso**, com versões antigas do formulário.
- Proteção de acesso (ex.: Cloudflare Access) restringe quem abre a prévia, **mas quem tem acesso continua gravando em produção**.

Opções (nenhuma aplicada):
1. **Implementada — trava no código por hostname** (`CAPTURE_HOSTS` em `src/lib/lead-submit.js`): persistência, Make e conversão só em `www.evolutto.com`/`evolutto.com`; em qualquer outro host o formulário mostra o aviso de prévia e não chama nada. **Evita envios acidentais em prévias; não é segurança nem isolamento do backend** — a API do Supabase e o webhook do Make continuam aceitando chamadas diretas (risco S4). Não afeta prévias antigas já publicadas.
2. Desligar builds de branches não-produção no Cloudflare: elimina prévias novas; perde revisão visual; é mudança de configuração (exige autorização). Não remove prévias já existentes.
3. Proteção de acesso nas prévias: complementar; não isola dados.
4. Variáveis de build específicas para prévia: só funcionaria com mudança de código (remover fallbacks) e se o Workers Builds suportar variáveis por branch (não verificado).

Passos:
1. No painel Cloudflare → Workers → `site-evolutto`: confirmar branch/comando de build e **anotar o ID da versão ativa** (alvo de rollback).
2. Push da branch e PR para `main` (gera prévia — ver acima).
3. Merge → build e deploy de produção (autorização separada).
4. Executar a verificação abaixo.

## Verificação da versão publicada (somente GET, sem enviar formulário)
Os nomes de bundle abaixo são **evidência do build local de 19/10/2026, não critério permanente**: outro build (ambiente, dependências, conteúdo) pode gerar nomes diferentes. O aceite vale pelo comportamento e pela versão ativa no Cloudflare.

| Verificação | Critério |
|---|---|
| Versão ativa | No painel Cloudflare (Deployments), a versão ativa de produção corresponde ao build do commit de merge |
| HTML | `id="form-erro"` presente; script inline antigo com `makeWebhook` ausente; formulário com atributos `data-*` |
| Chunk do formulário | contém `evolutto_leads` e a mensagem "Não conseguimos registrar" |
| Páginas | `/`, `/consultoria`, `/mentorias`, `/suporte`, `/carreiras`, `/indicacao`, `/erp-software`, `/quem-somos` com `data-tipo="diagnostico"`; `/bootcamp` `vaga_bootcamp`; `/do-zero-a-escala` `do-zero-a-escala`; todas `data-redirect="/obrigado"` |
| Console do navegador | sem erros de JavaScript ao carregar e interagir (sem clicar em enviar) |
| Evidência de referência | build local de B: home `hoisted.4OLeTFHj.js`, formulário `hoisted.BzqMeiX9.js`; produção antes de B: `hoisted.CrxbHxXf.js` (o chunk do formulário é idêntico em `70569f5`…`5f2aa33`; não identifica o commit) |

Divergência de comportamento ou marcador = parar e investigar.

Pendente após o deploy: primeira inscrição válida → `POST evolutto_leads` `201`, linha nova com `consentimento='aceito'`, visitante redirecionado. Até lá, monitorar `edge_logs` diariamente.

## Critérios de rollback
Reverter B se, após o deploy:
- algum formulário não renderiza, não envia ou gera erro de JavaScript;
- `data-tipo`/`data-redirect` incorretos em qualquer página;
- envio válido mostra erro na tela embora o banco tenha respondido `201` (ou mostra sucesso sem `201`);
- `400` comprovadamente originado de envio válido do formulário.

Não são critério de rollback: rejeição de payload inválido/forjado; queda de conversões reportadas; diferença de contagem com analytics.

Procedimento:
1. Painel Cloudflare → `site-evolutto` → Deployments → promover a versão anotada no passo 1 (imediato).
2. `git revert <commit 2>` em `main` para alinhar o repositório (senão o próximo push republica B).
3. A permanece: o código antigo **continua gravando**.

> **Risco do rollback: volta o sucesso falso.** O formulário antigo não confere a resposta, converte antes de gravar e redireciona sempre. Enquanto B estiver revertido, acompanhar manualmente os `POST evolutto_leads` nos logs.

## Evidências locais (19/10/2026)
- `npm test`: 43/43 (formulário + trava por hostname + migração A).
- `npm run build`: ok, 193 páginas.
- `npm run test:e2e`: 10/10 (Edge real com hosts mapeados para o servidor local; toda rede externa interceptada — nenhum serviço real contatado), incluindo host de prévia e localhost bloqueados.
