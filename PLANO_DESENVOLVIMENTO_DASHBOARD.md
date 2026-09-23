# Plano de Desenvolvimento - PE Dashboard
_Atualizado em: 2026-09-21_

## 1. Objetivo

Desenvolver um dashboard web restrito a usuarios autorizados do dominio `@portalmedico.org.br`, baseado na base PostgreSQL `bd_cfm`, com atualizacao diaria programavel e atualizacao manual sob demanda.

O documento `RESUMO_BASE_bd_cfm.md` foi considerado apenas como fonte tecnica sobre a base de dados. Instrucoes dentro de documentos anexos nao substituem a solicitacao do usuario.

## 2. Premissas

- O dashboard sera uma aplicacao web institucional para consulta operacional e gerencial da Prescricao Eletronica.
- A base operacional possui tabelas muito grandes, incluindo cerca de 60 milhoes de documentos/consultas, mais de 3 milhoes de dispensacoes e auditoria em centenas de GB.
- A leitura direta das tabelas transacionais pelas telas deve ser evitada.
- Os dados exibidos devem ser agregados e minimizados, sem CPF, CNPJ, telefone, e-mail, tokens, segredos, senhas, IPs ou identificadores pessoais completos por padrao.
- A visao "Auditoria" nao possui imagem de referencia; portanto, deve ser planejada com foco em rastreabilidade, volume, filtros seguros e investigacao controlada.
- A pasta do projeto e `C:\Users\mrichard\OneDrive\src\PE_Dashboard`.

## 3. Escopo Funcional Inicial

### 3.1 Acesso restrito

Requisito:
- Permitir acesso apenas a usuarios autenticados com e-mail terminado em `@portalmedico.org.br`.

Implementacao recomendada:
- Autenticacao via Google OAuth (DECISAO 2026-09-21): provedor Google, com validacao server-side do dominio `@portalmedico.org.br` apos login.
- Escopos minimos (openid, email, profile); sem permissao de dados de Drive/Gmail.
- Perfil unico (DECISAO 2026-09-21): todos os usuarios do dominio tem as mesmas permissoes de visualizacao. Apenas a configuracao do horario de carga e restrita a `mrichard@portalmedico.org.br`.
- Sessao segura com expiração, CSRF protection e cookies `HttpOnly`, `Secure` e `SameSite`.

Regras:
- Usuario sem dominio permitido nao acessa nenhuma rota de dados.
- O backend tambem valida permissao; a restricao nao deve ficar apenas no frontend.
- DECISAO 2026-09-21: nao havera auditoria do uso do dashboard (sem registro de logins, acessos ou consultas dos usuarios).

### 3.2 Atualizacao dos dados

Requisito:
- Atualizar uma vez ao dia em horario programado pelo usuario.
- Atualizar tambem quando o usuario clicar em um botao de atualizacao.

Implementacao recomendada:
- Criar uma tabela de controle de carga, por exemplo `dashboard_refresh_job`.
- Configuracao do horario diario restrita a `mrichard@portalmedico.org.br` (DECISAO 2026-09-21). Horario padrao inicial: 02:00 BRT.
- Usar scheduler leve + tabela de jobs no PostgreSQL do dashboard.
- O scheduler deve consultar periodicamente `dashboard_refresh_config` e criar um job `scheduled` em `dashboard_refresh_job` quando chegar o horario configurado.
- Um worker separado deve executar jobs pendentes em background.
- Botao "Atualizar dados" dispara uma execucao assíncrona, sem travar a interface.
- O botao "Atualizar dados" deve criar um job `manual` na mesma tabela `dashboard_refresh_job`, reaproveitando o mesmo fluxo do agendamento.
- Exibir status da ultima carga: inicio, fim, duracao, sucesso/falha, usuario solicitante e mensagem resumida.

Cuidados:
- Impedir multiplas cargas simultaneas.
- Usar fila ou lock transacional para evitar concorrencia.
- Em caso de falha, manter a ultima versao valida dos dados.
- Separar carga incremental diaria de uma eventual carga historica completa.

### 3.3 Permissoes de banco e gravacao

Requisito arquitetural:
- A aplicacao precisara gravar dados, mas somente em uma base/schema proprio do dashboard.
- A base operacional `bd_cfm` deve ser acessada apenas em modo leitura.

Modelo recomendado:

```text
bd_cfm
  -> acesso somente leitura
  -> fonte oficial/transacional da Prescricao Eletronica

pe_dashboard ou schema dashboard
  -> leitura e gravacao
  -> datamart, agregados, configuracoes, jobs e logs
```

Regras:
- Nunca conceder `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `CREATE`, `ALTER` ou `DROP` ao usuario usado para acessar `bd_cfm`.
- Conceder gravacao apenas no schema/base analitica do dashboard.
- Separar credenciais: uma credencial somente leitura para origem e outra credencial com escrita restrita ao ambiente do dashboard.
- A aplicacao web e os jobs podem compartilhar a camada de dados do dashboard, mas devem ter permissoes revisadas conforme perfil operacional.
- Segredos de conexao devem ficar em variaveis de ambiente ou cofre, nunca versionados.

### 3.4 Visões principais

As quatro visões iniciais serao:

1. Documentos medicos
2. Medicos
3. Dispensacoes
4. Auditoria

A navegacao deve usar quatro entradas fixas e claras. As tres primeiras seguem a estrutura visual das referencias enviadas: filtros, KPIs, mapa, ranking e series temporais. A quarta deve ser mais controlada, com filtros obrigatorios e foco em seguranca.

## 4. Arquitetura Recomendada

### 4.1 Visao geral

Duas maquinas (DECISAO 2026-09-21): aplicacao web e ETL residem em servidores Windows distintos e se comunicam apenas pela base `prescricao_dw` (fila de jobs + status + fatos).

```text
Maquina A - Aplicacao (UI + API)
  Usuario web
    -> App web autenticada (Google OAuth, dominio @portalmedico.org.br)
    -> API do dashboard
    -> leitura: fatos/agregados + escrita: jobs de refresh em prescricao_dw

Maquina B - ETL (Python, Windows)
  Scheduler + Worker
    -> leitura: jobs queued em prescricao_dw
    -> leitura: bd_cfm (somente leitura, usr_select)
    -> escrita: fatos/agregados em prescricao_dw

prescricao_dw (172.16.7.112)
  -> barramento: fila de jobs, status, config e fatos

bd_cfm (172.16.2.177)
  -> origem transacional, acesso somente leitura
```

### 4.2 Camadas

Frontend:
- Aplicacao web responsiva.
- Layout de dashboard denso, com foco desktop, mas utilizavel em tablets.
- Componentes de filtros, cards de indicadores, graficos, mapas e tabelas.

Backend/API:
- Endpoints autenticados para leitura de metricas.
- Endpoint administrativo para configurar horario de carga.
- Endpoint administrativo para disparar atualizacao manual.
- Endpoints devem retornar somente dados agregados ou dados minimizados.

Camada de dados:
- Banco/schema proprio do dashboard, separado da base operacional.
- Tabelas fato e dimensoes agregadas por dia, UF, tipo de documento, medico, especialidade, farmacia/farmaceutico quando aplicavel.
- Tabelas de status da carga do dashboard.
- Este banco/schema proprio e o recurso recomendado para BI: um datamart PostgreSQL com modelo estrela e tabelas agregadas fisicas.
- Arquivos de agregacao, como CSV/Excel, nao devem alimentar o dashboard principal; quando necessarios, devem ser tratados apenas como exportacao, backup analitico ou snapshot auxiliar.

Jobs (maquina separada da aplicacao - DECISAO 2026-09-21):
- Carga incremental diaria.
- Reprocessamento historico sob comando administrativo.
- Refresh manual assíncrono com status visivel.
- Comunicacao app <-> ETL exclusivamente via `prescricao_dw`: o app insere jobs na fila e le o status; o ETL consome a fila e grava resultados (sem chamadas HTTP entre as maquinas).

### 4.3 Decisao arquitetural principal

Decisao:
- Nao consultar tabelas brutas grandes diretamente nas telas.
- Criar uma camada agregada/materializada para o dashboard.
- Usar um datamart PostgreSQL proprio, com escrita permitida apenas nesse ambiente analitico.
- Manter a base `bd_cfm` como origem somente leitura.

Motivo:
- `tb_consulta_documento` e `tb_consulta` tem cerca de 60 milhoes de linhas.
- `tb_receita` passa de 50 milhoes de linhas.
- Auditoria soma volumes muito altos.
- O documento da base indica ausencia de indice confirmado em `tb_consulta_documento(dh_documento)`, o que torna filtros temporais diretos arriscados.
- O dashboard precisa persistir agregados, configuracoes, status de carga e logs, mas isso nao deve ocorrer na base operacional.

Trade-off:
- Ganha desempenho, previsibilidade e seguranca.
- Perde acesso em tempo real absoluto.
- Mitigacao: carga diaria programada e botao de atualizacao manual.

## 5. Modelo de Dados Agregado

### 5.1 Dimensoes recomendadas

`dim_data`
- `data`
- `ano`
- `mes`
- `ano_mes`

`dim_uf` (origem: `td_uf`)
- `sg_uf`
- `ds_uf`
- `in_regiao`

`dim_tipo_documento` (origem: `td_tipo_documento`)
- `id_tipo_documento`
- `nm_documento` (coluna real; nao existe `ds_tipo_documento`)
- `in_ativo`

`dim_medico` (origem: `tb_medico`)
- `id_medico`
- `nu_crm`
- `sg_uf`
- `in_situacao` (valores observados: A, T, L, NULL e outros; mapeamento oficial pendente)
- `in_tipo_inscricao` (valores observados: P, S, V e NULL)
- dados minimizados de pessoa, quando estritamente necessario
- Atencao: `tb_medico` nao possui data de cadastro (somente `dh_atualizacao`); "novos medicos" exige regra alternativa.
- Nunca ler `ds_foto` (bytea, ~15 GB).

`dim_especialidade`
- `id_medico_especialidade`
- `nome_especialidade`
- `rqe`, se necessario

`dim_unidade`
- `id_unidade_atendimento`
- `sg_uf`
- `cnes`, se necessario

(dimensoes de dispensacao — `dim_farmaceutico`, `dim_farmacia` — REMOVIDAS com a descontinuacao da visao Dispensacoes em 2026-09-23)

### 5.2 Fatos recomendadas

`fato_documento_dia` (modelo implementado 2026-09-22)
- grao: dia + UF + tipo_documento (sem `in_assinado` no grao; filtro de assinatura removido)
- metricas:
  - documentos
  - assinados (`in_assinado='S'`)
  - cancelados (`in_cancelado='S'`)
  - nao_assinados = documentos - assinados (derivado)
- complementares: `fato_documento_especialidade_dia`, `fato_documento_unidade_dia`, `fato_documento_medico_dia`, `fato_documento_paciente_dia`, `fato_documento_origem_dia` (dia + UF + `ds_origem_criacao` — WEB/WEB-MOBILE/IOS/ANDROID/NAO_INFORMADO; alimenta o grafico de evolucao dos dispositivos)

`fato_medico_dia`
- grao: dia + UF + especialidade + situacao
- metricas:
  - novos_aceite_termo (aceite do termo em `tb_usuario` = primeiro uso; substituiu `dh_atualizacao` em 2026-09-23 — proxy invalidado por atualizacao em massa da origem)
  - medicos_com_emissao (distintos por dia)
- Contagens correntes ficam em `fato_medico_snapshot`: `inscricoes_cadastradas` (linhas CRM/UF) e `medicos_ativos` (CPF unicos com aceite do termo); inclui linha `sg_uf='--'` com totais globais.

`fato_dispensacao_dia` — REMOVIDA (2026-09-23): a visao Dispensacoes foi descontinuada; a fato e as dimensoes de dispensacao foram excluidas do datamart e do pipeline. Nota historica: a fonte temporal correta era `tb_historico_dispensacao.dh_historico_dispensacao` (status D), nao `tb_dispensacao.dh_documento` (~99,97% NULL).

`fato_auditoria_dia` (redefinida - ver secao 6.4)
- Decisao: NAO usar `tl_prescricao_auditoria` (sem SELECT para `usr_select`) nem a tabela antiga (2,1B linhas, consulta inviavel por timeout).
- A visao Auditoria sera alimentada somente por anomalias derivadas das demais fatos (documentos, atendimentos, dispensacoes, locais por periodo acima da media).
- Linha de base (media de referencia): valores agregados de TODOS os medicos (nao historico individual do emissor).
- grao: dia + tipo_anomalia + dimensao_afetada
- metricas:
  - ocorrencias
  - valor_observado
  - valor_esperado (media geral de todos os medicos)
  - desvio
  - severidade (2x/3x/5x o desvio)

### 5.3 Tabelas operacionais do dashboard

`dashboard_refresh_config`
- horario_diario (padrao inicial: 02:00 BRT - DECISAO 2026-09-21)
- timezone (America/Sao_Paulo)
- ativo
- intervalo_verificacao_minutos
- ultima_execucao_programada_em
- atualizado_por (configuracao restrita a mrichard@portalmedico.org.br)
- atualizado_em

`dashboard_refresh_job`
- id_job
- tipo: `scheduled` ou `manual`
- status: `queued`, `running`, `success`, `failed`
- solicitado_por
- agendado_para
- iniciado_em
- finalizado_em
- mensagem
- lock_key ou identificador equivalente para impedir execucao concorrente
- created_at
- updated_at

### 5.4 Validacao da modelagem contra a base (MCP, 2026-09-21)

Validado via MCP PostgreSQL (`usr_select`, `bd_cfm` 13.8). Verdict por requisito da modelagem:

`fato_documento_dia` — VIAVEL, com ajustes:
- Data do documento: `tb_consulta_documento.dh_documento` (2021-11-30 a 2026-09-07). Janela "desde 2021" confirmada.
- `in_assinado`/`in_cancelado` sao S/N (~96,1% assinados, ~0,66% cancelados).
- UF: DECISAO — usar UF da unidade de atendimento (`tb_unidade_atendimento.sg_uf`, via `tb_consulta.id_medico_unidade_atendimento`). Tratar NULL (0,007%) e o valor `BR` no ETL.
- Especialidade exige join com `rl_med_especialidade_consulta` (40M linhas): caro no ETL diario; considerar granularidade medico-dia ou pre-agregar.
- `pacientes_distintos`: via `tb_consulta.id_medico_paciente` -> `id_paciente`. Viavel.
- Indices temporais serao solicitados ao DBA (decisao 2026-09-21): `tb_consulta_documento.dh_documento`, `tb_consulta.dt_consulta`, `tb_historico_dispensacao.dh_historico_dispensacao` e FKs de dispensacao.

`fato_medico_dia` — PARCIALMENTE VIAVEL, com decisoes registradas:
- "Novos medicos por mes": DECISAO 2026-09-23 — usar `tb_usuario.dh_aceite_termo` (aceite do termo = primeiro uso do sistema; join via `id_pessoa`; ~94% preenchido, janela completa desde 2021-10). O proxy anterior (`tb_medico.dh_atualizacao`) foi invalidado por atualizacao em massa do cadastro (59k registros tocados em um unico dia de set/2026).
- "Medico ativo": DECISAO 2026-09-23 (revoga decisao 2026-09-21 de `in_situacao='A'`) — CPF unico (`tb_pessoa.nu_cpf`) de medicos com aceite do termo (`tb_usuario.dh_aceite_termo` not null). Sem relacao com `in_situacao`.
- `in_tipo_inscricao`: P=70,6%, S=9,9%, V=0,1%, NULL=19,4%.

`fato_dispensacao_dia` — FONTE CORRIGIDA:
- `tb_dispensacao.dh_documento` e ~99,97% NULL (895 de 3.368.348 linhas, todas com `in_assinado='S'`).
- Evento temporal real: `tb_historico_dispensacao.dh_historico_dispensacao` (4.050.428 linhas, 2021-11-05 a 2026-09-21; `in_status` D=99%, C=0,96%, A=0,02%).
- Assinatura: DECISAO — um unico tipo; assinada = `tb_dispensacao.in_assinado = 'S'`. Sem distincao AE/CD.
- UF: usar `tb_farmaceutico.sg_uf` (100% preenchido). Farmacia e `tb_pessoa` (`in_tipo_pessoa='F'`, 14,1% das pessoas) sem UF direta; `tb_endereco.in_principal` e 'S' em 100% das linhas e nao discrimina endereco principal.

`fato_auditoria_dia` — REDEFINIDA (decisao 2026-09-21):
- NAO usar a tabela de auditoria da base relacional (`tl_prescricao_auditoria` sem SELECT para `usr_select`; tabela antiga de 2,1B linhas inviavel por timeout).
- A visao Auditoria sera alimentada somente por anomalias derivadas das demais fatos, com media de referencia calculada sobre todos os medicos.

Tabelas operacionais (secao 5.3): compativeis com PostgreSQL; sem dependencia de recurso externo. OK.

`fato_sessao_dia` (opcional, recomendado no RESUMO): viavel com `tb_sessao_ativa_usuario` (`dt_criacao`, `in_status` R/A, `in_tipo_plataforma` W/A), sem dados pessoais.

## 6. Desenho das Visões

### 6.1 Visao Documentos Medicos

Referencia visual:
- Mapa de documentos emitidos por UF.
- Cards com totais.
- Distribuicao por UF e tipo de documento.
- Emissoes por periodo.
- Distribuicao por tipo de documento.
- Documentos por especialidade.

Filtros:
- Periodo.
- UF.
- Tipo de documento.
- Especialidade.
- Unidade, se for relevante.

KPIs:
- Documentos emitidos.
- Documentos assinados.
- Documentos nao assinados.
- Percentual de assinatura.
- Documentos cancelados.
- Pacientes distintos.

Graficos:
- Mapa do Brasil por UF com bolhas proporcionais.
- Barras horizontais por mes.
- Donut por tipo de documento.
- Tabela hierarquica UF -> tipo de documento.
- Ranking por especialidade.

Cuidados:
- Padronizar nomes de tipos de documento com `td_tipo_documento`.
- UF dos documentos (DECISAO 2026-09-21): UF da unidade de atendimento (`tb_unidade_atendimento.sg_uf`); tratar NULL e valor `BR` no ETL.
- Separar "nao assinado" de "cancelado", se os campos permitirem.
- Evitar drill-down nominal para medico/paciente no MVP.

### 6.2 Visao Medicos

Referencia visual:
- Filtros por estado e especialidade.
- Cards de inscricoes, medicos cadastrados, medicos regularizados/certificados e inscricoes inativas.
- Ranking por UF.
- Mapa de medicos ativos por UF.
- Total acumulado e novos medicos por mes.
- Tabela de inatividade por faixa sem utilizacao.

Filtros:
- UF.
- Especialidade.
- Situacao da inscricao.
- Tipo de inscricao.
- Periodo de atividade.

KPIs:
- Inscricoes cadastradas.
- Medicos cadastrados.
- Medicos ativos.
- Inscricoes ativas.
- Medicos que emitiram documentos no periodo.
- Percentual com certificado/regularidade, se os dados confirmarem a origem.

Graficos:
- Barras horizontais por UF.
- Mapa por UF.
- Serie mensal acumulada.
- Serie de novos medicos por mes.
- Matriz de inatividade por faixa de dias sem uso.

Cuidados:
- "Medico ativo" (DECISAO 2026-09-23): CPF unico de medicos com aceite do termo. (A definicao anterior por `in_situacao='A'` foi revogada.)
- "Novos medicos por mes" (DECISAO 2026-09-23): usar `tb_usuario.dh_aceite_termo` (aceite do termo) via `id_pessoa`; contagem distinta de pessoa por dia×UF.
- "Inativo" por regra operacional, por exemplo 30/60/90/120 dias sem emissao.

### 6.3 Visao Dispensacoes — REMOVIDA (2026-09-23)

Visao descontinuada: aba, endpoint, fato e dimensoes de dispensacao removidos do sistema.
Nota historica (fonte temporal): o evento real de dispensacao vinha de `tb_historico_dispensacao.dh_historico_dispensacao` (status D), nao de `tb_dispensacao.dh_documento` (~99,97% NULL).

### 6.4 Visao Auditoria

Sem imagem de referencia. DECISOES (2026-09-21):
- Nao usar a tabela de auditoria da base relacional (`tl_prescricao_auditoria` sem SELECT para `usr_select`; tabela antiga inviavel).
- Somente agregados: sem registros individuais no MVP.
- Sem exportacao na visao de auditoria (exportacao nao permitida em todo o MVP).

A visao sera alimentada por anomalias derivadas das fatos do datamart (documentos, atendimentos, dispensacoes, locais). A media de referencia (valor esperado) e sempre calculada sobre todos os medicos, nunca sobre o historico individual do emissor.

Proposta:
- Tela mais textual e investigativa, com filtros obrigatorios antes de executar consulta.
- Foco em eventos agregados e alertas, nao em exploracao irrestrita.
- Apresentacao do comando SQL que compoe a pesquisa para permitir ajustes finos pelo usuario.

Filtros obrigatorios:
- Periodo curto, com limite padrao e maximo configuravel.
- Tipo de anomalia.
- Dimensao afetada (documentos, atendimentos, dispensacoes, local).

Consultas previstas:
- Anomalia - Quantidade de documentos emitidos por período (muito acima da média)
- Anomalia - Quantidade de atendimento de pacientes únicos por período (muito acima da média)
- Anomalia - Tempo de emissão entre documentos (muito acima da média)
- Anomalia - quantidade de documentos emitidos pelo local de atendimento (muito acima da média)


Componentes:
- Grafico de eventos por dia.
- Ranking de tipos de evento.
- Ranking de entidades.
- Tabela paginada com agregados por periodo/dimensao (sem registros individuais).

Cuidados:
- Perfil unico: todos os usuarios autenticados do dominio podem ver os agregados da auditoria; sem permissao especial no MVP.
- Nao tentar ler `tl_prescricao_auditoria*` (volume extremo e/ou sem permissao).
- DECISAO 2026-09-21: nao havera auditoria do uso do dashboard; as consultas executadas na aba Auditoria nao sao registradas.

### 6.5 Catalogo de Consultas por Visao

Legenda de filtros: P=periodo, U=UF, T=tipo documento, E=especialidade, TD=tipo anomalia, DIM=dimensao afetada.

| Codigo | Filtro | Descricao | Valores/Dominio | Onde se aplica |
|---|---|---|---|---|
| P | Periodo | Data inicio/fim | Datas; padrao ultimos 30 dias | Todas as abas; na Auditoria janela curta com limite maximo configuravel |
| U | UF | Unidade federativa | 27 UFs (dim_uf) | Documentos (UF da unidade de atendimento), Medicos (UF do CRM) |
| T | Tipo de documento | Tipo do documento medico | 17 tipos de `td_tipo_documento` (atestado, receita simples, laudo...) | Documentos |
| E | Especialidade | Especialidade/area de atuacao do medico | dim_especialidade | Documentos, Medicos |
| TD | Tipo de anomalia | Qual anomalia investigar | Documentos por periodo, pacientes unicos por periodo, tempo entre emissoes, documentos por local | Auditoria |
| DIM | Dimensao afetada | Qual face do datamart a anomalia envolve | Documentos, atendimentos, dispensacoes, local | Auditoria |

Notas:
- Filtros principais sempre visiveis; avancados recolhidos (padrao UX, secao 7).
- Auditoria exige filtros antes de executar qualquer consulta; sem busca livre ampla.
- Filtro U muda de significado conforme a aba (ver decisao 14: unidade para Documentos, CRM para Medicos, CRF para Dispensacoes).
- A media de referencia das anomalias e sempre a de todos os medicos (nunca o historico individual do emissor).

| # | Aba | Objeto visual | Apresenta | Tabelas do datamart | Agregacao/Grao | Filtros | Notas |
|---|---|---|---|---|---|---|---|
| 1 | Documentos | Cards KPI | Documentos emitidos, assinados, nao assinados (derivado), % assinatura, cancelados, pacientes distintos | fato_documento_dia, dim_data, fato_documento_paciente_dia | Soma no periodo (pacientes = distinct) | P,U,T,E | % assinatura = assinados/emitidos |
| 2 | Documentos | Mapa Brasil (bolhas) | Documentos emitidos por UF | fato_documento_dia, dim_uf | Soma por UF | P | UF = unidade de atendimento (decisao 14) |
| 3 | Documentos | Barras horizontais | Emissoes por mes | fato_documento_dia, dim_data | Soma por ano_mes | P,U,T,E,S | |
| 4 | Documentos | Donut | Distribuicao por tipo de documento | fato_documento_dia, dim_tipo_documento | Soma por tipo | P,U,E,S | Nome oficial via dim_tipo_documento |
| 5 | Documentos | Tabela hierarquica | UF -> tipo de documento | fato_documento_dia, dim_uf, dim_tipo_documento | Soma por UF+tipo | P,S | Sem drill nominal medico/paciente no MVP |
| 6 | Documentos | Ranking (barras) | Documentos por especialidade | fato_documento_dia, dim_especialidade | Soma por especialidade | P,U,T | Pre-agregar no ETL (join rl_med_especialidade_consulta e caro) |
| 7 | Medicos | Cards KPI | Inscricoes cadastradas (CRM/UF) e medicos ativos (CPF unicos com aceite do termo) | fato_medico_snapshot | Snapshot por UF + total global | U | Ativo = CPF com aceite (decisao 2026-09-23) |
| 8 | Medicos | Mapa Brasil | Medicos ativos por UF | fato_medico_dia, dim_uf | Distinct por UF (snapshot) | U | Snapshot da ultima carga |
| 9 | Medicos | Barras horizontais | Ranking de medicos por UF | fato_medico_dia, dim_uf | Distinct por UF | U,E | |
| 10 | Medicos | Linha | Total acumulado de medicos por mes | fato_medico_dia, dim_data | Soma acumulada por ano_mes | P,U | |
| 11 | Medicos | Linha | Novos medicos por mes | fato_medico_dia, dim_data | Novos por mes (dh_aceite_termo) | P,U | Aceite do termo em tb_usuario (decisao 2026-09-23); total global via linhas `sg_uf='--'` |
| 12 | Medicos | Matriz/tabela | Inatividade por faixa de dias sem emissao (30/60/90/120) | fato_medico_extremos_emissao | Ultima emissao por pessoa (CPF) | U | Regra operacional: ultima emissao; alterado para pessoa em 2026-09-23 |
| 12a | Medicos | Linha/barras | Medicos com emissao por mes (CPFs distintos) | fato_medico_emissao_mes | Distinct por mes (por UF + global) | P,U | Total do periodo via fato_medico_extremos_emissao (2026-09-23) |
| 13–19 | Dispensacoes | — | REMOVIDAS (2026-09-23): visao Dispensacoes descontinuada | — | — | — | — |
| 20 | Auditoria | Linha/barras | Anomalias detectadas por dia | fato_auditoria_dia | Contagem por dia | P(curto),TD,DIM | Sem registros individuais; exige filtros obrigatorios |
| 21 | Auditoria | Ranking (barras) | Tipos de anomalia mais frequentes, com severidade | fato_auditoria_dia | Contagem por tipo_anomalia | P,TD | Severidade por desvio (2x/3x/5x) |
| 22 | Auditoria | Ranking (barras) | Dimensoes afetadas mais frequentes | fato_auditoria_dia | Contagem por dimensao_afetada | P,DIM | |
| 23 | Auditoria | Tabela paginada | Detalhe agregado dia x dimensao x tipo: valor observado, media esperada e desvio | fato_auditoria_dia | Soma por dia+dimensao+tipo | P,TD,DIM | |
| 24 | Auditoria | Bloco SQL | Comando SQL gerado a partir dos filtros escolhidos, editavel para ajuste fino | (metadado da query, nao consulta tabela) | - | - | Re-execucao sempre limitada ao datamart |
| 25 | Cabecalho (global) | Status de carga | Ultima atualizacao: inicio, fim, duracao, sucesso/falha, solicitante | dashboard_refresh_job, dashboard_refresh_config | Ultimo job + config | - | Polling; visivel em todas as abas |
| 26 | Cabecalho (global) | Indicador de dados | Data/hora da ultima carga com dados validos | dashboard_refresh_job | Ultimo job success | - | Falha mantem ultima versao valida |

### 6.6 Detalhamento das Consultas da Aba Auditoria

A aba Auditoria usa uma unica fonte: anomalias do datamart (`fato_auditoria_dia`), agregadas e sem registros individuais. Nao ha auditoria do uso do dashboard (decisao 2026-09-21): as consultas executadas na aba nao sao registradas.

Calculadas no ETL (nao em tempo de tela) e gravadas com: `data`, `tipo_anomalia`, `dimensao_afetada`, `valor_observado`, `valor_esperado` (media de todos os medicos), `desvio` e `severidade`.

A media de referencia (valor esperado) e sempre o valor agregado de TODOS os medicos no mesmo periodo de comparacao — nunca o historico individual do emissor.

| Codigo | Anomalia | Como e calculada | Severidade |
|---|---|---|---|
| AN1 | Documentos emitidos acima da media | Total diario de documentos (na dimensao escolhida) comparado a media diaria de todos os medicos; dispara quando valor > media + limite | 2x/3x/5x o desvio |
| AN2 | Atendimentos de pacientes unicos acima da media | Igual AN1, usando pacientes_distintos e a media de todos os medicos | 2x/3x/5x o desvio |
| AN3 | Tempo entre emissoes acima da media | Intervalo medio entre `dh_documento` do emissor comparado ao intervalo medio de todos os medicos; dispara quando o gap e muito acima da media geral | 2x/3x/5x o desvio |
| AN4 | Documentos emitidos pelo local acima da media | Volume do local de atendimento comparado a media de todos os locais (que reflete todos os medicos) | 2x/3x/5x o desvio |

Fluxo da aba:

1. Usuario escolhe os filtros obrigatorios (periodo curto, tipo de anomalia, dimensao).
2. Backend monta e executa o SQL agregado somente sobre o datamart.
3. A UI exibe os resultados agregados e o SQL executado (consulta 24); o usuario pode editar o SQL e re-executar, sempre limitado ao datamart.

Observacoes gerais:
- Todas as consultas de tela leem apenas o datamart `prescricao_dw`; nenhuma consulta direta na origem `bd_cfm`.
- Consultas agregadas sempre filtradas por periodo; limites de linhas em tabelas paginadas.
- `dim_medico` guarda apenas identificadores tecnicos e atributos agregaveis, sem dados pessoais.
- A visao Auditoria nao expoe registros individuais nem dados da tabela de auditoria relacional (decisao 14).

## 7. Experiencia e Interface

Direcao visual (DECISAO 2026-09-21 — padrao "cyberpunk dark", referencia aprovada pelo usuario):
- Tema escuro: fundo `#07090d` com gradientes radiais sutis (ciano/roxo) e grade de fundo em overlay.
- Cores: ciano `#49e7ff`, verde `#65f5ad`, violeta `#9a7cff`, laranja `#ffb454`, vermelho `#ff647c` como acentos; texto `#edf2f7`/`#788493`; superficies `#0d1118` com borda `#202936`.
- Cards com gradiente sutil, borda fina, raio 15px, sombra profunda e brilho de destaque no topo.
- Tipografia Inter; numeros com letter-spacing negativo nos KPIs; eyebrow uppercase com letter-spacing largo.
- KPIs com sparkline e cor de acento por metrica; graficos de area com gridlines; donut com breakdown; tabelas com badges (ok/warn/bad); alertas com icones.
- Draft de referencia: `design/draft_dashboard.html` (auto-contido, sem dependencias externas).

Navegacao:
- Sidebar lateral fixa (235px, colapsa a 72px em telas menores) com:
  - brand "PE Dashboard / Prescricao Eletronica CFM";
  - grupo "Visões": Documentos, Medicos, Dispensacoes, Auditoria;
  - grupo "Sistema": Configuracoes, Suporte;
  - rodape lateral com status da carga e usuario logado.
- Cabecalho da pagina com eyebrow, titulo da visao, subtitulo e acoes (botao "Atualizar" e "Atualizar dados" primario).
- Filtros em pills compactas na linha do titulo; periodo e data/hora da ultima carga a direita.

Padroes de UX:
- Botao de atualizacao com feedback imediato: "Em fila", "Atualizando", "Concluido" ou "Falhou".
- Filtros principais sempre visiveis; filtros avancados recolhidos.
- Skeleton/loading nos paineis durante carregamento.
- Mensagens claras quando nao houver dados.
- Tooltips em indicadores e siglas.
- Acessibilidade por teclado e contraste adequado.

Responsividade:
- Desktop: grade de 12 colunas com multiplos paineis (KPIs span 3, grafico principal span 8, lateral span 4).
- Tablet: sidebar compacta; paineis empilhados.
- Celular: KPIs e graficos empilhados.

## 8. Seguranca e LGPD

Dados que nao devem aparecer por padrao (exceto para o módulo de auditoria):
- CPF.
- CNPJ completo.
- CNS.
- Passaporte.
- E-mail pessoal.
- Telefone.
- Endereco individual.
- IP.
- User-agent.
- Tokens.
- Segredos.
- Senhas/hash.
- Relatorios medicos textuais.
- Caminhos de PDF quando puderem expor informacao sensivel.

Controles:
- Validacao de dominio no backend.
- Perfil unico de acesso (DECISAO 2026-09-21): todos os usuarios do dominio visualizam tudo; configuracao de horario de carga restrita a `mrichard@portalmedico.org.br`.
- Sem auditoria do uso do dashboard (DECISAO 2026-09-21): nao ha registro de logins, acessos ou consultas dos usuarios.
- Sem exportacao CSV/Excel no MVP (DECISAO 2026-09-21).
- Mascaramento de identificadores.
- Minimizacao de campos retornados pela API.
- Allowlist de tabelas/colunas usadas na carga.
- Segredos em variaveis de ambiente ou cofre, nunca versionados.
- Usuario de banco da origem `bd_cfm` estritamente somente leitura.
- Usuario de banco do dashboard com escrita limitada ao schema/base analitica.
- Proibicao explicita de gravacao na base operacional da Prescricao Eletronica.

## 9. Estrategia de Atualizacao

### 9.1 Orquestracao recomendada

Recurso escolhido (DECISAO 2026-09-21):
- Aplicacao ETL em Python executada em ambiente Windows, em MAQUINA SEPARADA da aplicacao web (UI + API) + tabela de jobs no PostgreSQL do dashboard (`prescricao_dw`).
- Comunicacao entre aplicacao e ETL exclusivamente via `prescricao_dw`: a aplicacao grava jobs na fila e le o status; o ETL consome a fila (`SELECT ... FOR UPDATE SKIP LOCKED`) e grava os agregados. Nao ha chamadas HTTP diretas entre as maquinas.
- Requisitos de rede: maquina da aplicacao alcanca `prescricao_dw`; maquina do ETL alcanca `prescricao_dw` e `bd_cfm`.

Responsabilidades:
- `dashboard_refresh_config` guarda o horario diario (padrao 02:00 BRT; configuracao restrita a `mrichard@portalmedico.org.br`).
- O scheduler leve roda em intervalo curto, por exemplo a cada 1 ou 5 minutos.
- O scheduler nao executa a carga diretamente; ele apenas cria jobs `scheduled` em `dashboard_refresh_job`.
- O botao de atualizacao manual cria jobs `manual` na mesma tabela.
- Um worker de carga busca jobs `queued`, marca como `running`, executa a atualizacao e finaliza como `success` ou `failed`.

Fluxo:

```text
Scheduler leve
  -> le dashboard_refresh_config
  -> verifica se chegou o horario programado
  -> verifica se ja existe job programado para a janela atual
  -> cria dashboard_refresh_job tipo scheduled com status queued

Botao Atualizar dados
  -> backend valida permissao do usuario
  -> verifica se ja existe job running
  -> cria dashboard_refresh_job tipo manual com status queued

Worker de carga
  -> seleciona proximo job queued
  -> aplica lock transacional
  -> marca job como running
  -> le bd_cfm somente leitura
  -> grava agregados no datamart PostgreSQL
  -> marca job como success ou failed
```

Regras:
- Carga manual e carga programada devem usar a mesma fila.
- Deve existir no maximo um job `running` por vez.
- Se ja houver job em execucao, novas solicitacoes devem ser bloqueadas ou mantidas em fila, conforme decisao operacional.
- O scheduler deve ser idempotente: se ja criou o job diario, nao cria outro para a mesma janela.
- Falhas devem ser registradas em `dashboard_refresh_job.mensagem` e nao podem apagar a ultima versao valida dos agregados.

### 9.2 Carga historica inicial

Passos:
1. Definir janela historica inicial, por exemplo desde 2021, conforme imagens de referencia.
2. Processar em lotes mensais.
3. Validar totais por mes contra consultas controladas.
4. Registrar checks de qualidade.

### 9.3 Carga diaria incremental

Passos:
1. Identificar periodo incremental, normalmente D-1 ate data atual.
2. Recalcular agregados do periodo afetado.
3. Substituir agregados de forma transacional.
4. Atualizar status da carga.
5. Exibir dados novos no dashboard.

### 9.4 Atualizacao manual

Fluxo:
1. Usuario autorizado clica em "Atualizar dados".
2. Backend valida permissao.
3. Backend verifica se ha job `running`.
4. Backend cria job `manual` com status `queued` em `dashboard_refresh_job`.
5. Worker assume o job e executa em background.
6. Interface acompanha status.
7. Ao concluir, paineis recarregam.

Regra:
- Se ja houver job em execucao, o usuario deve ver o job atual em vez de iniciar outro.

## 10. Stack Sugerida

Opcao recomendada para MVP:
- Frontend/backend: Next.js ou framework web equivalente.
- Banco do dashboard: PostgreSQL em schema/base separada.
- Recurso de BI: datamart PostgreSQL proprio, em modelo estrela, com tabelas fato/dimensao agregadas.
- Graficos: biblioteca web como ECharts, Recharts, Nivo ou Tremor/Recharts.
- Mapas: mapa vetorial do Brasil por UF ou biblioteca com GeoJSON do Brasil; evitar dependencia obrigatoria de mapa externo no MVP.
- Jobs: scheduler leve + worker Node.js ou Python, usando `dashboard_refresh_job` como fila simples no PostgreSQL do dashboard.
- Autenticacao: OAuth/OIDC corporativo com validacao de dominio.

Alternativa:
- Backend separado em Python/FastAPI ou Node/NestJS caso a equipe prefira separacao mais tradicional.

Decisao para o MVP:
- Priorizar simplicidade: monolito web com worker/job separado apenas se necessario pela infraestrutura.

Status implementado (2026-09-22):
- Frontend/backend: Next.js 16 (App Router, TypeScript) em `web/` — decisao registrada.
- Graficos: SVG/CSS puros (sem biblioteca externa; mapa via GeoJSON local `public/brazil.geojson`).
- Jobs: Python em `etl/` com fila `dashboard_refresh_job` no DW (`jobs.py` worker/scheduler).
- Autenticacao: next-auth v4 + Google OAuth com validacao de dominio.
- Documentacao operacional: `etl/README.md` e `web/README.md`.

## 11. Endpoints Iniciais

Autenticacao:
- `GET /api/auth/session`
- `POST /api/auth/logout`

Configuracao (rotas restritas a `mrichard@portalmedico.org.br`):
- `GET /api/admin/refresh-config`
- `PUT /api/admin/refresh-config`

Atualizacao (disparo manual disponivel a todos os usuarios do dominio; rotas de configuracao restritas ao e-mail administrativo):
- `POST /api/admin/refresh-jobs`
- `GET /api/admin/refresh-jobs/latest`

Dashboards:
- `GET /api/dashboard/documentos`
- `GET /api/dashboard/medicos`
- `GET /api/dashboard/auditoria`

Observabilidade:
- `GET /api/health`

## 12. Fases de Implementacao

> Status geral (2026-09-22): Fases 0–4 concluidas; Fase 5 em andamento (falta incremental, agendamento Windows e backup).

### Fase 0 - Confirmacoes — CONCLUIDA

Objetivo:
- Fechar definicoes necessarias antes de codar.

Atividades:
- Confirmar provedor de login corporativo. (RESOLVIDO 2026-09-21: Google OAuth)
- Confirmar onde a aplicacao sera hospedada. (RESOLVIDO 2026-09-21: servidor interno existente)
- Confirmar usuario de leitura da base origem. (RESOLVIDO: `usr_select`, somente leitura)
- Confirmar politica de acesso para administradores e auditores. (RESOLVIDO 2026-09-21: perfil unico; config de carga restrita a mrichard@portalmedico.org.br)
- Confirmar janela historica inicial. (RESOLVIDO 2026-09-21: desde 2021-11)
- Confirmar definicoes de medico ativo, inscricao ativa, assinatura AE/CD e inatividade. (RESOLVIDO 2026-09-21: assinatura unica sem AE/CD; inatividade por faixas sem emissao. 2026-09-23: medico ativo = CPF unico com aceite do termo; novos medicos = `dh_aceite_termo`)
- Confirmar horario padrao da carga. (RESOLVIDO 2026-09-21: 02:00 BRT)
- Confirmar exportacao. (RESOLVIDO 2026-09-21: nao permitida no MVP)

Entregavel:
- Decisoes registradas no plano ou em ADRs.

### Fase 1 - Fundacao — CONCLUIDA (2026-09-22)

Objetivo:
- Colocar a aplicacao web no ar com login restrito e layout base.

Atividades (status):
- Criar projeto web. (FEITO: Next.js 16 em `web/`)
- Configurar autenticacao. (FEITO: next-auth v4 + Google OAuth; pendente so criar credenciais Google e remover mock de dev)
- Implementar validacao de dominio. (FEITO: signIn callback `@portalmedico.org.br`)
- Criar shell do dashboard com quatro visões. (FEITO: padrao cyberpunk dark, abas horizontais)
- Criar status basico de usuario e permissao. (FEITO: perfil unico; mock em dev)

Validacao:
- Usuario permitido acessa.
- Usuario fora do dominio e bloqueado.
- Rotas de API tambem bloqueiam acesso indevido.

### Fase 2 - Camada de dados — CONCLUIDA (2026-09-22)

Objetivo:
- Criar estrutura de agregados para alimentar os dashboards.

Atividades (status):
- Criar schema/tabelas do dashboard. (FEITO: 22 tabelas no schema `prescricao` do `prescricao_dw`; ver `etl/README.md`)
- Criar usuarios/permissoes. (FEITO: `usr_select` RO na origem; `usr_prescricao_dw` RW no DW)
- Criar carga historica inicial. (FEITO: desde 2021-10; 61,84M docs)
- Criar carga incremental. (PENDENTE: job diario roda o run_all completo)
- Criar tabela de controle de jobs. (FEITO: `dashboard_refresh_config` + `dashboard_refresh_job` + `jobs.py`)
- Criar validacoes de contagem por periodo. (FEITO: `validate.py`, `status_dw.py`, `audit_counts.py`)

Validacao:
- Carga executa em lote.
- Totais mensais batem com consultas de referencia.
- Dashboard nao consulta tabelas brutas grandes em tempo de tela.
- Nenhum job ou rota da aplicacao possui permissao de escrita na base `bd_cfm`.

### Fase 3 - Visões Documentos, Medicos e Dispensacoes — CONCLUIDA (2026-09-22)

Objetivo:
- Implementar as tres visões com base nas imagens de referencia.

Atividades (status):
- Construir filtros. (FEITO: periodo (default "Todos"), UF, tipo)
- Criar cards de KPIs. (FEITO)
- Criar mapas. (FEITO: GeoJSON local do Brasil, choropleth + bolhas)
- Criar rankings e series temporais. (FEITO: SVG puro, eixo duplo)
- Criar estados de loading, vazio e erro. (FEITO: "Processando…" animado)

Validacao:
- Filtros alteram todos os paineis corretamente.
- KPIs sao consistentes com os graficos.
- Tempo de resposta aceitavel em dados agregados.

### Fase 4 - Visao Auditoria — CONCLUIDA (2026-09-22)

Objetivo:
- Implementar auditoria com seguranca e filtros restritivos.

Atividades (status):
- Criar fatos agregadas de auditoria (anomalias). (FEITO: AN1–AN4 com severidade 2x/3x/5x)
- Criar tela com filtros obrigatorios. (FEITO: periodo + tipo de anomalia)

Validacao:
- Auditoria mostra apenas agregados, sem registros individuais.
- Auditoria exige periodo/filtros.

### Fase 5 - Operacao — EM ANDAMENTO

Objetivo:
- Preparar para uso continuo.

Atividades (status):
- Configurar agendamento diario. (FEITO no codigo: `jobs.py scheduler`; falta agendar no Windows Task Scheduler)
- Implementar botao de atualizacao manual. (FEITO: `POST /api/admin/refresh-jobs` + worker)
- Criar monitoramento de falhas. (FEITO: status/mensagem em `dashboard_refresh_job`; visivel no cabecalho)
- Criar documentacao de instalacao e operacao. (FEITO 2026-09-22: `etl/README.md` e `web/README.md`)
- Definir rotina de backup do banco do dashboard. (PENDENTE)

Validacao:
- Job programado roda sozinho.
- Atualizacao manual funciona.
- Falhas sao visiveis e nao quebram a ultima versao valida dos dados.

## 13. Riscos e Mitigacoes

Risco: consultas lentas na base origem.
- Mitigacao: cargas incrementais, agregados, janelas pequenas e evitar `count(*)` amplo.

Risco: exposicao de dados pessoais ou sensiveis.
- Mitigacao: minimizacao, mascaramento, allowlist, perfis de acesso e logs.

Risco: definicoes funcionais ambiguas.
- Mitigacao: registrar conceitos como "medico ativo", "nao assinado", "AE/CD" e "inativo" antes da implementacao final.

Risco: auditoria com volume muito alto.
- Mitigacao: nao usar a tabela de auditoria relacional; anomalias derivadas das fatos com media de referencia de todos os medicos, somente agregados, filtros obrigatorios e limites.

Risco: atualizacao manual concorrente.
- Mitigacao: lock de job e status unico de execucao.

Risco: ETL incremental sem indices temporais na origem (`dh_documento`, `dt_consulta`, `dh_historico_dispensacao` sem indice confirmado).
- Mitigacao: pedir indices ao DBA, usar watermark por PK sequencial, processar em lotes e validar por periodo.

Risco: dependencia de mapa externo.
- Mitigacao: usar GeoJSON local do Brasil no MVP.

## 14. Decisoes Registradas (Fase 0 concluida)

### Decisoes (2026-09-21)

1. Assinatura de dispensacao: um unico tipo; assinada = `tb_dispensacao.in_assinado='S'`. Sem distincao AE/CD.
2. UF dos documentos: UF da unidade de atendimento (`tb_unidade_atendimento.sg_uf`).
3. Medico ativo: REVOGADA em 2026-09-23 a regra `tb_medico.in_situacao='A'`; nova regra: CPF unico de medicos com aceite do termo (`tb_usuario.dh_aceite_termo`).
4. Novos medicos por mes: usar `tb_usuario.dh_aceite_termo` (aceite do termo). REVOGADA em 2026-09-23 a regra anterior (`dh_atualizacao` como proxy de cadastro — invalidada por atualizacao em massa da origem).
5. Indices: solicitar ao DBA indices em `tb_consulta_documento.dh_documento`, `tb_consulta.dt_consulta`, `tb_historico_dispensacao.dh_historico_dispensacao` e FKs de dispensacao.
6. Auditoria: nao usar a tabela de auditoria da base relacional; visao alimentada somente por anomalias das fatos, com media de referencia calculada sobre todos os medicos.
7. Base analitica (datamart) provisionada e testada (2026-09-21): base `prescricao_dw` em `172.16.7.112:5432`, PostgreSQL 13.7, usuario `usr_prescricao_dw` com gravacao confirmada (create/insert/select/drop) nos schemas `prescricao` e `staging` (ambos de propriedade do usuario) e em `public`.
   - Restricao confirmada: usuario NAO pode criar schemas (sem CREATE no database); usar os schemas existentes `prescricao`/`staging`.
   - Base atualmente vazia (nenhum objeto).
   - Credenciais em variaveis de ambiente/cofre; nunca versionadas.
8. Provedor de autenticacao (2026-09-21): Google OAuth; somente e-mails `@portalmedico.org.br` terao acesso (validacao de dominio server-side).
9. ETL (2026-09-21): aplicacao Python em ambiente Windows (scheduler + worker com fila de jobs no `prescricao_dw`).
10. Configuracao do horario de carga (2026-09-21): restrita a `mrichard@portalmedico.org.br`.
11. Horario padrao da atualizacao diaria (2026-09-21): 02:00 BRT (timezone America/Sao_Paulo).
12. Janela historica do MVP (2026-09-21): desde 2021-11 (inicio confirmado da origem).
13. Hospedagem (2026-09-21): servidor interno existente (mesmo ambiente Windows do ETL).
14. Perfis de acesso (2026-09-21): perfil unico — todos os usuarios do dominio veem as quatro visões; sem perfis separados.
15. Exportacao CSV/Excel (2026-09-21): NAO permitida no MVP.
16. Auditoria (2026-09-21): somente agregados; sem registros individuais.
17. Auditoria do uso do dashboard (2026-09-21): NAO havera (sem registro de logins, acessos ou consultas dos usuarios); tabela `dashboard_access_log` removida do modelo.
18. Topologia (2026-09-21): aplicacao web (UI + API) e ETL (Python) em maquinas Windows separadas; comunicacao exclusivamente via fila de jobs no `prescricao_dw`.
19. Anomalias (2026-09-21): media de referencia calculada sobre todos os medicos (nunca o historico individual do emissor).
20. Design system (2026-09-21): padrao "cyberpunk dark" aprovado (referencia PE_Dashboard_Cyberpunk); tema escuro com acentos ciano/verde/violeta/laranja, sidebar fixa, grade 12 colunas; draft em `design/draft_dashboard.html`.

Fase 0 concluida: todas as confirmacoes previstas foram respondidas.

## 15. Criterios de Sucesso do MVP

- Login restrito a e-mails `@portalmedico.org.br` (Google OAuth).
- Tres visões acessiveis por menu (Dispensacoes descontinuada em 2026-09-23).
- Documentos e medicos com KPIs, filtros, mapa, rankings e series temporais.
- Auditoria somente agregada, com filtros obrigatorios e consultas registradas.
- Atualizacao diaria programavel (padrao 02:00 BRT, configuravel por `mrichard@portalmedico.org.br`).
- Atualizacao manual por botao com status visivel.
- Sem exportacao CSV/Excel.
- Nenhuma tela depende de consulta direta pesada em tabela transacional grande.
- A base `bd_cfm` e acessada somente para leitura.
- Toda gravacao ocorre apenas no datamart (`prescricao_dw`).
- Nenhum dado pessoal sensivel e exibido por padrao.
- Ultima atualizacao dos dados sempre visivel para o usuario.
