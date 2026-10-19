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
- Destino: Cloudflare Worker `site-evolutto` com assets estáticos (`wrangler.jsonc`, `assets.directory: ./dist`), domínio `www.evolutto.com`.
- Evidência de que produção = `main`: o build local de `5f2aa33` (HEAD) gera `hoisted.CrxbHxXf.js`, o mesmo bundle servido hoje em `www.evolutto.com`.
- **Não verificado** (sem acesso ao painel Cloudflare nesta sessão): o gatilho exato (integração Git do Cloudflare em push para `main` é a hipótese), comando de build e versão do Node. Confirmar no painel antes do merge.

Passos:
1. No painel Cloudflare → Workers → `site-evolutto`: confirmar branch/comando de build e **anotar o ID da versão ativa** (alvo de rollback).
2. Criar a branch, os dois commits e abrir PR para `main` (revisão do diff).
3. Merge → build e deploy automáticos (hipótese a confirmar no passo 1). Se o build falhar, nada é publicado; corrigir e repetir.
4. Executar a verificação abaixo.

## Verificação da versão publicada (somente GET, sem enviar formulário)
| Verificação | Esperado |
|---|---|
| Bundle da home | `/_astro/hoisted.4OLeTFHj.js` (build local de B) |
| Chunk do formulário | `/_astro/hoisted.BzqMeiX9.js`, contém `evolutto_leads` e "Não conseguimos registrar" |
| HTML | `id="form-erro"` presente; script inline antigo com `makeWebhook` ausente |
| Páginas | `/`, `/consultoria`, `/mentorias`, `/suporte`, `/carreiras`, `/indicacao`, `/erp-software`, `/quem-somos` com `data-tipo="diagnostico"`; `/bootcamp` `vaga_bootcamp`; `/do-zero-a-escala` `do-zero-a-escala`; todas `data-redirect="/obrigado"` |
| Console do navegador | sem erros de JavaScript ao carregar e interagir (sem clicar em enviar) |

Se os hashes diferirem (ambiente de build diferente), validar pelos marcadores de conteúdo. Divergência de marcador = parar e investigar.

Pendente após o deploy: primeira inscrição válida → `POST evolutto_leads` `201`, linha nova com `consentimento='aceito'`, visitante redirecionado. Até lá, monitorar `edge_logs` diariamente.

## Critérios de rollback
Reverter B se, após o deploy:
- algum formulário não renderiza, não envia ou gera erro de JavaScript;
- `data-tipo`/`data-redirect` incorretos em qualquer página;
- envio válido mostra erro na tela embora o banco tenha respondido `201` (ou mostra sucesso sem `201`);
- `400` comprovadamente originado de envio válido do formulário.

Não são critério de rollback: rejeição de payload inválido/forjado; queda de conversões reportadas; diferença de contagem com analytics.

Procedimento:
1. Painel Cloudflare → `site-evolutto` → voltar para a versão anotada no passo 1 (imediato).
2. `git revert <commit 2>` em `main` para alinhar o repositório (senão o próximo push republica B).
3. A permanece: o código antigo **continua gravando**.

> **Risco do rollback: volta o sucesso falso.** O formulário antigo não confere a resposta, converte antes de gravar e redireciona sempre. Enquanto B estiver revertido, acompanhar manualmente os `POST evolutto_leads` nos logs.

## Evidências locais (19/10/2026)
- `npm test`: 33/33 (formulário + migração A).
- `npm run build`: ok, 193 páginas.
- `npm run test:e2e`: 8/8 (Edge real; toda rede externa interceptada — nenhum serviço real contatado).
