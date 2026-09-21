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
- Registrar eventos de login, logout, falha de acesso e disparo de atualizacao.

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

```text
Usuario web
  -> App web autenticada
  -> API do dashboard
  -> Banco/tabelas agregadas do dashboard
  -> Job de atualizacao
  -> Base origem bd_cfm, acesso somente leitura
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
- Tabelas de status da carga e logs operacionais do dashboard.
- Este banco/schema proprio e o recurso recomendado para BI: um datamart PostgreSQL com modelo estrela e tabelas agregadas fisicas.
- Arquivos de agregacao, como CSV/Excel, nao devem alimentar o dashboard principal; quando necessarios, devem ser tratados apenas como exportacao, backup analitico ou snapshot auxiliar.

Jobs:
- Carga incremental diaria.
- Reprocessamento historico sob comando administrativo.
- Refresh manual assíncrono com status visivel.

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
- `dia_semana`

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

`dim_farmaceutico`
- `id_farmaceutico`
- `sg_uf`
- situacao/cadastro minimizado

`dim_farmacia`
- `id_farmacia`
- `sg_uf`
- identificador tecnico ou nome fantasia apenas se permitido

### 5.2 Fatos recomendadas

`fato_documento_dia`
- grao: dia + UF + medico + unidade + tipo_documento + especialidade
- metricas:
  - documentos_emitidos
  - documentos_assinados
  - documentos_nao_assinados
  - documentos_cancelados
  - pacientes_distintos
  - receitas_emitidas

`fato_medico_dia`
- grao: dia + UF + especialidade + situacao
- metricas:
  - medicos_cadastrados
  - medicos_ativos
  - inscricoes_ativas
  - medicos_com_documento_emitido
  - medicos_inativos_por_faixa_sem_uso

`fato_dispensacao_dia`
- grao: dia + UF + farmacia + farmaceutico
- FONTE CORRETA: `tb_historico_dispensacao.dh_historico_dispensacao` (status D = dispensada), via `rl_dispensacao_receita`.
  `tb_dispensacao.dh_documento` e ~99,97% NULL (apenas 895 de 3,37M linhas) e nao serve como evento temporal.
- metricas:
  - dispensacoes
  - dispensacoes_assinadas (assinada = `tb_dispensacao.in_assinado = 'S'`; um unico tipo de assinatura, sem distincao AE/CD)
  - pacientes_distintos (via receita -> documento -> consulta -> paciente; join caro, avaliar no ETL)
  - farmacias_distintas
  - farmaceuticos_distintos
  - dispensacoes_canceladas (status C no historico ou `in_cancelado='S'`)

`fato_auditoria_dia` (redefinida - ver secao 6.4)
- Decisao: NAO usar `tl_prescricao_auditoria` (sem SELECT para `usr_select`) nem a tabela antiga (2,1B linhas, consulta inviavel por timeout).
- A visao Auditoria sera alimentada por:
  1. anomalias derivadas das demais fatos (documentos, atendimentos, dispensacoes, locais por periodo acima da media);
  2. trilha de auditoria do proprio dashboard (`dashboard_access_log` e jobs de carga).
- grao: dia + tipo_anomalia + dimensao_afetada
- metricas:
  - ocorrencias
  - intensidade/desvio da media, quando aplicavel
  - eventos de acesso do dashboard (login, falha, exportacao, atualizacao)

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

`dashboard_access_log`
- usuario
- acao
- rota
- status
- criado_em

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
- "Novos medicos por mes": DECISAO — usar `tb_medico.dh_atualizacao` como proxy de cadastro (sem data de cadastro na origem).
- "Medico ativo": DECISAO — `in_situacao = 'A'` (65,1%). NULL (19,4%) e demais valores tratados como nao ativos; expor NULL como categoria propria nos relatorios.
- `in_tipo_inscricao`: P=70,6%, S=9,9%, V=0,1%, NULL=19,4%.

`fato_dispensacao_dia` — FONTE CORRIGIDA:
- `tb_dispensacao.dh_documento` e ~99,97% NULL (895 de 3.368.348 linhas, todas com `in_assinado='S'`).
- Evento temporal real: `tb_historico_dispensacao.dh_historico_dispensacao` (4.050.428 linhas, 2021-11-05 a 2026-09-21; `in_status` D=99%, C=0,96%, A=0,02%).
- Assinatura: DECISAO — um unico tipo; assinada = `tb_dispensacao.in_assinado = 'S'`. Sem distincao AE/CD.
- UF: usar `tb_farmaceutico.sg_uf` (100% preenchido). Farmacia e `tb_pessoa` (`in_tipo_pessoa='F'`, 14,1% das pessoas) sem UF direta; `tb_endereco.in_principal` e 'S' em 100% das linhas e nao discrimina endereco principal.

`fato_auditoria_dia` — REDEFINIDA (decisao 2026-09-21):
- NAO usar a tabela de auditoria da base relacional (`tl_prescricao_auditoria` sem SELECT para `usr_select`; tabela antiga de 2,1B linhas inviavel por timeout).
- A visao Auditoria sera alimentada por anomalias derivadas das demais fatos e pela trilha de acesso do proprio dashboard.

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
- Emissoes por dia da semana.
- Documentos por especialidade.

Filtros:
- Periodo.
- UF.
- Tipo de documento.
- Especialidade.
- Situacao de assinatura.
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
- "Medico ativo" (DECISAO 2026-09-21): `tb_medico.in_situacao = 'A'`. NULL e demais valores sao nao ativos; exibir NULL como categoria propria.
- "Novos medicos por mes" (DECISAO): usar `tb_medico.dh_atualizacao` como proxy de cadastro (na origem nao ha data de cadastro).
- "Inativo" por regra operacional, por exemplo 30/60/90/120 dias sem emissao.

### 6.3 Visao Dispensacoes

Referencia visual:
- Filtros por periodo e estado.
- Totais de farmaceuticos, farmacias, dispensacoes, assinadas e pacientes.
- Status por UF.
- Dispensacoes assinadas com certificado digital.
- Mapa de dispensacoes por UF.
- Series mensais de dispensacoes e farmaceuticos.

Filtros:
- Periodo.
- UF.
- Status da dispensacao.
- Assinatura.
- Farmacia, se permitido.
- Farmaceutico, se permitido.

KPIs:
- Dispensacoes.
- Dispensacoes assinadas (`in_assinado='S'`; tipo unico de assinatura, sem AE/CD).
- Farmaceuticos.
- Farmacias.
- Pacientes distintos.

Graficos:
- Tabela por UF com dispensacoes, com certificado digital e sem certificado.
- Mapa por UF.
- Barras mensais de dispensacoes acumuladas.
- Barras mensais de novas dispensacoes.
- Total de farmaceuticos acumulado.
- Novos farmaceuticos por mes.

Cuidados:
- Assinatura de dispensacao e unica; nao ha distincao AE/CD na origem.
- Ocultar informacoes pessoais de pacientes.
- Usar agregados por UF/farmacia/farmaceutico somente quando houver base legal e necessidade operacional.
- Lembrar que o evento temporal de dispensacao vem de `tb_historico_dispensacao` (status D), nao de `tb_dispensacao.dh_documento` (~100% NULL).

### 6.4 Visao Auditoria

Sem imagem de referencia. DECISOES (2026-09-21):
- Nao usar a tabela de auditoria da base relacional (`tl_prescricao_auditoria` sem SELECT para `usr_select`; tabela antiga inviavel).
- Somente agregados: sem registros individuais no MVP.
- Sem exportacao na visao de auditoria (exportacao nao permitida em todo o MVP).

A visao sera alimentada por:

1. Anomalias derivadas das fatos do datamart (documentos, atendimentos, dispensacoes, locais);
2. Trilha de auditoria do proprio dashboard (`dashboard_access_log` e jobs de carga).

Proposta:
- Tela mais textual e investigativa, com filtros obrigatorios antes de executar consulta.
- Foco em eventos agregados e alertas, nao em exploracao irrestrita.
- Apresentacao do comando SQL que compoe a pesquisa para permitir ajustes finos pelo usuario.

Filtros obrigatorios:
- Periodo curto, com limite padrao e maximo configuravel.
- Tipo de anomalia.
- Dimensao afetada (documentos, atendimentos, dispensacoes, local, acesso).
- Fonte (datamart ou log do dashboard).

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
- Toda consulta de auditoria deve ser registrada em `dashboard_access_log`.
- Perfil unico: todos os usuarios autenticados do dominio podem ver os agregados da auditoria; sem permissao especial no MVP.
- Nao tentar ler `tl_prescricao_auditoria*` (volume extremo e/ou sem permissao).

## 7. Experiencia e Interface

Direcao visual:
- Dashboard profissional, institucional e denso.
- Manter a logica das telas de referencia: barra superior, navegacao lateral, filtros compactos, cards de indicadores e paineis analiticos.
- Melhorar legibilidade para web responsiva com espacos consistentes, contraste adequado e estados de carregamento.

Navegacao:
- Menu lateral com quatro icones/itens:
  - Documentos
  - Medicos
  - Dispensacoes
  - Auditoria
- Cabecalho com:
  - nome do dashboard
  - usuario logado
  - data/hora da ultima atualizacao
  - botao de atualizacao
  - status da carga

Padroes de UX:
- Botao de atualizacao com feedback imediato: "Atualizacao em fila", "Atualizando", "Concluido" ou "Falhou".
- Filtros principais sempre visiveis; filtros avancados recolhidos.
- Skeleton/loading nos paineis durante carregamento.
- Mensagens claras quando nao houver dados.
- Tooltips em indicadores e siglas.
- Acessibilidade por teclado e contraste adequado.

Responsividade:
- Desktop: grade densa com multiplos paineis.
- Tablet: duas colunas principais.
- Celular: experiencia simplificada, com KPIs e graficos empilhados.

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
- Logs de acesso.
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
- Aplicacao ETL em Python executada em ambiente Windows + tabela de jobs no PostgreSQL do dashboard (`prescricao_dw`).

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
- `GET /api/dashboard/dispensacoes`
- `GET /api/dashboard/auditoria`

Observabilidade:
- `GET /api/health`
- `GET /api/admin/audit-log`

## 12. Fases de Implementacao

### Fase 0 - Confirmacoes

Objetivo:
- Fechar definicoes necessarias antes de codar.

Atividades:
- Confirmar provedor de login corporativo. (RESOLVIDO 2026-09-21: Google OAuth)
- Confirmar onde a aplicacao sera hospedada. (RESOLVIDO 2026-09-21: servidor interno existente)
- Confirmar usuario de leitura da base origem. (RESOLVIDO: `usr_select`, somente leitura)
- Confirmar politica de acesso para administradores e auditores. (RESOLVIDO 2026-09-21: perfil unico; config de carga restrita a mrichard@portalmedico.org.br)
- Confirmar janela historica inicial. (RESOLVIDO 2026-09-21: desde 2021-11)
- Confirmar definicoes de medico ativo, inscricao ativa, assinatura AE/CD e inatividade. (RESOLVIDO 2026-09-21: ativo=`in_situacao='A'`; assinatura unica sem AE/CD; novos medicos via `dh_atualizacao`; inatividade por faixas sem emissao)
- Confirmar horario padrao da carga. (RESOLVIDO 2026-09-21: 02:00 BRT)
- Confirmar exportacao. (RESOLVIDO 2026-09-21: nao permitida no MVP)

Entregavel:
- Decisoes registradas no plano ou em ADRs.

### Fase 1 - Fundacao

Objetivo:
- Colocar a aplicacao web no ar com login restrito e layout base.

Atividades:
- Criar projeto web.
- Configurar autenticacao.
- Implementar validacao de dominio.
- Criar shell do dashboard com quatro visões.
- Criar status basico de usuario e permissao.

Validacao:
- Usuario permitido acessa.
- Usuario fora do dominio e bloqueado.
- Rotas de API tambem bloqueiam acesso indevido.

### Fase 2 - Camada de dados

Objetivo:
- Criar estrutura de agregados para alimentar os dashboards.

Atividades:
- Criar schema/tabelas do dashboard.
- Criar usuarios/permissoes: origem somente leitura e dashboard com gravacao restrita.
- Criar carga historica inicial.
- Criar carga incremental.
- Criar tabela de controle de jobs.
- Criar validacoes de contagem por periodo.

Validacao:
- Carga executa em lote.
- Totais mensais batem com consultas de referencia.
- Dashboard nao consulta tabelas brutas grandes em tempo de tela.
- Nenhum job ou rota da aplicacao possui permissao de escrita na base `bd_cfm`.

### Fase 3 - Visões Documentos, Medicos e Dispensacoes

Objetivo:
- Implementar as tres visões com base nas imagens de referencia.

Atividades:
- Construir filtros.
- Criar cards de KPIs.
- Criar mapas.
- Criar rankings e series temporais.
- Criar estados de loading, vazio e erro.

Validacao:
- Filtros alteram todos os paineis corretamente.
- KPIs sao consistentes com os graficos.
- Tempo de resposta aceitavel em dados agregados.

### Fase 4 - Visao Auditoria

Objetivo:
- Implementar auditoria com seguranca e filtros restritivos.

Atividades:
- Criar fatos agregadas de auditoria (anomalias).
- Criar tela com filtros obrigatorios.
- Criar logs de consulta.

Validacao:
- Auditoria mostra apenas agregados, sem registros individuais.
- Auditoria exige periodo/filtros.
- Toda consulta fica registrada.

### Fase 5 - Operacao

Objetivo:
- Preparar para uso continuo.

Atividades:
- Configurar agendamento diario.
- Implementar botao de atualizacao manual.
- Criar monitoramento de falhas.
- Criar documentacao de instalacao e operacao.
- Definir rotina de backup do banco do dashboard.

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
- Mitigacao: nao usar a tabela de auditoria relacional; anomalias derivadas das fatos + trilha de acesso do dashboard, somente agregados, filtros obrigatorios e limites.

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
3. Medico ativo: `tb_medico.in_situacao='A'`; NULL e demais valores tratados como nao ativos.
4. Novos medicos por mes: usar `tb_medico.dh_atualizacao` como proxy de cadastro.
5. Indices: solicitar ao DBA indices em `tb_consulta_documento.dh_documento`, `tb_consulta.dt_consulta`, `tb_historico_dispensacao.dh_historico_dispensacao` e FKs de dispensacao.
6. Auditoria: nao usar a tabela de auditoria da base relacional; visao alimentada por anomalias das fatos + trilha de acesso do dashboard.
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

Fase 0 concluida: todas as confirmacoes previstas foram respondidas.

## 15. Criterios de Sucesso do MVP

- Login restrito a e-mails `@portalmedico.org.br` (Google OAuth).
- Quatro visões acessiveis por menu.
- Documentos, medicos e dispensacoes com KPIs, filtros, mapa, rankings e series temporais.
- Auditoria somente agregada, com filtros obrigatorios e consultas registradas.
- Atualizacao diaria programavel (padrao 02:00 BRT, configuravel por `mrichard@portalmedico.org.br`).
- Atualizacao manual por botao com status visivel.
- Sem exportacao CSV/Excel.
- Nenhuma tela depende de consulta direta pesada em tabela transacional grande.
- A base `bd_cfm` e acessada somente para leitura.
- Toda gravacao ocorre apenas no datamart (`prescricao_dw`).
- Nenhum dado pessoal sensivel e exibido por padrao.
- Ultima atualizacao dos dados sempre visivel para o usuario.
