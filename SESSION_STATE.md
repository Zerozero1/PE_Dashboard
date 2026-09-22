# SESSION STATE — PE Dashboard
_Atualizado em: 2026-09-22 11:58 BRT_

## 🎯 Objetivo Atual
Dashboard web restrito ao dominio `@portalmedico.org.br` (Google OAuth) sobre a base `bd_cfm`, com datamart `prescricao_dw`, ETL Python em Windows (maquina separada da aplicacao) e 4 visões: Documentos, Medicos, Dispensacoes, Auditoria.

## ✅ Última Sessão (Resumo)
- ETL Python criado e executado (pasta `etl/`): `config.py` (credenciais via env), `common.py`, `schema.sql` + `ddl_extra.sql` (15+3 tabelas no schema `prescricao` do DW), `setup.py`, `load_dims.py`, `load_fatos.py` (modos docs/especialidade/unidade/medico/pacientes), `load_medicos.py`, `load_dispensacoes.py`, `load_anomalias.py`, `run_all.py`, `validate.py`, `audit_counts.py`.
- Dimensões carregadas: dim_data (1.787), dim_uf (28), dim_tipo_documento (16), dim_medico (605k), dim_especialidade (310k), dim_unidade (565k), dim_farmaceutico (66k).
- Fatos carregadas com dados reais da origem:
  - fato_documento_dia: ~61,8M documentos (janela 2021-10-07 a 2026-09-22), 536k linhas; top UF: SP 11,4M / PR 10,7M / RJ 8,3M.
  - fato_documento_especialidade_dia: 42,1M registros.
  - fato_documento_unidade_dia: 61,8M docs por unidade; fato_documento_medico_dia: 61,8M docs por médico.
  - fato_documento_paciente_dia: 48,3k linhas (distintos por dia×UF, em 70s).
  - fato_medico_dia (novos por dh_atualizacao: 14,8k linhas) + fato_medico_snapshot (27 UFs).
  - fato_dispensacao_dia: 37,9k linhas (fonte tb_historico_dispensacao + cadeia até paciente).
  - fato_auditoria_dia: AN1=56, AN2=59, AN3=1, AN4=1.790 registros (severidade 2x/3x/5x).
- Estratégia de extração validada: lotes por faixa de id_consulta_documento (2M por lote, ~5min a carga completa de docs; MCP estourava timeout em filtro temporal direto). Varreduras completas para distinct (pacientes) rodaram em 70-90s via psycopg2.
- Ponto de atenção: origem está em produção ativa (cresceu ~1M docs durante as cargas); contagens do DW acompanham a origem no momento de cada varredura. Cargas são idempotentes (upsert).
- BUG corrigido (2026-09-22): `ON CONFLICT DO UPDATE` por lote sobrescrevia chaves que aparecem em mais de um lote (~970k docs perdidos). Correção: tabelas `stg_documento_*` acumulam os lotes e a fato é reconstruída com `SUM` a cada carga (rebuild_fact). DW final: 61,84M documentos (consistente com a origem).
- FIX especialidade (2026-09-22): fato_documento_especialidade_dia passa a derivar do CADASTRO do médico que assina (tb_medico_especialidade via rl_medico_unidade_atendimento.id_medico, in_ativo='S'), não mais de rl_med_especialidade_consulta (vínculo da consulta, com outliers de até 104 especialidades). Cobertura subiu de 42,1M para 55,5M docs atribuídos (89,9%). Médicos: 1 esp=158k, 2=60,6k, 3=10,6k, 4+=2,1k; tb_medico.ds_especialidade vazia; 61,8% dos médicos sem especialidade cadastrada.
- Debug: debug_batch.py / debug2.py / debug3.py (regressão do problema de sobrescrita).
- Limpeza de colunas sem uso (2026-09-22): removidas `dim_data.dia_semana` e `fato_medico_dia.inscricoes_cadastradas/inscricoes_ativas/medicos_ativos` (sempre vazias; valores correntes vivem em `fato_medico_snapshot`). Demais colunas "redundantes" mantidas por custo baixo.

## 🔧 Em Progresso / Próximos Passos
- [ ] Fase 1 — Fundacao (EM ANDAMENTO): projeto Next.js 16 criado em `web/` (app router, TS). Feito: shell com 4 visoes no padrao cyberpunk dark (abas horizontais, acento por visao), `api/health` lendo o DW real (job/config/dados), `api/admin/refresh-jobs` enfileirando job manual, next-auth v4 com Google OAuth + validacao de dominio `@portalmedico.org.br` (signIn callback). Modo dev sem credenciais Google: sessao mock.
  - Faltam: criar credenciais Google OAuth (console.cloud.google.com, redirect http://localhost:3000/api/auth/callback/google), `NEXTAUTH_SECRET`, `.env.local` em producao; remover mock dev ao subir.
  - Testado: build OK; dev server OK; `/api/health` retorna DW real (job success, config 02:00, 61,84M docs); pagina renderiza (HTTP 200).
- [ ] etl/jobs.py — scheduler/worker com `dashboard_refresh_job` (Fase 5) e carga incremental diária (reprocessar janela D-1..hoje via faixas de id recentes).
  - FEITO (2026-09-22): jobs.py criado e testado (worker com claim FOR UPDATE SKIP LOCKED + recover_stale; scheduler lendo dashboard_refresh_config; enqueue-manual). Falta apenas: carga incremental (hoje o job roda o run_all completo, ~40 min) e agendamento no Windows (Task Scheduler).
- [ ] Testar run_all.py completo em uma execução.
- [ ] Fase 1 — Fundacao: projeto web, Google OAuth, validacao de dominio, shell com 4 visões (padrão cyberpunk dark aprovado).
- [ ] Fase 3 — Visões Documentos, Medicos e Dispensacoes consumindo as fatos do DW.
  - EM ANDAMENTO (2026-09-22): endpoints /api/dashboard/{documentos,medicos,dispensacoes,auditoria} implementados com SQL real sobre o datamart; componentes do dashboard renderizam KPIs, series (SVG), donut, mapa com bolhas por UF, rankings e tabelas. Validado com dados reais: 30d = 2,99M docs (97,9% assinados), 606,8k inscrições, 394,5k ativos, 202,7k dispensações.
  - Faltam: filtros interativos (periodo/UF/tipo/assinado na UI), mapa geografico completo (bolhas em posições fixas por enquanto), farmacêuticos por mês.
- [ ] Solicitar ao DBA indices em `tb_consulta_documento.dh_documento`, `tb_consulta.dt_consulta`, `tb_historico_dispensacao.dh_historico_dispensacao` e FKs de dispensacao.

## ⚠️ Pontos de Atencao
- `usr_select` em `bd_cfm` e somente leitura; nenhuma gravacao na origem.
- ETL sem os indices acima exigira varreduras pesadas (tb_consulta_documento: 43 GB).
- `tb_medico` sem data de cadastro: "novos medicos" usa `dh_atualizacao` como proxy (decisao registrada).
- `tb_medico.ds_foto` (bytea, ~15 GB): nunca selecionar no ETL.
- Auditoria da origem fora do escopo do dashboard (decisao registrada).
- `usr_prescricao_dw` nao pode criar schemas em `prescricao_dw`; usar `prescricao`/`staging`.
- Nenhuma exportacao CSV/Excel no MVP.
- Nao ha auditoria do uso do dashboard (decisao 17).

## 🧱 Stack & Arquitetura
- Origem: PostgreSQL `bd_cfm` 13.8 (172.16.2.177:5432), leitura via `usr_select`.
- Datamart: PostgreSQL `prescricao_dw` 13.7 (172.16.7.112:5432), escrita via `usr_prescricao_dw`, schemas `prescricao`/`staging`.
- ETL: aplicacao Python (pasta `etl/`, psycopg2, sem pandas) em ambiente Windows (scheduler + worker com fila de jobs em `dashboard_refresh_job`), em MAQUINA SEPARADA da aplicacao web.
  - Scripts: `run_all.py` (pipeline), `load_dims.py`, `load_fatos.py <docs|especialidade|unidade|medico|pacientes>`, `load_medicos.py`, `load_dispensacoes.py`, `load_anomalias.py`, `setup.py`, `validate.py`.
  - Extração em lotes por faixa de `id_consulta_documento` (2M/lote); varreduras completas para distinct.
- Comunicacao app <-> ETL: exclusivamente via `prescricao_dw` (fila de jobs + status + fatos; `FOR UPDATE SKIP LOCKED`); sem chamadas HTTP entre maquinas.
- Web: monolito (Next.js ou equivalente) em servidor interno Windows; graficos ECharts/Recharts/Nivo/Tremor; mapa GeoJSON local.
- Auth: Google OAuth com validacao server-side de dominio `@portalmedico.org.br`; perfil unico.
- Modelo: estrela — dim_data, dim_uf, dim_tipo_documento, dim_medico, dim_especialidade, dim_unidade, dim_farmaceutico, dim_farmacia + fato_documento_dia, fato_medico_dia, fato_dispensacao_dia, fato_auditoria_dia (anomalias) + tabelas operacionais (refresh_config, refresh_job).

## 🔑 Credenciais & Config (sem valores)
- `bd_cfm`: usuario `usr_select` (somente leitura) — configurado no MCP e em variaveis de ambiente do ETL (`BDCFM_*`).
- `prescricao_dw`: usuario `usr_prescricao_dw` (gravacao) — variaveis de ambiente `DW_*`; nunca versionar.
- Google OAuth: client id/secret a criar; escopos minimos (openid, email, profile).

## 📝 Histórico de Decisões
- 2026-09-21: 19 decisoes de Fase 0 registradas na secao 14 do plano (auth, ETL, dados, acesso, auditoria, exportacao, topologia, anomalias).
- 2026-09-21: Modelagem validada via MCP; correcoes de fonte (dispensacao/auditoria) aplicadas ao plano.
- 2026-09-21: Fonte B (trilha de acesso) suprimida da aba Auditoria; depois eliminada por completo (sem auditoria de uso do dashboard).
- 2026-09-21: Media de referencia das anomalias = todos os medicos.
- 2026-09-21: Catalogo de consultas (6.5), legenda de filtros e detalhamento da Auditoria (6.6).
