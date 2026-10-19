## fix: formulário só confirma sucesso após persistência do lead

### Contexto
- Desde 24/06/2026 o `DiagnosticoForm` enviava `consentimento`, coluna inexistente em `public.evolutto_leads`. O insert falhava (HTTP 400) e o visitante via sucesso mesmo assim (conversão antes de gravar, redirect incondicional).
- **Migração A já aplicada** em 19/10/2026 18:00 UTC no Supabase MKT ORBIT (`consentimento text`, sem default e sem backfill). Schema verificado; RLS e políticas inalteradas. Registro: `docs/leads/EXECUCAO-A-2026-10-19.md`.
- **Captura pelo site em produção ainda aguarda confirmação funcional**: nenhuma inscrição válida desde a aplicação; não foram criados leads de teste.

### O que este PR faz (B)
- **Corrige o falso sucesso**: conversão, `sessionStorage` e redirect só após HTTP 2xx da gravação.
- Erro visível (`role="alert"`) com campos preservados e reenvio; mensagens para tentar de novo, resultado incerto (rede/timeout 15 s) e erro permanente.
- Um envio por vez (duplo clique) e nenhum envio após sucesso.
- Make mantido (fire-and-forget, sem confirmação de entrega); destinos, variantes, tipos e redirects inalterados.

### Limite conhecido
- **Timeout após gravação ainda pode gerar duplicação**: se o banco grava e a resposta se perde, o visitante vê "não conseguimos confirmar", reenvia e uma segunda linha é criada. A recepção confirmada no servidor fica para o desenho C (em preparação, fora deste PR).

### Commits
1. `chore`: ferramentas de teste (vitest, pglite, playwright-core) e registro da migração A.
2. `fix`: correção do formulário (revertível isoladamente).

### Testes
- `npm test`: 43/43 (formulário com mocks, trava por hostname, migração A em PGlite).
- `npm run build`: ok.
- `npm run test:e2e`: 10/10 em navegador real com hosts mapeados e toda rede externa interceptada (sucesso, 400, 503→reenvio, triplo clique, timeout, bootcamp, do-zero-a-escala com UTMs, sem consentimento, host de prévia e localhost bloqueados).

### Verificação pós-deploy (somente GET; ver `docs/leads/APROVACAO-B.md`)
- Bundles do build local (`hoisted.4OLeTFHj.js` na home; formulário em `hoisted.BzqMeiX9.js`) são **evidência deste build, não critério permanente** — outro build pode gerar nomes diferentes. Validar pelo comportamento e pela versão ativa no Cloudflare: `#form-erro` presente, script inline antigo ausente, `data-tipo`/`data-redirect` corretos por página, chunk com a nova lógica, console sem erros.
- Confirmação funcional pendente até uma inscrição válida real ou teste autorizado.

### Prévia deste PR
O Workers Builds gera uma prévia pública em `*.templum.workers.dev` para a branch. Ela usa os mesmos destinos de produção (Supabase e Make): **envios feitos na prévia gravam como leads reais**. Este PR inclui uma trava por hostname: fora de `www.evolutto.com`/`evolutto.com` o formulário mostra aviso de prévia e não envia nada (sem Supabase, Make ou conversão). Ela evita envios acidentais em prévias; **não é controle de segurança** — a API continua aceitando chamadas diretas. Prévias antigas (PRs #1 e #2) não são afetadas.

### Rollback
Voltar à versão anterior no Cloudflare e `git revert` do commit `fix`. A migração A permanece e a captura continua. **Risco: o rollback reintroduz o falso sucesso.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
