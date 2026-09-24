# PE Dashboard — Prescrição Eletrônica CFM

Painel analítico web restrito ao domínio `@portalmedico.org.br` (Google OAuth) sobre a base operacional `bd_cfm`, com datamart `prescricao_dw` e ETL Python.

## Visões

- **Documentos médicos** — emissões por período, UF, tipo e especialidade; origem de criação (Web/Web mobile/iOS/Android); mapa e rankings.
- **Médicos** — inscrições cadastradas (CRM/UF), médicos cadastrados (CPF único), novos por mês, inatividade por faixa sem emissão.
- **Auditoria** — anomalias agregadas. AN1 "Maiores emissores de documentos médicos" (ranking com drill-down por tipo de documento); AN2–AN4 em construção.

## Arquitetura

Duas partes que **não se comunicam por HTTP** — a coordenação acontece só pelo banco `prescricao_dw` (fila `dashboard_refresh_job`):

```text
bd_cfm (origem, 172.16.2.177)          prescricao_dw (datamart, 172.16.7.112)
        ▲  leitura                              ▲  leitura/escrita
        │                                       │
   ┌────┴─────┐                            ┌────┴─────┐
   │   ETL    │◄── fila de jobs ─────────►│    Web   │◄── usuários @portalmedico.org.br
   │ (Python) │   dashboard_refresh_job   │ (Next.js)│
   └──────────┘                            └──────────┘
```

- A **Web** (`web/`, Next.js 16) lê os fatos do datamart e escreve jobs de refresh na fila.
- O **ETL** (`etl/`, Python + psycopg2) consome a fila (`FOR UPDATE SKIP LOCKED`) e roda o pipeline de carga.
- O botão "Atualizar dados" insere um job `manual`; o scheduler cria os jobs `scheduled` diários (02:00 BRT).

## Estrutura

```
web/              aplicação Next.js (App Router, TypeScript)
  src/app/api/    endpoints do dashboard e autenticação
  src/components/ visões e gráficos (SVG/CSS, sem lib de gráficos)
etl/              ETL Python (dims → fatos → anomalias) + orquestração
  load_dims.py    dimensões
  load_fatos.py   fatos de documentos (docs, origem, especialidade, unidade, medico, medico_tipo, pacientes)
  load_medicos.py médicos (snapshot, novos, emissão)
  load_anomalias.py  anomalias AN1–AN4
  jobs.py         worker/scheduler (fila dashboard_refresh_job)
docker-compose.yml  web + etl-worker + etl-scheduler
```

## Execução

### Docker (recomendado)

```bash
cp .env.example .env     # preencher credenciais (nunca versionar)
docker compose up -d --build
```

Sobe três serviços: `web` (porta 3000), `etl-worker` e `etl-scheduler`.

### Desenvolvimento

Web (em `web/`):

```bash
npm install
npm run dev            # http://localhost:3000 (modo dev usa sessão mock sem credenciais Google)
```

ETL (em `etl/`, requer variáveis de ambiente `BDCFM_*` e `DW_*`):

```bash
python setup.py        # cria estrutura (idempotente)
python run_all.py      # carga completa (~30–40 min)
python jobs.py worker  # consome jobs queued
```

## Variáveis de ambiente

Ver `.env.example` (docker) e os READMEs de cada parte. Credenciais de banco e OAuth **nunca são versionadas**.

| Escopo | Variáveis |
|---|---|
| Web | `DW_DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |
| ETL | `BDCFM_HOST/PORT/DB/USER/PASSWORD`, `DW_HOST/PORT/DB/USER/PASSWORD`, `ETL_BATCH_SIZE` |

## Documentação

- [`PLANO_DESENVOLVIMENTO_DASHBOARD.md`](PLANO_DESENVOLVIMENTO_DASHBOARD.md) — plano, decisões e consultas por visão
- [`RESUMO_BASE_bd_cfm.md`](RESUMO_BASE_bd_cfm.md) — base relacional de origem (`bd_cfm`)
- [`etl/README.md`](etl/README.md) — datamart, scripts e modelo físico
- [`web/README.md`](web/README.md) — aplicação web, endpoints e deploy
- [`DEPLOY_PRODUCAO.md`](DEPLOY_PRODUCAO.md) — guia de implantação (inclui Docker)
- [`SESSION_STATE.md`](SESSION_STATE.md) — memória de sessão (resumo e próximos passos)
