# Registro de execução — Migração A (consentimento)

> **Status: schema verificado. Captura pelo site em produção ainda NÃO comprovada** — nenhum `POST /rest/v1/evolutto_leads` desde T0 (checado às ~18:05 UTC). Só um envio válido real, ou um teste explicitamente autorizado, comprova a captura.

- Autorização: usuário, 19/10/2026, escopo restrito à migração A (sem deploy B, C, D, permissões da pasta ou Make).
- Projeto: Supabase **MKT ORBIT** `yfpdrckyuxltvznqfqgh`, sa-east-1, Postgres 17.6, status `ACTIVE_HEALTHY`.
- Objeto: `public.evolutto_leads`.
- Arquivo: `db/migrations/20261019120000_evolutto_leads_consentimento.sql` (SQL idêntico ao aprovado).
- Execução: `apply_migration` → `success: true`. Registrada no histórico do projeto como `20261019180000 evolutto_leads_consentimento`.
- **T0 (início da janela de verificação): 2026-10-19 18:00 UTC.**

## Verificação prévia (17:59:51 UTC)
| Item | Esperado | Observado |
|---|---|---|
| Colunas | 18, sem `consentimento` | 18, sem `consentimento` |
| RLS | ativa | ativa |
| Políticas | `evo_anon_leads` INSERT `with check true`; `evo_auth_leads` ALL `auth.role()='authenticated'` | idênticas |
| Triggers | 0 | 0 |
| Linhas | 9 (última 24/06/2026 05:59 UTC) | 9 (última 24/06/2026 05:59 UTC) |

## Verificação posterior (18:00:13 UTC)
| Item | Esperado | Observado |
|---|---|---|
| `consentimento` | `text`, nulo permitido, sem default | `text`, `YES`, `NULL` (posição 19) |
| Colunas | 19 | 19 |
| Comentário da coluna | texto aprovado | presente, idêntico |
| RLS e políticas | inalteradas | inalteradas |
| Linhas | 9 | 9 |
| Linhas com `consentimento` preenchido | 0 | 0 |
| Última linha | 24/06/2026 05:59 UTC | inalterada |

Nenhum lead de teste criado. Nenhum dado pessoal consultado (apenas metadados e contagens).

## Pendente: verificação passiva após T0
Aguarda envio orgânico do site (não criar lead de teste):
- `edge_logs`: `POST /rest/v1/evolutto_leads` após T0 com `201`; investigar qualquer `400` (ver critérios em `CAPTURA-EMERGENCIAL.md`).
- Linhas novas com `created_at ≥ T0` e `consentimento = 'aceito'`.
- Evidência auxiliar: itens novos na fila do webhook Make 2752793 × linhas novas (horário + hash do e-mail).

## Rollback disponível (não executado)
`db/rollback/20261019120000_evolutto_leads_consentimento.down.sql` — recusa remover a coluna se houver consentimento gravado. Rollback preferencial: manter a coluna.
