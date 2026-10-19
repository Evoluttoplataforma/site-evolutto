# Captura de inscrições — correção emergencial

Status (19/10/2026): **A aplicada — schema verificado; captura pelo site em produção ainda não comprovada** (nenhum envio desde T0). **B preparada, não publicada.** Ver `EXECUCAO-A-2026-10-19.md` e `APROVACAO-B.md`.

## Problema comprovado

- O formulário publicado (`DiagnosticoForm`) grava direto em `public.evolutto_leads` via REST com a chave anon (`PUBLIC_LEAD_WEBHOOK` vazio no deploy; a função `submit-lead` não existe).
- Desde o commit `4c057ff` (24/06/2026 14:42 -03) o payload inclui `consentimento`, coluna inexistente → PostgREST responde **400** e nada é gravado.
- Evidências: último registro em 24/06 02:59 -03 (9 no total); logs com `POST /rest/v1/evolutto_leads → 400` em 16/10 e 17/10.
- O formulário não confere a resposta, dispara a conversão antes de gravar e redireciona sempre → sucesso falso.

## Aprovação A — migração emergencial (independente das demais)

Arquivo: `db/migrations/20261019120000_evolutto_leads_consentimento.sql`

- `add column if not exists consentimento text` — **sem default, sem backfill**; registros anteriores ficam `NULL` (= sem evidência).
- Guarda o valor do checkbox (`"aceito"`). **Não é data de aceite**: `created_at` é a data de recebimento. Data/versão da política aceita ficam para mudança própria (exigem campo enviado pelo cliente ou registro no servidor).
- Não altera RLS, políticas, funções ou outras colunas. Idempotente.

Efeito esperado: o **código já publicado volta a gravar**, sem deploy do site. Continua existindo sucesso falso em outras falhas até a Aprovação B.

### Implantação
Projeto: Supabase **MKT ORBIT** `yfpdrckyuxltvznqfqgh` (sa-east-1) — o mesmo usado pelo site (`DiagnosticoForm.astro`, `src/lib/blog.ts`).

1. Confirmar backup/PITR disponível e anotar o horário UTC de aplicação (`T0`).
2. Aplicar exatamente o arquivo da migração, por pessoa autorizada.
3. Verificação imediata (somente leitura):
   ```sql
   select column_name, data_type, is_nullable, column_default
     from information_schema.columns
    where table_schema='public' and table_name='evolutto_leads' and column_name='consentimento';
   -- esperado: 1 linha: consentimento | text | YES | NULL

   select count(*) filter (where consentimento is not null) as com_consentimento, count(*) as total
     from public.evolutto_leads;
   -- esperado logo após aplicar: com_consentimento = 0, total = 9 (nenhum preenchimento retroativo)

   select policyname, cmd, roles, qual, with_check from pg_policies
    where schemaname='public' and tablename='evolutto_leads' order by policyname;
   -- esperado: as mesmas 2 políticas de antes (evo_anon_leads INSERT; evo_auth_leads ALL)
   ```
4. Verificação passiva (sem lead de teste; aguarda envio orgânico — histórico recente ≈ 0,6/dia):
   - Critério principal: **inscrições válidas do formulário persistem**. Todo `POST /rest/v1/evolutto_leads` após `T0` vindo de envio válido responde `201` e gera uma linha com `created_at ≥ T0`.
   - Rejeições legítimas (payload inválido/forjado, ex.: chamadas diretas à API com campos inexistentes) **não são falha da implantação**. Um `400` só conta como falha quando houver evidência de que veio de um envio válido do formulário (ex.: item correspondente na fila do Make com campos válidos e sem linha no banco).
   - Evidência auxiliar (não infalível): itens novos na fila do webhook Make 2752793 casados com linhas por horário (± 10 s) e hash do e-mail. Relógios, reenvios e e-mails repetidos podem gerar falso positivo ou negativo; divergência = investigar, não reprovar automaticamente.
   - Analytics (GA4/Meta) não é critério: bloqueadores e consentimento alteram eventos.

**Abortar/reverter se**: erro na migração; `400` comprovadamente originado de envio válido do formulário; políticas ou contagem de linhas antigas alteradas.

### Rollback
- Preferencial: **manter a coluna** (aditiva). Remover volta a quebrar todo insert.
- `db/rollback/...down.sql` só remove a coluna se não houver nenhum `consentimento` preenchido — nunca apaga evidência coletada.

## Aprovação B — correção do formulário (deploy do site)

Arquivos: `src/lib/lead-submit.js` (novo), `src/components/DiagnosticoForm.astro`.

- Sucesso **somente com HTTP 2xx** da persistência; conversão (`trk.lead`), `sessionStorage` e redirect só depois disso.
- Falha → mensagem acessível (`role="alert"`), campos preservados, botão liberado para reenvio. Mensagens distintas: tentar de novo (408/429/5xx), incerto (rede/timeout 15 s), permanente (outros 4xx).
- Duplo clique/concorrência: um único envio em andamento; após sucesso, novos envios são ignorados.
- Make: mesmo corpo e destino, fire-and-forget. **Não há confirmação de entrega**: `no-cors` devolve resposta opaca. O controle registra apenas que a requisição saiu sem erro de rede; nesse caso o mesmo conteúdo não é reenviado. Se a tentativa falhar por rede, o reenvio do formulário manda de novo ao Make. Hoje o cenário do Make está inativo (auditoria de 19/10/2026: só escrevia no Pipedrive desativado), então o Make não é fonte de verdade.
- Destinos, chaves e redirects iguais à versão publicada (variantes `full`/`simple`, `tipo`, `redirectTo`).
- **Sem `submission_id`**: não há coluna nem unicidade preparadas.
- **Limite de B, explícito**: B reduz falhas silenciosas e elimina duplicação por duplo clique/concorrência, mas **não garante ausência de duplicação** quando o banco grava e a resposta se perde (timeout após gravação): o visitante vê "não conseguimos confirmar", reenvia e uma segunda linha é criada. Só a recepção confirmada no servidor (`evolutto_leads_submit` + `submission_id`, desenho C/B2) resolve isso.

**Depende da Aprovação A**: publicar B antes de A faz o visitante ver erro em todo envio (correto, mas bloqueia a captura).

### Implantação
1. A aplicada e ao menos um `201` real observado após `T0`.
2. Commit + deploy pelo fluxo atual do Cloudflare (sem mudança de env).
3. Verificar no site publicado (só GET): `id="form-erro"` presente; `data-tipo`/`data-redirect` corretos em home, bootcamp, do-zero-a-escala; bundle `hoisted.*.js` contém `evolutto_leads`.
4. Aceite: inscrições válidas persistem (`201` + linha nova; o visitante só vê sucesso depois disso); falhas aparecem como erro na tela, não como sucesso. Rejeições de payload inválido não reprovam o deploy. Reconciliação com a fila do Make é evidência auxiliar. Queda nas conversões reportadas é esperada: antes contavam envios que falhavam.

### Rollback de B (preserva a captura de A)
Reverter o commit de B e redeployar. A coluna de A permanece, então o código antigo **continua gravando**. **Risco explícito: volta o sucesso falso** — o formulário antigo não confere a resposta, dispara a conversão antes de gravar e redireciona sempre; qualquer falha nova de persistência volta a ser invisível ao visitante e à equipe. Ao reverter, manter monitoramento manual dos `POST evolutto_leads` nos logs até reaplicar B.

## Testes executados (locais, sem rede, sem leads reais)

`npm test` → **33/33 passaram** nos testes versionados (formulário e migração A). Os testes do desenho C ficam fora deste commit, em preparação. `npm run build && npm run test:e2e` → **8/8 cenários passaram** (Edge real, headless).

- `tests/browser/form.e2e.mjs`: serve `dist/` localmente e intercepta **toda** requisição externa (Supabase, Make, pixels, YouTube) — nada sai da máquina. Cenários: home 201 (1 conversão, 1 Make, `/obrigado`); 400 (erro visível, campos e consentimento preservados, botão liberado, sem conversão/redirect); 503→reenvio→201 (2 POSTs, 1 conversão, 1 Make); triplo clique com resposta lenta (1 POST); timeout > 15 s (mensagem "incerto", sem conversão); bootcamp simple (`vaga_bootcamp`); do-zero-a-escala com UTMs (`tipo`, `utm`, redirect configurado); sem consentimento (nada enviado).

- `tests/evolutto-leads-schema.test.js` (PGlite, Postgres em memória, schema = `db/snapshot/evolutto_leads.sql` copiado da produção, insert emulando PostgREST como `anon` com RLS):
  - antes da migração: payloads full e simple rejeitados apenas por `consentimento`;
  - depois: ambos aceitos, `consentimento='aceito'` preservado, defaults (`created_at`, `enviado_crm`) intactos;
  - sem default, sem backfill, sem coluna de data de aceite; idempotente; anon sem leitura;
  - rollback recusa apagar coluna com dados.
- `tests/lead-submit.test.js` (mocks de fetch): sucesso 201; ordem gravação→conversão; redirect preservado; 400/401/403/404/408/429/500/502/503; falha de rede; timeout; sem destino; erro→reenvio (1 conversão, 1 Make); dados corrigidos; concorrência ×3; replay; função OK sem duplicar REST; função falha→REST; Make indisponível.
- `astro build`: 193 páginas; variantes/redirects conferidos no HTML; nenhum `service_role`/token novo no bundle.

Limitações: a emulação do PostgREST não roda o PostgREST real; não há teste de navegador real (jsdom/Playwright); a migração não foi aplicada em branch Supabase.
