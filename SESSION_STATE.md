# SESSION STATE — PE Dashboard
_Atualizado em: 2026-09-23 09:05 BRT_

## 🎯 Objetivo Atual
Dashboard web restrito ao dominio `@portalmedico.org.br` (Google OAuth) sobre a base `bd_cfm`, com datamart `prescricao_dw`, ETL Python em Windows (maquina separada da aplicacao) e 3 visões: Documentos, Medicos, Auditoria.

## ✅ Última Sessão (Resumo)
- Grafico "Medicos com emissao por mes" na visao Medicos (2026-09-23): CPFs distintos com emissao por mes, obedecendo aos filtros de periodo/UF da pagina (total do periodo no rodape). Pre-agregacoes no ETL: `fato_medico_emissao_mes` (mes×UF + global) e `fato_medico_extremos_emissao` (sg_uf, id_pessoa, primeiro/ultimo dia) — que tambem acelerou a inatividade. Endpoint medicos caiu de 9,6s para ~0,3s em "Todos". Validado: 3 meses = 219.715 CPFs (bate com consulta direta), SP = 47.016.
- Documento `DEPLOY_PRODUCAO.md` criado (2026-09-23): guia para o arquiteto — topologia (web Node/Next.js no servidor, ETL Python em máquina separada, fila via DW), rede/firewall, OAuth com redirect URI, serviço Windows (PM2/NSSM), Task Scheduler, backup, monitoramento, rollback e checklist de go-live.
- Otimizacao de indices no DW (2026-09-23): criados `fato_documento_medico_dia(sg_uf,dia)` (inatividade com filtro de UF deixava de varrer 61M linhas por request — endpoint medicos com UF=SP caiu para ~2,3s) e `fato_medico_dia(sg_uf,dia)`. Documentacao atualizada.
- Inatividade por faixa passou de inscrição para **pessoa (CPF)** (2026-09-23): `dim_medico` ganhou `id_pessoa` (backfill via load_dims); consulta agrupa última emissão por pessoa. Totais: 279.738 pessoas com emissão (Todas) / 68.295 (SP). Visual: barras horizontais com cores de severidade e %.
- Novos médicos: acumulado do gráfico fechado com o KPI "Médicos ativos" (412.916) — `fato_medico_dia` ganhou linhas globais `sg_uf='--'` (distinct por dia sem agrupar por UF); endpoint usa `'--'` quando não há filtro de UF e as linhas da UF quando há. Com filtro UF o valor bate (SP: 140.808 = KPI).
- Visao Medicos redefinida (2026-09-23): "Medico ativo" deixa de ser `in_situacao='A'` e passa a ser CPF unico (`tb_pessoa.nu_cpf`) com aceite do termo (412.913; antes 394.898). Snapshot recriada sem `inscricoes_ativas` e com linha global `sg_uf='--'` (totais: 607.253 inscricoes / 412.913 ativos). KPIs "Inscrições ativas" e "Emissões no período" suprimidos (endpoint perde a consulta mais cara de distinct). Layout: 2 KPIs empilhados (span 3) + grafico de novos medicos (span 9).
- "Novos médicos por mês" trocou o proxy (2026-09-23): `tb_medico.dh_atualizacao` (invalidado por atualização em massa — pico de 278k em set/2026) → `tb_usuario.dh_aceite_termo` (aceite do termo = primeiro uso; 94% preenchido, janela completa 2021-10→hoje; join por id_pessoa, count DISTINCT por dia×UF). Fato recriada como `novos_aceite_termo` (45,4k linhas, 595,5k acumulado). Série agora coerente (~7–15k/mês, sazonalidade dez/jan).
- Visao Dispensacoes REMOVIDA (2026-09-23): aba, componente, endpoint `/api/dashboard/dispensacoes`, tema `theme-green`, `load_dispensacoes.py`, `fato_dispensacao_dia` (7,9 MB) e `dim_farmaceutico` (11 MB) excluidos. Pipeline ganha ~25s por carga; docs sincronizadas (PLANO 5.1/5.2/6.3/6.5, consultas 13-19, endpoints, criterios de sucesso; etl/web READMEs).
- Ajustes visao Documentos: rosca por tipo com todas as faixas >= 2% e "Outros" para o resto; tabela UF/Mil/% ao lado do mapa com scrollbar discreta; label do acumulado reposicionado; rodape do grafico de origem removido; paleta de alto contraste com tracos distintos no LinesChart; botao "Atualizar dados" so para admin; status de carga em PT-BR.
- Grafico "Origem de criacao por mes" na visao Documentos (2026-09-23): nova fato `fato_documento_origem_dia` (dia+UF+`ds_origem_criacao`) alimenta serie `serie_origem` do endpoint; componente LinesChart (multi-linha SVG com legenda) responde a periodo/UF. Confirmado `ds_origem_criacao` na origem (WEB, WEB-MOBILE, IOS, ANDROID; ~70% NULL historico — serie so comparavel de meados de 2025 em diante).
- Serie NAO_INFORMADO suprimida do grafico (filtro no endpoint; grupo mantido no datamart — tabela so tem 7,7 MB, sem ganho relevante).
- Documentacao atualizada (2026-09-22): `etl/README.md` criado (env vars, scripts, orquestracao, estrategia de extracao, modelo fisico, definicoes de negocio, ressalvas) e `web/README.md` reescrito (execucao, env, auth, endpoints, estrutura, deploy). Plano: fases 0-4 marcadas CONCLUIDAS e Fase 5 EM ANDAMENTO; secao 10 com status implementado. Docstrings em run_all.py/jobs.py.
- UI refinada: logo CFM, abas sem icones, donut com paleta de alto contraste e total na cor do tema, eixo duplo no grafico de emissoes, % no ranking de especialidades, mensagem "Processando…" animada nos filtros, subtitulos suprimidos.
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
- [ ] Fase 3 — Visões Documentos e Medicos consumindo as fatos do DW (Dispensacoes descontinuada 2026-09-23).
  - CONCLUIDA (2026-09-22): endpoints /api/dashboard/{documentos,medicos,auditoria} com SQL real; KPIs, series (SVG, eixo duplo), donut, mapa real do Brasil (GeoJSON local), rankings, tabelas; filtros por periodo (default "Todos")/UF/tipo.
  - Refinamentos 2026-09-22: filtro de assinatura removido e fato_documento_dia reestruturada (grão dia×UF×tipo; 536k→337k linhas, −37%); nao_assinados derivado; eyebrow "VISÃO"; logo CFM; "Processando…" animado; tabela UF→tipo removida (sem carga dedicada).
- [ ] Solicitar ao DBA indices em `tb_consulta_documento.dh_documento` e `tb_consulta.dt_consulta`.

## ⚠️ Pontos de Atencao
- `usr_select` em `bd_cfm` e somente leitura; nenhuma gravacao na origem.
- ETL sem os indices acima exigira varreduras pesadas (tb_consulta_documento: 43 GB).
- `tb_medico` sem data de cadastro: "novos medicos" usa `tb_usuario.dh_aceite_termo` (aceite do termo; decisao 2026-09-23). `dh_atualizacao` e invalidado por atualizacoes em massa.
- `tb_medico.ds_foto` (bytea, ~15 GB): nunca selecionar no ETL.
- Auditoria da origem fora do escopo do dashboard (decisao registrada).
- `usr_prescricao_dw` nao pode criar schemas em `prescricao_dw`; usar `prescricao`/`staging`.
- Nenhuma exportacao CSV/Excel no MVP.
- Nao ha auditoria do uso do dashboard (decisao 17).

## 🧱 Stack & Arquitetura
- Origem: PostgreSQL `bd_cfm` 13.8 (172.16.2.177:5432), leitura via `usr_select`.
- Datamart: PostgreSQL `prescricao_dw` 13.7 (172.16.7.112:5432), escrita via `usr_prescricao_dw`, schemas `prescricao`/`staging`.
- ETL: aplicacao Python (pasta `etl/`, psycopg2, sem pandas) em ambiente Windows (scheduler + worker com fila de jobs em `dashboard_refresh_job`), em MAQUINA SEPARADA da aplicacao web.
  - Scripts: `run_all.py` (pipeline), `load_dims.py`, `load_fatos.py <docs|origem|especialidade|unidade|medico|pacientes>`, `load_medicos.py`, `load_anomalias.py`, `setup.py`, `validate.py`.
  - Extração em lotes por faixa de `id_consulta_documento` (2M/lote); varreduras completas para distinct.
- Comunicacao app <-> ETL: exclusivamente via `prescricao_dw` (fila de jobs + status + fatos; `FOR UPDATE SKIP LOCKED`); sem chamadas HTTP entre maquinas.
- Web: monolito (Next.js ou equivalente) em servidor interno Windows; graficos ECharts/Recharts/Nivo/Tremor; mapa GeoJSON local.
- Auth: Google OAuth com validacao server-side de dominio `@portalmedico.org.br`; perfil unico.
- Modelo: estrela — dim_data, dim_uf, dim_tipo_documento, dim_medico, dim_especialidade, dim_unidade + fato_documento_dia, fato_documento_origem_dia, fato_documento_{especialidade,unidade,medico,paciente}_dia, fato_medico_dia, fato_medico_snapshot, fato_auditoria_dia (anomalias) + tabelas operacionais (refresh_config, refresh_job). Dispensacoes removidas (2026-09-23).

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
