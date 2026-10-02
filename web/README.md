# PE Dashboard — Aplicação Web

**Versão: v1.5** (2026-10-02)

Frontend/API do PE Dashboard: monolito Next.js 16 (App Router, TypeScript) que consome o datamart `prescricao_dw`.

## Executar em desenvolvimento

```bash
npm install
# preencher .env.local (ver abaixo)
npm run dev
```

Abrir http://localhost:3000.

## Variáveis de ambiente (`.env.local` — nunca versionar)

| Variável | Descrição |
|---|---|
| `DW_DATABASE_URL` | Conexão com o datamart: `postgres://usr_prescricao_dw:SENHA@172.16.7.112:5432/prescricao_dw` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciais OAuth do Google (console.cloud.google.com; redirect URI `http://localhost:3000/api/auth/callback/google`) |
| `NEXTAUTH_SECRET` | Segredo de sessão (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL pública da aplicação |

Sem as credenciais do Google, o modo `development` usa sessão mock (`mrichard@portalmedico.org.br`) para permitir visualizar o shell.

## Autenticação

- next-auth v4 + provider Google (escopos `openid email profile`)
- Validação de domínio no callback `signIn`: somente `@portalmedico.org.br`
- Página de login personalizada em `/login` (tema cyberpunk, botão "Entrar com Google")
- Perfil único: todos os usuários do domínio veem as visões
- Em servidor corporativo atrás de reverse-proxy, definir `NEXTAUTH_URL` com a URL pública

## Endpoints

| Rota | Descrição |
|---|---|
| `GET /api/health` | Status da carga (último job), config (horário) e última data dos dados |
| `GET /api/filtros` | UFs e tipos de documento para os filtros |
| `GET /api/dashboard/documentos` | KPIs, série mensal, origem de criação por mês (`serie_origem`), totais por versão do app no período (`totais_versao`), ranking de medicamentos prescritos top 15 (`ranking_medicamentos`; cada linha com `categoria` terapêutica; `agrupar=principio` agrupa por princípio ativo via de-para), por tipo, por UF, ranking de especialidades (`de`, `ate`, `uf`, `tipo`; no modo "Todos", lido da snapshot `snap_especialidade`) |
| `GET /api/dashboard/medicos` | KPIs snapshot, novos por mês, por UF (**médicos com emissão no período** — CPF distintos — com população para densidade por 100k hab), inatividade por faixa, ranking "Médicos por especialidade" (médicos distintos por CPF e documentos no período; no modo "Todos", lido da snapshot `snap_especialidade_medicos`) (`de`, `ate`, `uf`) |
| `GET /api/dashboard/numeracao` | Visão RDC1000: pool de numerações ANVISA por tipo (disponíveis/utilizadas/taxa, médicos, estoque, nunca usaram), cobertura (`emitentes_sem_numeracao` no período; no modo "Todos", histórico), maiores pools e maiores consumos (`de`, `ate`, `uf`) |
| `GET /api/dashboard/auditoria` | Ranking de médicos por anomalia (`anomalia`): AN1 "Emissões de documentos no período" (`de`, `ate`, `uf`, `tipo`, `limite`) — `count` de documentos; AN2 "Atendimentos a pacientes distintos no período" (`de`, `ate`, `uf`, `limite`) — `count(DISTINCT id_paciente)`; AN3 "Maior volume diário de emissões a pacientes distintos no período" (`de`, `ate`, `uf`, `limite`) — maior dia em documentos assinados, ordenado por documentos do dia; sem `de`/`ate` usa o melhor dia do histórico (`fato_medico_maior_dia`); AN4 "Pacientes distintos por instituição no período" (`de`, `ate`, `uf`, `limite`) — instituições (CNES; sem CNES, a unidade) ordenadas por pacientes distintos com documentos assinados, com nº de unidades e médicos vinculados (vínculos ativos). `limite` clamp 1–500, default 20 |
| `GET /api/dashboard/auditoria/medico` | Drill-down (`id_medico`, `anomalia`): AN1 → docs por tipo (donut) + série mensal + especialidades; AN2 → pacientes distintos por mês + `total_pacientes`; AN3 (`id_medico`, `dia`) → resumo do dia (assinados/pacientes), mix por tipo e lista de documentos assinados (`ds_qrcode`, data/hora, tipo, instituição e UF; até 1.000). Na UI, o detalhamento abre **inline, logo abaixo da linha** selecionada (fecha clicando de novo ou em "Fechar") |
| `GET /api/dashboard/auditoria/instituicao` | Drill-down da AN4 (`chave` = CNES puro, `CNES:...` ou `UNIDADE:...`, `de`, `ate`): total de pacientes distintos, documentos por tipo (rosca), evolução mensal e unidades do grupo (até 50) |
| `POST /api/admin/refresh-jobs` | Enfileira job manual no `dashboard_refresh_job` (botão "Atualizar dados") |
| `GET /api/admin/refresh-jobs/latest` | Último job da fila (status da carga exibido no cabeçalho) |
| `GET` / `PUT /api/admin/refresh-config` | Horário da carga diária (restrito a `mrichard@portalmedico.org.br`) |
| `GET /api/admin/logs` | Visão "Logs" (admin): acessos (logins) e atualizações (jobs) |
| `POST /api/admin/logs/clear` | Limpeza dos logs por alvo (`{alvo: acessos\|jobs}`), restrita ao admin |

## Estrutura

```
src/
  app/
    api/...          # route handlers (dados e autenticação)
    globals.css      # tema cyberpunk dark
    layout.tsx       # shell raiz
    page.tsx         # sessão + dashboard
    login/           # página de login (Google)
  components/
    dashboard.tsx    # abas, filtros e visões (SVG/CSS, sem lib de gráficos)
  lib/
    auth.ts          # next-auth (Google + domínio)
    db.ts            # pool pg do datamart
public/
  brazil.geojson     # mapa do Brasil por UF (simplificado)
  cfm.png            # logo
```

## Deploy (servidor interno Windows)

1. `npm run build` → `npm start` (ou serviço Windows/PM2)
2. Configurar `.env.local` com credenciais reais do Google e `NEXTAUTH_URL` do host interno
3. Remover o mock de dev (aplicação já cai no redirect do next-auth quando `GOOGLE_CLIENT_ID` existe)
