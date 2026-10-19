## fix: formulário só confirma sucesso após persistência do lead (+ publicação pendente de 28/08)

### Contexto
- Desde 24/06/2026 o `DiagnosticoForm` enviava `consentimento`, coluna inexistente em `public.evolutto_leads`. O insert falhava (HTTP 400) e o visitante via sucesso mesmo assim (conversão antes de gravar, redirect incondicional).
- **Migração A já aplicada** em 19/10/2026 18:00 UTC no Supabase MKT ORBIT (`consentimento text`, sem default e sem backfill). Schema verificado; RLS e políticas inalteradas. Registro: `docs/leads/EXECUCAO-A-2026-10-19.md`.
- **Captura pelo site em produção ainda aguarda confirmação funcional**: nenhuma inscrição válida desde a aplicação; não foram criados leads de teste.
- Produção está em `70569f5` (implantação `4c686d13…`, versão `bb773b3a…`). Os deploys de `ea5a33d` e `5f2aa33` falharam com `Invalid _redirects configuration: Line 4: Only relative URLs are allowed. [code: 100324]`.

### O que este PR publica

**1. Correção da captura (B)**
- **Corrige o falso sucesso**: conversão, `sessionStorage` e redirect só após HTTP 2xx da gravação.
- Erro visível (`role="alert"`) com campos preservados e reenvio; mensagens para tentar de novo, resultado incerto (rede/timeout 15 s) e erro permanente.
- Um envio por vez (duplo clique) e nenhum envio após sucesso.
- Make mantido (fire-and-forget, sem confirmação de entrega); destinos, variantes, tipos e redirects do formulário inalterados.
- Trava por hostname: fora de `www.evolutto.com`/`evolutto.com` o formulário mostra aviso de prévia e não envia nada (sem Supabase, Make ou conversão). Evita envios acidentais em prévias; **não é controle de segurança** — a API continua aceitando chamadas diretas. Prévias antigas (PRs #1 e #2) não são afetadas.

**2. Mudanças de 28/08 que estão em `main` e nunca foram publicadas (incluídas explicitamente)**
- `ea5a33d`: links do blog passam a ser absolutos (`https://www.evolutto.com/blog/`) no header, footer, home e 404, via `BLOG_HOME`/`SITE_ORIGIN` em `src/lib/site.ts` (`CTA_URL` também definido, sem uso); comentários do `_redirects`; `.gitignore`, `scripts/fix-legacy-blog-links.sql` e `scripts/seo-optimize-all.mjs` (não publicados no site).
- `5f2aa33`: script no `<head>` de `Site.astro` que, em `evolutto.com`, faz `location.replace('https://www.evolutto.com' + caminho + query + hash)`; doc `docs/CLOUDFLARE-BLOG-REDIRECT.md`.
- **Correção do deploy**: remove a linha 4 de `public/_redirects` (`https://evolutto.com/* https://www.evolutto.com/:splat 301`), a única com origem absoluta, que o Cloudflare rejeita. Nenhuma outra regra muda.

**Redirect apex → www: JavaScript, não HTTP 301.** O servidor continua respondendo 200 em `evolutto.com`; o navegador troca para `www` ao executar o script. Visitantes sem JavaScript e robôs que não executam JS ficam no apex. Um 301 de verdade exige uma Redirect Rule no Cloudflare (fora deste PR, sem alteração de configuração).

### Limites conhecidos
- **Timeout após gravação ainda pode gerar duplicação**: se o banco grava e a resposta se perde, o visitante vê "não conseguimos confirmar", reenvia e uma segunda linha é criada. A recepção confirmada no servidor fica para o desenho C (em preparação, fora deste PR).
- **Validação local não garante que o Cloudflare aceite o deploy**: o `_redirects` não tem mais origem absoluta e o build local passa, mas a aceitação só é comprovada pelo build remoto (versão de prévia desta branch e, depois, o deploy de `main`).

### Commits
1. `a0b205d` chore: ferramentas de teste e registro da migração A.
2. `769adee` fix: formulário só confirma sucesso após persistência.
3. `0752f61` docs: bundles como evidência, risco das prévias, texto do PR.
4. `92f131e` docs: versão de produção corrigida (70569f5).
5. `d823f0d` fix: trava por hostname.
6. `fe2ddc3` docs: configuração confirmada pela API do Cloudflare e erro real dos builds.
7. `d993f98` fix: remove regra de `_redirects` com URL absoluta.
8. commit de testes/documentação final (redirect e links).

Base: `5f2aa33` (inclui `ea5a33d` e `5f2aa33`, ainda não publicados).

### Testes (locais; rede externa interceptada)
- `npm test`: 43/43 (formulário com mocks, trava por hostname, migração A em PGlite).
- `npm run build`: ok; `dist/_redirects` sem origem absoluta (52 regras relativas, códigos válidos).
- `npm run test:e2e`: 16/16 em navegador real (Edge) com hosts mapeados para o servidor local: captura (sucesso, 400, 503→reenvio, triplo clique, timeout, bootcamp, do-zero-a-escala com UTMs, sem consentimento), trava (prévia e localhost), redirect do apex (preserva caminho, query e hash; raiz; sem loop em `www`; prévia não redireciona) e links do blog (header/footer/home/404 → `https://www.evolutto.com/blog/`; `/blog/` responde 200).

### Verificação pós-deploy (somente GET; ver `docs/leads/APROVACAO-B.md`)
- Build de `main` com sucesso no Workers Builds e nova implantação ativa (diferente de `4c686d13…`).
- Formulário: `#form-erro` presente, script inline antigo ausente, `data-tipo`/`data-redirect` corretos por página, console sem erros. Nomes de bundle são evidência do build, não critério.
- Links do blog absolutos; `evolutto.com/<caminho>?<query>` vai para `https://www.evolutto.com/<caminho>?<query>` no navegador (resposta HTTP continua 200).
- Confirmação funcional da captura pendente até uma inscrição válida real ou teste autorizado.

### Prévia deste PR
O Workers Builds cria, para a branch, uma versão com URL pública que usa os mesmos destinos de produção (Supabase e Make). A trava por hostname impede o envio do formulário nessa URL.

### Rollback
Voltar no Cloudflare para a implantação `4c686d13…` (versão `bb773b3a…`) e `git revert` dos commits deste PR em `main`. A migração A permanece e a captura continua. **Risco: o rollback reintroduz o falso sucesso.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
