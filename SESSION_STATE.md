# SESSION STATE — PE Dashboard
_Atualizado em: 2026-09-21 15:30 BRT_

## 🎯 Objetivo Atual
Dashboard web restrito ao dominio `@portalmedico.org.br` (Google OAuth) sobre a base `bd_cfm`, com datamart `prescricao_dw`, ETL Python em Windows e 4 visões: Documentos, Medicos, Dispensacoes, Auditoria.

## ✅ Última Sessão (Resumo)
- Validada a modelagem multidimensional proposta contra a base `bd_cfm` via MCP PostgreSQL (`usr_select`, somente leitura).
- Corrigida a fonte de dispensacoes: evento temporal em `tb_historico_dispensacao` (status D), pois `tb_dispensacao.dh_documento` e ~99,97% NULL.
- Auditoria redefinida: nao usar `tl_prescricao_auditoria*` (sem SELECT na atual; antiga inviavel por timeout); visao alimentada por anomalias das fatos + trilha de acesso do dashboard.
- Testado acesso de gravacao na base analitica `prescricao_dw` (172.16.7.112:5432, PG 13.7) com `usr_prescricao_dw`: OK em `prescricao`, `staging` e `public`; sem CREATE SCHEMA; base vazia.
- Fase 0 concluida: todas as 16 decisoes registradas no plano (auth Google, ETL Python/Windows, horario 02:00 BRT configurado por mrichard@portalmedico.org.br, janela desde 2021-11, servidor interno, perfil unico, sem exportacao, auditoria somente agregada).
- Documentos atualizados: `PLANO_DESENVOLVIMENTO_DASHBOARD.md` (secoes 3-15) e `RESUMO_BASE_bd_cfm.md` (secao 15 + correcoes).

## 🔧 Em Progresso / Próximos Passos
- [ ] Fase 1 — Fundacao: projeto web, Google OAuth, validacao de dominio, shell com 4 visões.
- [ ] Fase 2 — Camada de dados: fatos/dimensoes em `prescricao_dw`, carga historica (2021-11) e incremental, tabelas de jobs.
- [ ] Fase 3 — Visões Documentos, Medicos e Dispensacoes.
- [ ] Fase 4 — Visao Auditoria (anomalias agregadas + logs de acesso).
- [ ] Fase 5 — Operacao: agendamento, botao de atualizacao, monitoramento, backup.
- [ ] Solicitar ao DBA indices em `tb_consulta_documento.dh_documento`, `tb_consulta.dt_consulta`, `tb_historico_dispensacao.dh_historico_dispensacao` e FKs de dispensacao.

## ⚠️ Pontos de Atencao
- `usr_select` em `bd_cfm` e somente leitura; nenhuma gravacao na origem.
- ETL sem os indices acima exigira varreduras pesadas (tb_consulta_documento: 43 GB).
- `tb_medico` sem data de cadastro: "novos medicos" usa `dh_atualizacao` como proxy (decisao registrada).
- `tb_medico.ds_foto` (bytea, ~15 GB): nunca selecionar no ETL.
- Auditoria da origem fora do escopo do dashboard (decisao registrada).
- `usr_prescricao_dw` nao pode criar schemas em `prescricao_dw`; usar `prescricao`/`staging`.
- Nenhuma exportacao CSV/Excel no MVP.

## 🧱 Stack & Arquitetura
- Origem: PostgreSQL `bd_cfm` 13.8 (172.16.2.177:5432), leitura via `usr_select`.
- Datamart: PostgreSQL `prescricao_dw` 13.7 (172.16.7.112:5432), escrita via `usr_prescricao_dw`, schemas `prescricao`/`staging`.
- ETL: aplicacao Python em ambiente Windows (scheduler + worker com fila de jobs em `dashboard_refresh_job`).
- Web: monolito (Next.js ou equivalente) em servidor interno Windows; graficos ECharts/Recharts/Nivo/Tremor; mapa GeoJSON local.
- Auth: Google OAuth com validacao server-side de dominio `@portalmedico.org.br`; perfil unico.
- Modelo: estrela — dim_data, dim_uf, dim_tipo_documento, dim_medico, dim_especialidade, dim_unidade, dim_farmaceutico, dim_farmacia + fato_documento_dia, fato_medico_dia, fato_dispensacao_dia, fato_auditoria_dia (anomalias) + tabelas operacionais (refresh_config, refresh_job, access_log).

## 🔑 Credenciais & Config (sem valores)
- `bd_cfm`: usuario `usr_select` (somente leitura) — configurado no MCP.
- `prescricao_dw`: usuario `usr_prescricao_dw` (gravacao) — credencial fornecida em chat; manter em variaveis de ambiente/cofre, nunca versionar.
- Google OAuth: client id/secret a criar; escopos minimos (openid, email, profile).

## 📝 Histórico de Decisões
- 2026-09-21: 16 decisoes de Fase 0 registradas na secao 14 do plano (auth, ETL, dados, acesso, auditoria, exportacao).
- 2026-09-21: Modelagem validada via MCP; correcoes de fonte (dispensacao/auditoria) aplicadas ao plano.
