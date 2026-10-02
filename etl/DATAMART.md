# Datamart `prescricao_dw` — dicionário de dados

> Documento de referência de **cada tabela do schema `prescricao`** (base `prescricao_dw`):
> grão, colunas, origem na `bd_cfm`, carga no ETL e quem consome no dashboard.
> DDL fonte de verdade: [`schema.sql`](schema.sql) + [`ddl_extra.sql`](ddl_extra.sql).
> Scripts e estratégia de extração: [`README.md`](README.md). Estado/pendências: `SESSION_STATE.md`.

## Convenções gerais

- **Star schema sem foreign keys** (decisão 2026-09-28): as relações existem pelas chaves e são garantidas pelo ETL (JOINs na origem), não por constraints.
- **UF**: `BR` e UF nula viram `--` (linhas sem UF identificada). Totais globais usam `--` em `fato_medico_*` e `'**'` nas snapshots de medicamentos.
- **Vazios**: campos de texto vazios/NULL viram `NAO_INFORMADO` (versão do app, origem de criação) ou o sentinela documentado na tabela.
- **Datas**: fatos diárias usam `dia DATE`; fatos mensais usam `mes CHAR(7)` (`YYYY-MM`). `dh_documento` é `timestamp` sem fuso.
- **Carga idempotente**: cada tabela é reconstruída (TRUNCATE + INSERT ... SELECT, via staging) a partir de uma faixa de ids da origem; o `run_all` encadeia tudo.
- **Staging**: tabelas `stg_*` são **transitórias** (truncadas ao fim de cada rebuild). Regra: staging de fato de **soma** (vários lotes somam na mesma chave) fica **sem PK**; staging de **grão distinto** (DISTINCT com dedup entre lotes) tem **PK**.
- **Modo "Todos"** das telas é servido por snapshots `snap_*` (all-time), não por varredura das fatos.
- **Volume de referência (2026-10-02)**: `fato_documento_emissao` 62,7M linhas/15 GB; `fato_documento_medico_tipo_dia` 32M/7,9 GB; `fato_documento_medico_paciente_dia` 42,9M/4,8 GB; `fato_documento_unidade_paciente_dia` 42,6M/4,5 GB; `fato_receita_medicamento_mes` 10,2M/3,1 GB; `fato_documento_especialidade_dia` 20,2M/4,3 GB.

## Dimensões

| Tabela | Colunas | Descrição | Origem / carga |
|---|---|---|---|
| `dim_data` | `data` (PK), `ano`, `mes`, `ano_mes` | Calendário diário. | Gerada em `load_dims.py` (2021-11-01 → hoje), upsert. Sem uso direto na API atual. |
| `dim_uf` | `sg_uf` (PK), `ds_uf`, `in_regiao`, `nu_populacao` | UFs com nome, região e população (para densidade médica por 100 mil hab.). | `td_uf` (`load_dims.py`). Consumida pelo card "Médicos (CPF) por UF" (coluna por 100k hab). |
| `dim_tipo_documento` | `id_tipo_documento` (PK), `nm_documento`, `in_ativo` | Tipos de documento (receita, atestado etc.). | `td_tipo_documento` (`load_dims.py`). Consumida por "Distribuição por tipo", drill AN1 e rosca do drill AN4. |
| `dim_medico` | `id_medico` (PK), `nu_crm`, `sg_uf`, `in_situacao`, `in_tipo_inscricao`, `id_pessoa`, `nm_medico` | Inscrições CRM/UF + pessoa (CPF) para distincts. | `tb_medico` LEFT JOIN `tb_pessoa` (`load_dims.py`; `ds_foto` nunca é lida). Usada nos rankings/drills (AN1–AN4) e nas derivações de médicos. |
| `dim_especialidade` | `id_medico_especialidade` (PK), `id_medico`, `ds_especialidade`, `nu_registro` | Especialidades por médico. | `tb_medico_especialidade` (`load_dims.py`). Consumida pelo ranking "Documentos por especialidade" e pelo drill AN1. |
| `dim_unidade` | `id_unidade_atendimento` (PK), `sg_uf`, `co_cnes`, `nm_unidade` | Unidades de atendimento (CNES + nome). | `tb_unidade_atendimento` LEFT JOIN `tb_pessoa` (nome via `id_pessoa = id_unidade_atendimento`). Consumida pela AN4 (instituição) e drills. |

## Fatos

### Documentos (visão Documentos)

| Tabela | Grão / PK | Colunas | Origem / carga | Consumidor |
|---|---|---|---|---|
| `fato_documento_dia` | dia × UF × tipo (`dia, sg_uf, id_tipo_documento`) | `documentos`, `assinados`, `cancelados` | `tb_consulta_documento` + joins de UF (`load_fatos docs`, lotes 2M por `id_consulta_documento`) | KPIs, série mensal, por UF e por tipo da visão Documentos |
| `fato_documento_origem_dia` | dia × UF × origem (`dia, sg_uf, ds_origem_criacao`) | `documentos` | `ds_origem_criacao` (vazio → `NAO_INFORMADO`; `load_fatos origem`) | Gráficos "Emissões/Participação por plataforma" |
| `fato_documento_versao_dia` | dia × UF × versão (`dia, sg_uf, ds_versao_sistema`) | `documentos` | `ds_versao_sistema` (vazio → `NAO_INFORMADO`; `load_fatos versao`) | Tabela "Emissões por versão do app" |
| `fato_receita_medicamento_mes` | mês × UF × tipo × texto (`mes, sg_uf, id_tipo_documento, medicamento`) | `itens` | `tb_receita` + `tb_medicamento` (`load_fatos receitas`, lotes 2M por `id_receita`; texto normalizado: `upper`, espaços colapsados, 255 chars) | Ranking "Medicamentos prescritos" (janelas; com categoria via `de_para` + `categoria_medicamento`) e `snap_medicamento_top` |
| `fato_documento_especialidade_dia` | dia × UF × especialidade (`dia, sg_uf, id_medico_especialidade`) | `documentos` | `tb_consulta_documento` + `tb_medico_especialidade` (somente vínculo ativo; `load_fatos especialidade`) | Ranking "Documentos por especialidade" (janelas) e `snap_especialidade` |

### Documentos por médico / paciente / unidade (Auditoria e Médicos)

| Tabela | Grão / PK | Colunas | Origem / carga | Consumidor |
|---|---|---|---|---|
| `fato_documento_medico_dia` | dia × UF × médico (`dia, sg_uf, id_medico`) | `documentos` | `tb_consulta_documento` + `rl_medico_unidade_atendimento` (`load_fatos medico`) | Referência de "último dia" na visão Médicos, insumo das derivações de médicos e **emitentes por UF nas janelas** do card "Médicos (CPF) por UF" |
| `fato_documento_medico_tipo_dia` | dia × UF × médico × tipo (`dia, sg_uf, id_medico, id_tipo_documento`) | `documentos` | idem + `id_tipo_documento` (`load_fatos medico_tipo`) | Ranking AN1 (janelas) e drill por tipo; `snap_medico_tipo` |
| `fato_documento_medico_paciente_dia` | dia × UF × médico × paciente (`dia, sg_uf, id_medico, id_paciente`; DISTINCT) | — | `rl_medico_paciente` (`load_fatos medico_pacientes`) | Ranking AN2 (`count(DISTINCT id_paciente)`), drill de pacientes, pacientes do dia da AN3; `snap_medico_paciente` |
| `fato_documento_unidade_paciente_dia` | dia × UF × unidade × paciente (`dia, sg_uf, id_unidade_atendimento, id_paciente`; DISTINCT, **somente assinados**) | — | `rl_medico_paciente` (`load_fatos unidade_pacientes`) | Ranking AN4, drill da instituição; `snap_instituicao` |
| `fato_medico_unidade` | médico × unidade (`id_medico, id_unidade_atendimento`) | `in_ativo`, `dt_cadastro` | `rl_medico_unidade_atendimento` (`load_fatos medico_unidade`) | Coluna "Médicos" (vínculos ativos) da AN4; `snap_instituicao` |
| `fato_medico_maior_dia` | médico × UF (`id_medico, sg_uf`) | `dia`, `documentos`, `pacientes` | Derivada **dentro do DW** (`load_maior_dia.py`): melhor dia em `fato_documento_emissao` (assinados) + pacientes do dia | Ranking AN3 no modo "Todos" |
| `fato_documento_emissao` | `id_consulta_documento` (PK) | `dia`, `dh_documento`, `id_medico`, `sg_uf`, `id_tipo_documento`, `id_unidade_atendimento`, `in_assinado`, `in_cancelado`, `ds_qrcode` | `tb_consulta_documento` (`load_documentos.py`, lotes de 2M ids, incremental pelos últimos 5M) | Janelas/drill da AN3, rosca do drill AN4, `load_maior_dia` — **sem paciente/conteúdo** |

### Médicos (visão Médicos)

| Tabela | Grão / PK | Colunas | Origem / carga | Consumidor |
|---|---|---|---|---|
| `fato_medico_dia` | dia × UF (`dia, sg_uf`; inclui `--` global) | `novos_aceite_termo`, `medicos_com_emissao` | `tb_usuario.dh_aceite_termo` (novos) + `fato_documento_medico_dia` (emissão) — `load_medicos.py` | "Novos médicos por mês" |
| `fato_medico_snapshot` | UF (`sg_uf`; inclui `--` global) | `inscricoes_cadastradas`, `medicos_ativos`, `atualizado_em` | `tb_medico` + `tb_usuario` + `tb_pessoa` (`load_medicos.py`) | KPIs de inscrições/ativos e tabela por UF |
| `fato_medico_emissao_mes` | mês × UF (`mes, sg_uf`; inclui `--` global) | `cpfs_distintos` | Derivada no DW de `fato_documento_medico_dia` + `dim_medico` | "Médicos com emissão por mês" |
| `fato_medico_extremos_emissao` | UF × pessoa (`sg_uf, id_pessoa`) | `primeiro_dia`, `ultimo_dia` | Derivada no DW (min/max de emissão por pessoa) | Inatividade (30/60/90/120 dias), total de emissores 30d e **emitentes por UF all-time** do card "Médicos (CPF) por UF" (modo "Todos") |

## Snapshots all-time (modo "Todos")

| Tabela | Colunas | Conteúdo | Consumidor |
|---|---|---|---|
| `snap_medico_tipo` | `id_medico, sg_uf, id_tipo_documento, documentos` | Total por médico/UF/tipo | Ranking AN1 no modo "Todos" |
| `snap_medico_paciente` | `id_medico, sg_uf, pacientes` | Pacientes distintos (UFs + global `'**'`) | Ranking AN2 no modo "Todos" |
| `snap_especialidade` | `sg_uf, id_medico_especialidade, documentos` | Documentos por UF×especialidade | "Documentos por especialidade" no modo "Todos" |
| `snap_especialidade_medicos` | `sg_uf, ds_especialidade, medicos, documentos` | Efetivo médico (dedup CPF) e documentos por UF×especialidade (linha global `'**'`) | Ranking "Médicos por especialidade" (visão Médicos) no modo "Todos" |
| `snap_instituicao` | `chave, instituicao, cnes, uf, unidades, medicos, pacientes` | Instituições (CNES ou `UNIDADE:<id>`) com vínculos ativos | Ranking AN4 no modo "Todos" |
| `snap_medicamento_top` | `sg_uf, id_tipo_documento, posicao, medicamento, itens` | Top 100 por combinação de filtros (`'**'` = todas as UFs; `0` = todos os tipos) | Ranking de medicamentos no modo "Todos" |
| `snap_numeracao_anvisa_medico` | `sg_uf, id_medico, id_tipo_documento, disponiveis, utilizados` | Pool de numerações ANVISA reservadas por médico×tipo (estado atual; sem histórico) | Visão **RDC1000**: utilização por tipo/UF e cobertura (gap de emitentes sem numeração) |

Construídas por `load_snapshots.py` (TRUNCATE + INSERT), dentro do `run_all`.

## De-para e categorias de medicamentos

| Tabela | Colunas | Descrição |
|---|---|---|
| `de_para_medicamento` | `medicamento` (PK), `principio_ativo` | Texto informado pelo médico → princípio ativo canônico; seed curado `seed_de_para_medicamento.sql` (**892 mapeamentos / 268 princípios**, ~57% dos itens), aplicado pelo `setup.py`. Usado pelo toggle "agrupar por princípio ativo". Política conservadora: marca duvidosa fica fora. |
| `categoria_medicamento` | `principio_ativo` (PK), `categoria` | Categoria terapêutica ampla (**268 princípios**, 27 categorias: Analgésico, Ansiolítico/hipnótico, Antialérgico, Antibiótico, Anticonvulsivante/neuromodulador, Antidepressivo, Antidiabético/obesidade, Antiemético/antivertiginoso, Antifúngico/antiviral, Antigotoso, Anti-inflamatório/corticoide, Antiparasitário, Antiparkinsoniano, Antipsicótico, Canabinoide, Cardiovascular, Cognição/demência, Dermatológico, Estabilizador de humor, Gastrointestinal, Hormônio/reposição, Outros, Psicoestimulante/TDAH, Relaxante muscular, Respiratório, Urológico, Vitamina/suplemento); seed `seed_categoria_medicamento.sql` (aplicado pelo `setup.py`). Exibida como **coluna** no ranking "Medicamentos prescritos" (linhas sem categoria aparecem como "—"). |
| `medicamento_anvisa` | `tp_produto`, `nm_produto`, `dt_final_processo`, `tp_categoria_regulatoria`, `nu_reg_produto`, `dt_vencimento_reg`, `nu_processo`, `tp_classe_terapeutica`, `nm_empresa_reg`, `in_situacao_reg`, `ds_principio_ativo`, `carregado_em` | Registro de medicamentos da **ANVISA (dados abertos)**: **43.593 linhas** (8.201 genéricos; 17.331 registros ativos), carregado por `load_anvisa.py` (manual; baixa o CSV oficial ou aceita caminho local). Substitui a tabela da origem `tb_medicamentos_anvisa`, que está com **linhas desalinhadas** (import quebrado no `bd_cfm`) e não deve ser usada. |

## Tabelas operacionais

| Tabela | Colunas | Descrição |
|---|---|---|
| `dashboard_refresh_config` | `id` (=1), `horario_diario`, `timezone`, `ativo`, `intervalo_verificacao_minutos`, `ultima_execucao_programada_em`, `atualizado_por`, `atualizado_em` | Configuração do job agendado (default 02:00 America/Sao_Paulo). Lida pelo scheduler (`jobs.py`). |
| `dashboard_refresh_job` | `id_job`, `tipo` (`scheduled`/`manual`), `status` (`queued`/`running`/`success`/`failed`), `solicitado_por`, `agendado_para`, `iniciado_em`, `finalizado_em`, `mensagem`, `lock_key`, timestamps | Fila de jobs (`FOR UPDATE SKIP LOCKED`) entre web e ETL; alimenta `/api/health` e o botão "Atualizar dados". |
| `dashboard_access_log` | `id_access_log`, `nm_email`, `tx_ip`, `in_sucesso`, `dh_evento` | Registro de acesso (login); visível/limpável em `/api/admin/logs`. |

## Staging (transitório)

`stg_documento_dia`, `stg_documento_origem_dia`, `stg_documento_versao_dia`, `stg_documento_especialidade_dia`, `stg_documento_medico_dia`, `stg_documento_medico_tipo_dia`, `stg_documento_medico_paciente_dia`, `stg_documento_unidade_paciente_dia`, `stg_medico_unidade`, `stg_medico_maior_dia`, `stg_receita_medicamento_mes`.

Sem PK: `stg_documento_*` de **soma** (`dia`, `origem`, `versao`, `especialidade`, `medico`, `medico_tipo`, `receita_medicamento_mes`). Com PK: os de **grão distinto** (`medico_paciente`, `unidade_paciente`, `medico_unidade`) e `stg_medico_maior_dia`.

## Índices

As fatos têm **pkey no grão** (usada também como caminho de consulta: filtros por `dia`/`mes` primeiro) e índices secundários nos padrões reais das telas — lista completa no `etl/README.md` ("Modelo físico"). Destaques:

- `fato_documento_dia (dia) INCLUDE (sg_uf, id_tipo_documento, documentos, assinados, cancelados)` — KPIs/série/UF/tipo em Index Only Scan (2026-10-02).
- `fato_documento_emissao (dia, in_assinado) INCLUDE (id_medico, sg_uf)` — janelas da AN3; e `(id_unidade_atendimento, dia) INCLUDE (id_tipo_documento) WHERE in_assinado='S'` — rosca do drill AN4.
- `fato_documento_medico_tipo_dia (id_tipo_documento, sg_uf, dia)` — AN1 com filtro de tipo.
- Índices redundantes com a pkey foram removidos em 2026-10-02 (≈2,1 GB); os `DROP INDEX IF EXISTS` no `ddl_extra.sql` convergem bases antigas.

## Removidas (2026-10-02)

| Tabela | Situação |
|---|---|
| `fato_documento_paciente_dia` | Substituída por `fato_documento_medico_paciente_dia`; `DROP` aplicado pelo `setup.py`. |
| `fato_documento_unidade_dia` | Write-only (nenhuma tela a consumia); removida do pipeline e dropada pelo `setup.py`. |
| `fato_auditoria_dia` | Flag diária AN1 sem consumidor na UI; removida do pipeline e dropada pelo `setup.py`. |

> Não dropar antes do deploy: o código antigo da máquina do ETL ainda escreve nessas tabelas.
