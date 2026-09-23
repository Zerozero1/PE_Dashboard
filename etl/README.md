# ETL — PE Dashboard

Aplicação Python que carrega o datamart `prescricao_dw` a partir da origem `bd_cfm` (somente leitura).

## Pré-requisitos

- Python 3.10+ com `psycopg2` e `psycopg2.extras` (`pip install psycopg2-binary`)
- Acesso de rede às duas bases (origem e datamart)
- Variáveis de ambiente com as credenciais (nunca versionadas)

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `BDCFM_HOST` / `BDCFM_PORT` / `BDCFM_DB` / `BDCFM_USER` / `BDCFM_PASSWORD` | Origem `bd_cfm` (usuário somente leitura `usr_select`) |
| `DW_HOST` / `DW_PORT` / `DW_DB` / `DW_USER` / `DW_PASSWORD` | Datamart `prescricao_dw` (usuário com escrita `usr_prescricao_dw`) |
| `DW_SCHEMA` | Schema do DW (padrão `prescricao`) |
| `ETL_BATCH_SIZE` | Tamanho do lote por faixa de `id_consulta_documento` (padrão `2000000`) |

Exemplo (PowerShell):

```powershell
$env:BDCFM_HOST='172.16.2.177'; $env:BDCFM_DB='bd_cfm'; $env:BDCFM_USER='usr_select'; $env:BDCFM_PASSWORD='...'
$env:DW_HOST='172.16.7.112'; $env:DW_DB='prescricao_dw'; $env:DW_USER='usr_prescricao_dw'; $env:DW_PASSWORD='...'
```

## Scripts

| Script | Função |
|---|---|
| `setup.py` | Aplica `schema.sql` + `ddl_extra.sql` (idempotente). Criar/atualizar estrutura no DW. |
| `load_dims.py` | Carrega dimensões: dim_data, dim_uf, dim_tipo_documento, dim_medico, dim_especialidade, dim_unidade. |
| `load_fatos.py <modo>` | Fatos de documentos, em modos: `docs`, `origem`, `especialidade`, `unidade`, `medico`, `pacientes`. |
| `load_medicos.py` | `fato_medico_snapshot` (inscrições CRM/UF e CPFs únicos com aceite, por UF + total global `--`) + `fato_medico_dia.novos_aceite_termo` + `medicos_com_emissao` (derivado do DW). |
| `load_anomalias.py` | `fato_auditoria_dia`: anomalias AN1–AN4 calculadas no DW (média de referência = todos os médicos). |
| `run_all.py` | Pipeline completo e idempotente (dims → fatos → anomalias). ~30–40 min. |
| `jobs.py` | Orquestração via fila `dashboard_refresh_job` (ver abaixo). |
| `validate.py` / `status_dw.py` / `audit_counts.py` / `list_indexes.py` | Conferências: totais, cobertura, contagens da origem vs DW, índices. |
| `audit_especialidades.py` | Diagnóstico da distribuição de especialidades na origem. |
| `test_jobs.py` | Teste da mecânica claim/finish do worker (sem executar o pipeline). |
| `migrate_cleanup.py` | Remove colunas sem uso (migração pontual já aplicada). |

## Orquestração (`jobs.py`)

```text
python jobs.py worker               # consome jobs queued (FOR UPDATE SKIP LOCKED)
python jobs.py scheduler            # cria jobs scheduled conforme dashboard_refresh_config (02:00 BRT)
python jobs.py enqueue-manual <email>  # cria job manual (botão "Atualizar dados" da aplicação)
```

- Um único job `running` por vez; jobs `running` órfãos são recuperados no start do worker.
- Falha não apaga a última versão válida (cargas são idempotentes via upsert).
- A aplicação web e o worker se comunicam exclusivamente pelo DW (fila + status).

## Estratégia de extração

- **Lotes por faixa de `id_consulta_documento`** (2M ids por lote): a origem não tem índice em `dh_documento`; filtros temporais diretos varrem 43 GB e estouram qualquer timeout. A PK permite varrer por faixas com pausa/retomada.
- **Staging + rebuild**: cada lote agrega no SQL da origem e grava em `stg_documento_*`; ao final, a fato é reconstruída com `SUM ... GROUP BY` (rebuild_fact). Necessário porque uma chave (dia×UF×tipo) aparece em vários lotes — upsert direto por lote sobrescrevia e perdia dados (~970k docs; corrigido em 2026-09-22).
- **Varreduras completas** (`single_pass`, sem lote) apenas para distinct: pacientes por dia×UF (~55 s), com `statement_timeout=0` e `work_mem=256MB`.
- **Especialidade**: deriva do cadastro do médico que assina (`tb_medico_especialidade` via `rl_medico_unidade_atendimento.id_medico`, `in_ativo='S'`) — não de `rl_med_especialidade_consulta` (vínculo da consulta, com outliers de até 104 especialidades).

## Modelo físico (schema `prescricao` do DW)

Dimensões: `dim_data`, `dim_uf`, `dim_tipo_documento`, `dim_medico`, `dim_especialidade`, `dim_unidade`.

Fatos:
- `fato_documento_dia` (dia, sg_uf, id_tipo_documento, documentos, assinados, cancelados)
- `fato_documento_origem_dia` (dia, sg_uf, ds_origem_criacao, documentos) — origem de criação: WEB, WEB-MOBILE, IOS, ANDROID ou NAO_INFORMADO; campo majoritariamente NULL até meados de 2025 (~70% do total), preenchido sistematicamente só nos últimos meses
- `fato_documento_especialidade_dia` (dia, sg_uf, id_medico_especialidade, documentos)
- `fato_documento_unidade_dia` (dia, sg_uf, id_unidade_atendimento, documentos)
- `fato_documento_medico_dia` (dia, sg_uf, id_medico, documentos)
- `fato_documento_paciente_dia` (dia, sg_uf, pacientes_distintos)
- `fato_medico_dia` (dia, sg_uf, novos_aceite_termo, medicos_com_emissao; inclui linhas `sg_uf='--'` com distinct global por dia)
- `fato_medico_snapshot` (sg_uf, inscricoes_cadastradas, medicos_ativos, atualizado_em; inclui `sg_uf='--'` com totais globais)
- `fato_auditoria_dia` (dia, tipo_anomalia, dimensao_afetada, valor_observado, valor_esperado, desvio, severidade)

Staging: `stg_documento_dia`, `stg_documento_origem_dia`, `stg_documento_especialidade_dia`, `stg_documento_unidade_dia`, `stg_documento_medico_dia`.

Operacionais: `dashboard_refresh_config`, `dashboard_refresh_job`.

Índices secundários: `fato_documento_dia(sg_uf,dia)`, `fato_documento_origem_dia(sg_uf,dia)`, `fato_documento_medico_dia(id_medico,dia)`, `fato_documento_especialidade_dia(id_medico_especialidade,dia)`, `fato_documento_unidade_dia(id_unidade_atendimento,dia)`, `dim_medico(sg_uf)`, `dashboard_refresh_job(status)`.

## Definições de negócio aplicadas

| Métrica | Regra |
|---|---|
| UF dos documentos | UF da unidade de atendimento (`tb_unidade_atendimento.sg_uf`); NULL e `BR` → `--` |
| Assinados / cancelados | colunas agregadas: `assinados` = `in_assinado='S'`, `cancelados` = `in_cancelado='S'`; `nao_assinados` = `documentos - assinados` (sem filtro por assinatura — grão sem `in_assinado`) |
| Origem de criação | `ds_origem_criacao` (NULL ou vazio → `NAO_INFORMADO`); histórica incompleta (ver ressalvas) |
| Médico ativo | CPF único (`tb_pessoa.nu_cpf`) de médicos com aceite do termo (`tb_usuario.dh_aceite_termo`); sem relação com `in_situacao` (definição alterada 2026-09-23) |
| Inscrições cadastradas | linhas de `tb_medico` (1 por CRM/UF) |
| Inatividade | última emissão por **pessoa** (`dim_medico.id_pessoa`, = CPF), em faixas de 30/60/90/120 dias sem emissão; só quem emitiu entra |
| Novos médicos | `tb_usuario.dh_aceite_termo` (aceite do termo = primeiro uso; ~94% preenchido, janela completa do sistema); join `tb_usuario.id_pessoa = tb_medico.id_pessoa`; `count(DISTINCT id_pessoa)` por dia×UF + linha global `'--'` (distinct entre todas as UFs — pessoa multi-UF conta uma vez no total) |
| Anomalias AN1–AN4 | observado vs média móvel 30 dias de **todos os médicos**; severidade 2x/3x/5x |

## Ressalvas conhecidas

- A origem está em produção ativa: contagens podem variar entre varreduras; a carga diária converge.
- `ds_origem_criacao` só é preenchido sistematicamente nos últimos meses — ~70% dos documentos históricos ficam como `NAO_INFORMADO`; a série de dispositivos só é comparável a partir de ~meados de 2025.
- `tb_medico.ds_foto` (bytea, ~15 GB) nunca é lida.
- Carga incremental por watermark ainda não implementada — o job roda o `run_all` completo (~30–40 min às 02:00).
- Índices na origem ainda pendentes com o DBA (sem eles, a varredura em lotes é o caminho).
