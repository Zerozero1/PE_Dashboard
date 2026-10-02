# ETL — PE Dashboard

**Versão do produto: v1.4** (2026-10-02)

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
| `setup.py` | Aplica `schema.sql` + `ddl_extra.sql` + os seeds `seed_de_para_medicamento.sql` e `seed_categoria_medicamento.sql` (idempotente). Criar/atualizar estrutura no DW. |
| `load_dims.py` | Carrega dimensões: dim_data, dim_uf, dim_tipo_documento, dim_medico, dim_especialidade, dim_unidade. |
| `load_fatos.py <modo>` | Fatos de documentos, em modos: `docs`, `origem`, `versao`, `receitas`, `especialidade`, `medico`, `medico_tipo`, `medico_pacientes`, `unidade_pacientes`, `medico_unidade`. |
| `load_medicos.py` | `fato_medico_snapshot` (inscrições CRM/UF e CPFs únicos com aceite, por UF + total global `--`) + `fato_medico_dia.novos_aceite_termo` + `medicos_com_emissao` (derivado do DW). |
| `load_maior_dia.py` | Constrói `fato_medico_maior_dia` (melhor dia por médico/UF em documentos **assinados**, com pacientes distintos do dia) a partir de `fato_documento_emissao` — alimenta a AN3 diária. |
| `load_documentos.py` | Carrega `fato_documento_emissao` (um registro por documento assinado ou não: data/hora, médico, UF, tipo, unidade, situação e `ds_qrcode`) — alimenta a lista de documentos do drill da AN3. Carga cheia na primeira execução e incremental depois (revisa os últimos 5M ids); extração em lotes de 2M ids com stream ordenado e retry por lote. |
| `load_snapshots.py` | Reconstrói os snapshots all-time (`snap_medico_tipo`, `snap_medico_paciente`, `snap_instituicao`, `snap_especialidade`, `snap_especialidade_medicos`) usados no modo "Todos" dos rankings AN1/AN2/AN4, do card "Documentos por especialidade" e do ranking "Médicos por especialidade" (evita varreduras de 20-60M linhas por consulta) e o `snap_medicamento_top` (top 100 do ranking de medicamentos por UF×tipo). |
| `load_anvisa.py` | Carrega o registro de medicamentos da ANVISA (dados abertos; ~43,6 mil linhas) em `medicamento_anvisa` — **manual** (não está no `run_all`; baixa o CSV oficial ou aceita um caminho local). A tabela da origem `tb_medicamentos_anvisa` está com linhas desalinhadas e **não deve ser usada**. |
| `load_numeracao.py` | Carrega o pool de numerações ANVISA reservadas (origem `tb_numeracao_anvisa`) agregado por médico×tipo (disponíveis `D` / utilizadas `U`) em `snap_numeracao_anvisa_medico` — alimenta a visão **RDC1000** (utilização e cobertura). |
| `run_all.py` | Pipeline completo e idempotente (dims → fatos → snapshots → numeração ANVISA → médicos → maior dia → documentos emitidos). |
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
- **AN3 (maior dia)**: a `fato_medico_maior_dia` é derivada dentro do próprio DW, sem tocar a origem: melhor dia por médico/UF em **documentos assinados** (`fato_documento_emissao`) e a contagem de pacientes distintos do mesmo dia (`fato_documento_medico_paciente_dia`). Documentos não assinados são desprezados na AN3. A janela de 5 min foi descontinuada e suas tabelas/scripts removidos em 2026-09-30 (`ddl_extra.sql` traz os `DROP` de limpeza).
- O drill da AN3 diária lê `fato_documento_emissao` (mix por tipo e lista de documentos assinados do dia, identificados por `ds_qrcode`).
- **Documentos emitidos (`load_documentos.py`)**: extração por id_consulta_documento em modo streaming **ordenado por id** (cursor nomeado, blocos de 50 mil com upsert); a primeira carga percorre toda a tabela e as seguintes revisam os últimos 5M ids (cobre mudanças de assinatura/cancelamento recentes). Sem paciente e sem conteúdo; `ds_qrcode` identifica o documento no drill.
- **Staging + rebuild**: cada lote agrega no SQL da origem e grava em `stg_documento_*`; ao final, a fato é reconstruída com `SUM ... GROUP BY` (rebuild_fact). Necessário porque uma chave (dia×UF×tipo) aparece em vários lotes — upsert direto por lote sobrescrevia e perdia dados (~970k docs; corrigido em 2026-09-22). **O staging é truncado ao fim de cada rebuild** (2026-10-01) para não reter ~12 GB de dados duplicados. Staging de fatos de **soma** é intencionalmente **sem chave/unique**: as duplicatas de chave entre lotes se acumulam e o `SUM` do rebuild as consolida; uma PK descartaria os lotes seguintes em silêncio (`ON CONFLICT DO NOTHING`) — bug corrigido em 2026-10-01 nas fatos de versão do app e receita-medicamento (o staging de grão distinto, como `stg_documento_medico_paciente_dia`, mantém PK para dedup).
- **Snapshots "Todos" (`load_snapshots.py`)**: `snap_medico_tipo`, `snap_medico_paciente`, `snap_instituicao`, `snap_especialidade` e `snap_especialidade_medicos` agregam all-time os fatos diários e sustentam os rankings AN1/AN2/AN4, o card "Documentos por especialidade" e o ranking "Médicos por especialidade" quando nenhuma janela de datas é enviada (a UI omite `de`/`ate` com o período "Todos"). Medições: AN2 >120 s → 48 ms; AN1 13,4 s → 1,5 s; AN4 52 s → 0,04 ms; especialidade ~2 s → 42 ms. O `snap_medicamento_top` guarda o **top 100 por combinação** (global/UF/tipo/UF+tipo; sentinelas `'**'` e `0`) — o modo "Todos" do ranking de medicamentos responde por posição em ~1 ms, contra ~15 s da varredura direta dos 60 meses. Janelas de 7/30/60/90/120 dias continuam calculadas na hora sobre os fatos diários (ex.: AN2 em 120 dias ≈ 7,3 s; medicamentos em 30 dias ≈ 1,1 s, com cast `::char(7)` no predicado de `mes` para usar a PK).
- **`medico_pacientes`** (grão médico×paciente×dia, para `count(DISTINCT id_paciente)`): lote por faixa de id com `SELECT DISTINCT` na origem; grava em `stg_documento_medico_paciente_dia` com dedup via PK (`ON CONFLICT DO NOTHING`); ao final, a fato é reconstruída com `INSERT ... SELECT` (sem `SUM` — distinct não é aditivo entre lotes/dias).
- **`unidade_pacientes`** (grão unidade×paciente×dia, para a AN4): mesmo padrão do `medico_pacientes`, restrito a documentos **assinados**; grava em `stg_documento_unidade_paciente_dia` e reconstrói `fato_documento_unidade_paciente_dia`.
- **`medico_unidade`** (snapshot de vínculos): lê `rl_medico_unidade_atendimento` (≈580k linhas) e reconstrói `fato_medico_unidade` (médico × unidade, `in_ativo`, `dt_cadastro`) — alimenta a coluna "Médicos" da AN4 e o drill (rosca por tipo vem de `fato_documento_emissao`).
- **`receitas`** (ranking de medicamentos): lote por faixa de `id_receita` (2M), agregação na origem em grão mês×UF×tipo×texto normalizado (maiúsculas/espaços, até 255 caracteres; vazio/NULL → `NAO_INFORMADO`) e rebuild da `fato_receita_medicamento_mes` com `SUM` por chave. Não há catálogo oficial de medicamentos na origem (texto livre por médico) — o ranking agrupa pelo texto informado.
- **De-para de medicamentos (Fase 2)**: `de_para_medicamento` (texto → princípio ativo canônico) é semeada por `seed_de_para_medicamento.sql` (aplicada pelo `setup.py`; **892 mapeamentos / 268 princípios**, cobrindo ~57% dos itens — variações de sal, marcas conhecidas e erros de escrita; política conservadora: marca duvidosa fica fora). O endpoint do ranking aceita `agrupar=principio` (LEFT JOIN; textos não mapeados caem no próprio texto), resolvendo marca×genérico (ex.: MOUNJARO/TIRZEPATIDA → TIRZEPATIDA), e devolve `categoria` por linha (tabela `categoria_medicamento`, 27 categorias amplas semeadas por `seed_categoria_medicamento.sql`).
- **Especialidade**: deriva do cadastro do médico que assina (`tb_medico_especialidade` via `rl_medico_unidade_atendimento.id_medico`, `in_ativo='S'`) — não de `rl_med_especialidade_consulta` (vínculo da consulta, com outliers de até 104 especialidades).

## Modelo físico (schema `prescricao` do DW)

> Dicionário de dados completo (cada tabela: grão, colunas, origem, carga e quem consome): [`DATAMART.md`](DATAMART.md).

Star schema **sem foreign keys**: dimensões e fatos se relacionam apenas pelas chaves (ex.: `fato_documento_dia.id_tipo_documento` → `dim_tipo_documento.id_tipo_documento`). A integridade referencial é garantida pelo ETL (JOINs na origem, que já tem as FKs), não por constraints — decisão 2026-09-28 (ver "Decisoes Registradas" no plano).

Dimensões: `dim_data`, `dim_uf`, `dim_tipo_documento`, `dim_medico`, `dim_especialidade`, `dim_unidade`.

Fatos:
- `fato_documento_dia` (dia, sg_uf, id_tipo_documento, documentos, assinados, cancelados)
- `fato_documento_origem_dia` (dia, sg_uf, ds_origem_criacao, documentos) — origem de criação: WEB, WEB-MOBILE, IOS, ANDROID ou NAO_INFORMADO; campo majoritariamente NULL até meados de 2025 (~70% do total), preenchido sistematicamente só nos últimos meses
- `fato_documento_versao_dia` (dia, sg_uf, ds_versao_sistema, documentos) — versão do app por dia×UF (vazio → `NAO_INFORMADO`); alimenta a tabela "Emissões por versão do app" (total por versão no período)
- `fato_receita_medicamento_mes` (mes, sg_uf, id_tipo_documento, medicamento, itens) — itens de receita por medicamento (texto normalizado) em grão mensal; alimenta o ranking "Medicamentos prescritos"
- `de_para_medicamento` (medicamento, principio_ativo) — de-para curado (seed) para o toggle "agrupar por princípio ativo" do ranking de medicamentos
- `categoria_medicamento` (principio_ativo, categoria) — categoria terapêutica ampla (seed) exibida como coluna no ranking de medicamentos
- `medicamento_anvisa` (tp_produto, nm_produto, dt_final_processo, tp_categoria_regulatoria, nu_reg_produto, dt_vencimento_reg, nu_processo, tp_classe_terapeutica, nm_empresa_reg, in_situacao_reg, ds_principio_ativo, carregado_em) — registro de medicamentos da ANVISA (dados abertos; carga manual por `load_anvisa.py`)
- `fato_documento_especialidade_dia` (dia, sg_uf, id_medico_especialidade, documentos)
- `fato_documento_medico_dia` (dia, sg_uf, id_medico, documentos)
- `fato_documento_medico_tipo_dia` (dia, sg_uf, id_medico, id_tipo_documento, documentos) — médico × tipo de documento; alimenta AN1 (emissões no período) e o drill-down por tipo
- `fato_documento_medico_paciente_dia` (dia, sg_uf, id_medico, id_paciente) — grão médico×paciente×dia; alimenta AN2 (`count(DISTINCT id_paciente)` no período) e o drill-down de pacientes
- `fato_medico_dia` (dia, sg_uf, novos_aceite_termo, medicos_com_emissao; inclui linhas `sg_uf='--'` com distinct global por dia)
- `fato_medico_snapshot` (sg_uf, inscricoes_cadastradas, medicos_ativos, atualizado_em; inclui `sg_uf='--'` com totais globais)
- `fato_medico_emissao_mes` (mes, sg_uf, cpfs_distintos) — CPFs distintos com emissão por mês (por UF + global `--`); alimenta o gráfico "Médicos com emissão por mês"
- `fato_medico_extremos_emissao` (sg_uf, id_pessoa, primeiro_dia, ultimo_dia) — extremos de emissão por pessoa; alimenta inatividade e o total de emissores no período sem varrer a fato
- `fato_documento_unidade_paciente_dia` (dia, sg_uf, id_unidade_atendimento, id_paciente) — grão unidade×paciente×dia, somente documentos assinados; alimenta a AN4 (ranking de pacientes distintos por instituição) e o drill da instituição
- `fato_medico_unidade` (id_medico, id_unidade_atendimento, in_ativo, dt_cadastro) — snapshot dos vínculos médico–unidade; alimenta a coluna "Médicos" (vínculos ativos) da AN4
- `fato_medico_maior_dia` (id_medico, sg_uf, dia, documentos, pacientes) — melhor dia por médico/UF em documentos e pacientes distintos do dia; alimenta a AN3 diária
- `fato_documento_emissao` (id_consulta_documento, dia, dh_documento, id_medico, sg_uf, id_tipo_documento, id_unidade_atendimento, in_assinado, in_cancelado, ds_qrcode) — um registro por documento; alimenta a lista de documentos do drill da AN3 (sem paciente/conteúdo)
- `snap_medico_tipo` (id_medico, sg_uf, id_tipo_documento, documentos) — total all-time por médico/UF/tipo; ranking AN1 no modo "Todos"
- `snap_medico_paciente` (id_medico, sg_uf, pacientes) — pacientes distintos all-time (linhas reais de UF + linha global `'**'`); ranking AN2 no modo "Todos"
- `snap_especialidade` (sg_uf, id_medico_especialidade, documentos) — documentos all-time por UF×especialidade; card "Documentos por especialidade" no modo "Todos"
- `snap_especialidade_medicos` (sg_uf, ds_especialidade, medicos, documentos) — efetivo médico (dedup CPF) e documentos all-time por UF×especialidade (linha global `'**'`); ranking "Médicos por especialidade" no modo "Todos"
- `snap_instituicao` (chave, instituicao, cnes, uf, unidades, medicos, pacientes) — instituições no modo "Todos" (AN4), já com vínculos ativos de médicos
- `snap_medicamento_top` (sg_uf, id_tipo_documento, posicao, medicamento, itens) — top 100 do ranking de medicamentos no modo "Todos" por combinação de filtros (`'**'` = todas as UFs; `0` = todos os tipos)
- `snap_numeracao_anvisa_medico` (sg_uf, id_medico, id_tipo_documento, disponiveis, utilizados) — pool de numerações ANVISA reservadas por médico×tipo (`D`/`U`); visão RDC1000

Removidas em 2026-10-02 (sem consumidor na UI; `DROP` no `ddl_extra.sql`): `fato_documento_unidade_dia`, `fato_auditoria_dia`.

Staging: `stg_documento_dia`, `stg_documento_origem_dia`, `stg_documento_versao_dia`, `stg_documento_especialidade_dia`, `stg_documento_medico_dia`, `stg_documento_medico_tipo_dia`, `stg_documento_medico_paciente_dia`, `stg_documento_unidade_paciente_dia`, `stg_medico_unidade`, `stg_medico_maior_dia`, `stg_receita_medicamento_mes`.

Operacionais: `dashboard_refresh_config`, `dashboard_refresh_job`.

Índices secundários: `fato_documento_dia(sg_uf,dia)`, `fato_documento_dia(dia) INCLUDE (sg_uf,id_tipo_documento,documentos,assinados,cancelados)` (KPIs/série/UF/tipo via Index Only Scan), `fato_documento_origem_dia(sg_uf,dia)`, `fato_documento_versao_dia(sg_uf,dia)`, `fato_documento_medico_dia(id_medico,dia)`, `fato_documento_medico_tipo_dia(id_tipo_documento,sg_uf,dia)`, `fato_documento_medico_tipo_dia(id_medico,dia)`, `fato_documento_medico_paciente_dia(id_medico,dia)`, `fato_documento_especialidade_dia(id_medico_especialidade,dia)`, `fato_medico_dia(sg_uf,dia)`, `fato_medico_maior_dia(documentos DESC)`, `fato_documento_emissao(id_medico,dia,dh_documento)`, `fato_documento_emissao(dia,in_assinado) INCLUDE (id_medico,sg_uf)` (caminho 7/30/90 dias da AN3 via Index Only Scan), `fato_documento_emissao(id_unidade_atendimento,dia) INCLUDE (id_tipo_documento) WHERE in_assinado='S'` (rosca por tipo do drill AN4), `fato_documento_unidade_paciente_dia(id_unidade_atendimento,dia)`, `fato_medico_unidade(id_unidade_atendimento,in_ativo)`, `dim_medico(id_pessoa)`, `dashboard_refresh_job(status)`. Removidos em 2026-10-02 (redundantes com a pkey ou sem consulta): `fato_documento_medico_dia(sg_uf,dia)`, `fato_documento_medico_paciente_dia(sg_uf,dia)`, `fato_receita_medicamento_mes(sg_uf,mes)`, `dim_medico(sg_uf)`, `fato_documento_unidade_dia(id_unidade_atendimento,dia)`.

## Definições de negócio aplicadas

| Métrica | Regra |
|---|---|
| UF dos documentos | UF da unidade de atendimento (`tb_unidade_atendimento.sg_uf`); NULL e `BR` → `--` |
| Assinados / cancelados | colunas agregadas: `assinados` = `in_assinado='S'`, `cancelados` = `in_cancelado='S'`; `nao_assinados` = `documentos - assinados` (sem filtro por assinatura — grão sem `in_assinado`) |
| Origem de criação | `ds_origem_criacao` (NULL ou vazio → `NAO_INFORMADO`); histórica incompleta (ver ressalvas) |
| Médico ativo | CPF único (`tb_pessoa.nu_cpf`) de médicos com aceite do termo (`tb_usuario.dh_aceite_termo`); sem relação com `in_situacao` (definição alterada 2026-09-23) |
| Inscrições cadastradas | linhas de `tb_medico` (1 por CRM/UF) |
| Inatividade | última emissão por **pessoa** (`fato_medico_extremos_emissao.ultimo_dia`), em faixas de 30/60/90/120 dias sem emissão; só quem emitiu entra |
| Novos médicos | `tb_usuario.dh_aceite_termo` (aceite do termo = primeiro uso; ~94% preenchido, janela completa do sistema); join `tb_usuario.id_pessoa = tb_medico.id_pessoa`; `count(DISTINCT id_pessoa)` por dia×UF + linha global `'--'` (distinct entre todas as UFs — pessoa multi-UF conta uma vez no total) |
| AN3 — Maior volume diário de emissões a pacientes distintos no período | Por médico (inscrição), o maior volume de documentos **assinados** emitidos em um único dia; documentos não assinados são desprezados. "Todos" usa o melhor dia de todo o histórico (`fato_medico_maior_dia`); 7/30/90 dias usam o melhor dia dentro da janela (`fato_documento_emissao`, somente assinados). A coluna de pacientes distintos do dia vem de `fato_documento_medico_paciente_dia` (no modo Todos, já pré-calculada na fato). O detalhe lista os documentos assinados do dia (`ds_qrcode`, data/hora, tipo, instituição, UF e situação), sem paciente/conteúdo. Sem corte mínimo; ordenação decrescente por documentos do dia, depois pacientes. O filtro de tipo de documento não se aplica à AN3. |
| Anomalias AN1 e AN2 | AN1 "Emissões de documentos no período": ranking decrescente de médicos por documentos do tipo/UF/período (sem média; soma pura). AN2 "Atendimentos a pacientes distintos no período": ranking decrescente de médicos por `count(DISTINCT id_paciente)` no período (sem média). |
| AN4 — Pacientes distintos por instituição no período | Ranking decrescente de instituições por `count(DISTINCT id_paciente)` no período, considerando somente documentos assinados. Instituição = CNES da unidade (agrupa unidades do mesmo CNES); sem CNES, a própria unidade de atendimento. A coluna "Médicos" conta os vínculos ativos atuais (`fato_medico_unidade`, cadastro, não restrito ao período). O drill mostra a rosca de documentos por tipo (assinados), a evolução mensal de pacientes distintos e as unidades do grupo. Sem severidade/média. |
| Nome do médico | `dim_medico.nm_medico` via `tb_pessoa.nm_pessoa` (join `id_pessoa`); exibido apenas no drill-down da Auditoria |

## Ressalvas conhecidas

- A origem está em produção ativa: contagens podem variar entre varreduras; a carga diária converge.
- `ds_origem_criacao` só é preenchido sistematicamente nos últimos meses — ~70% dos documentos históricos ficam como `NAO_INFORMADO`; a série de dispositivos só é comparável a partir de ~meados de 2025.
- `tb_medico.ds_foto` (bytea, ~15 GB) nunca é lida.
- Carga incremental por watermark ainda não implementada — o job roda o `run_all` completo (~30–40 min às 02:00).
- Índices na origem ainda pendentes com o DBA (sem eles, a varredura em lotes é o caminho).
