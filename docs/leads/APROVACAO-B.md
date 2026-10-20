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

### Confirmado pela API do Cloudflare (19/10/2026, somente leitura)
- Worker `site-evolutto` (`5ce90e21dd964a2db0a8d8012fff45a3`), conta `9d5769…f603`, Workers Builds ligado a `github: Evoluttoplataforma/site-evolutto` (`auto_build_enabled: true`).
- Trigger **"Implantar ramificação padrão"**: branch `main` → `npm run build` + `npx wrangler deploy`, raiz `/`, cache ligado. Push em `main` = deploy em produção.
- Trigger **"Implantar ramificações que não são de produção"**: todas as branches exceto `main` → `npm run build` + `npx wrangler versions upload`. Cria uma versão do Worker com URL de versão/alias (não vira a implantação ativa). Segundo a documentação do Cloudflare, URLs de versão usam os mesmos recursos de produção.
- `previews_enabled: false` (modelo novo "Worker Previews" não ativado); subdomínio `workers.dev` habilitado e URLs de prévia habilitadas.
- Variáveis de build: **nenhuma** em produção nem em prévias (`environment_variables: {}`). Logo, `PUBLIC_*` ficam vazias no build e o site usa os valores fixos do código.
- **Implantação ativa**: `4c686d13-4c18-4d38-831d-e173602bf173`, 28/08/2026 11:54:36 UTC, 100% na versão `bb773b3a-dcdf-4a68-a8f5-e8259fc11618` (nº 65). É a implantação mais recente das 10 listadas.
- Builds de `main` em 28/08/2026: `70569f5` **sucesso** (build `c1a09bf2`, 11:53–11:54 UTC); `ea5a33d` **falha** (build `c12290b9`); `5f2aa33` **falha** (build `5c86537f`).
- **Erro real dos dois builds com falha** (etapa de deploy, após build ok): `Invalid _redirects configuration: Line 4: Only relative URLs are allowed. [code: 100324]`. A linha 4 de `public/_redirects` (`https://evolutto.com/* https://www.evolutto.com/:splat 301`, adicionada em `ea5a33d`) é a única com origem absoluta.

### Inferido (alta confiança, não registrado pela API)
- A versão `bb773b3a` foi gerada pelo build de `70569f5`: criada às 11:54:36, dentro da janela desse build; a versão não guarda o hash do commit. Coerente com o HTML publicado (sem as mudanças de `ea5a33d`/`5f2aa33`).

### Decisão de escopo (19/10/2026)
Opção 1 aprovada para preparação local: remover só a linha 4 de `public/_redirects` (commit `d993f98`) e incluir **explicitamente** no PR as mudanças não publicadas de `ea5a33d` e `5f2aa33` (ver `PR-fix-captura-leads.md`). `src/` e `public/` não são restaurados de `70569f5`.
- Redirect apex → www passa a ser **só por JavaScript** (`Site.astro`): servidor responde 200; sem JS não há redirect. HTTP 301 exige Redirect Rule no Cloudflare (não alterada).
- **Limitação**: validação local (build ok, `_redirects` sem origem absoluta) não comprova que o Cloudflare aceitará o deploy; só o build remoto comprova.

### Consequências para B
- A branch parte de `5f2aa33`, que contém a linha 4: **o build de prévia da branch também falharia** (o `versions upload` valida o `_redirects`), e o build de produção após o merge falharia igual.
- Se a linha for corrigida, o merge publica pela primeira vez as mudanças de `ea5a33d` e `5f2aa33` (links do blog absolutos em header, footer, home e 404; `BLOG_HOME`/`SITE_ORIGIN`; script que redireciona `evolutto.com` → `www`). Elas precisam entrar **explicitamente** no escopo do PR ou ser retiradas.

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
1. Registrar a implantação ativa no momento do merge (hoje `4c686d13…`, versão `bb773b3a…`) como alvo de rollback.
2. Push da branch e PR para `main` (gera versão de prévia pelo trigger de branches não-produção — ver acima).
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
1. Painel Cloudflare → `site-evolutto` → Deployments → voltar para a versão registrada no passo 1 (ou `wrangler rollback <version_id>`), imediato.
2. `git revert <commit 2>` em `main` para alinhar o repositório (senão o próximo push republica B).
3. A permanece: o código antigo **continua gravando**.

> **Risco do rollback: volta o sucesso falso.** O formulário antigo não confere a resposta, converte antes de gravar e redireciona sempre. Enquanto B estiver revertido, acompanhar manualmente os `POST evolutto_leads` nos logs.

## Evidências locais (19/10/2026)
- `npm test`: 43/43 (formulário + trava por hostname + migração A).
- `npm run build`: ok, 193 páginas.
- `npm run test:e2e`: 16/16 (Edge real com hosts mapeados para o servidor local; rede externa interceptada), incluindo trava (prévia/localhost), redirect do apex (caminho, query, hash, sem loop) e links do blog.
