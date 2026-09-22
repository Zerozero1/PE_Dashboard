# RESUMO AUDITADO DA BASE - bd_cfm

_Atualizado em: 2026-09-21_
_Fonte de validação: MCP PostgreSQL, usuário `usr_select`_
_Banco: `bd_cfm` em `172.16.2.177:5432`_
_PostgreSQL: 13.8 (Debian 13.8-0+deb11u1)_

---

## 1. Escopo e Conclusão da Revisão

Este documento revisa e corrige o resumo anterior da base `bd_cfm`, com foco no que pode ser confirmado via catálogo PostgreSQL e consultas somente leitura pelo usuário `usr_select`.

Conclusão: o documento anterior estava bom como leitura funcional do módulo de Prescrição Eletrônica, mas não estava completo e continha um erro estrutural importante: a base possui constraints declaradas de `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE` e `CHECK`. Portanto, não é correto dizer que a integridade referencial é apenas responsabilidade da aplicação.

Principais correções:

- PostgreSQL atual confirmado: `13.8`, não `13.7`.
- Existem schemas adicionais no catálogo além de `prescricao`, `prestador` e `public`: `central_seguranca`, `corporativo`, `financeiro`, `medico` e `cfm_pg_stat`; o usuário atual não tem `SELECT` neles.
- O schema `prescricao` possui 50 tabelas e 1 view no catálogo, mas apenas 37 tabelas são consultáveis por `usr_select`.
- O schema `prestador` possui 62 tabelas no catálogo, mas apenas 19 são consultáveis por `usr_select`.
- Há constraints declaradas: em `prescricao`, 49 PKs, 58 FKs, 11 UNIQUEs e 41 CHECKs; em `prestador`, 62 PKs, 90 FKs e 8 UNIQUEs.
- O módulo `prestador` está estruturalmente maior do que o resumo original mostrava; várias tabelas existem, porém sem permissão de leitura para `usr_select`.

Observação sobre completude: informações de tabelas sem permissão foram extraídas do catálogo (`pg_class`, `pg_constraint`, tamanhos e estimativas), não do conteúdo das tabelas.

---

## 2. Visão Geral Funcional

A base sustenta uma solução de Prescrição Eletrônica ligada ao ecossistema CFM/CRMs. O núcleo consultável está no schema `prescricao` e registra:

- pessoas, médicos, pacientes, farmacêuticos, unidades de atendimento e contatos;
- vínculos médico-paciente, médico-unidade e médico-especialidade;
- consultas e documentos médicos digitais;
- receitas e medicamentos prescritos;
- dispensação por farmácia/farmacêutico;
- sessões, solicitações de login, parâmetros e logs auxiliares;
- tabelas de domínio como UF, município e tipo de documento.

Fluxo principal confirmado por chaves declaradas:

```text
tb_pessoa
  -> tb_medico / tb_paciente / tb_farmaceutico / tb_usuario / tb_unidade_atendimento
  -> tb_email / tb_telefone / tb_endereco

tb_medico + tb_paciente
  -> rl_medico_paciente
  -> tb_consulta
  -> tb_consulta_documento
  -> tb_receita
  -> rl_dispensacao_receita
  -> tb_historico_dispensacao

tb_dispensacao
  -> tb_farmaceutico
  -> tb_pessoa como farmacia
  -> rl_dispensacao_receita
```

O schema `prestador` representa cadastro de empresas/prestadores de servico de saude, com estrutura para empresa, documentos, corpo clinico, socios, diretores, servicos, especialidades, recursos humanos e materiais. As tabelas consultaveis estavam vazias pelas estimativas do catalogo.

---

## 3. Schemas no Banco

Visao via `pg_catalog`:

| Schema | Tabelas | Views | Objetos com SELECT | Objetos sem SELECT | Observacao |
|---|---:|---:|---:|---:|---|
| `central_seguranca` | 19 | 0 | 0 | 19 | Segurança/perfis/usuarios centrais; sem leitura. |
| `cfm_pg_stat` | 1 | 0 | 0 | 1 | Apoio a estatisticas; sem leitura. |
| `corporativo` | 106 | 2 | 0 | 108 | Cadastros corporativos CFM/CRM; sem leitura. |
| `financeiro` | 15 | 1 | 0 | 16 | Financeiro; sem leitura. |
| `medico` | 30 | 0 | 0 | 30 | Cadastro/inscricao medica corporativa; sem leitura. |
| `prescricao` | 50 | 1 | 37 | 14 | Nucleo da Prescricao Eletronica. |
| `prestador` | 62 | 0 | 19 | 43 | Cadastro de empresas/prestadores. |
| `public` | 14 | 1 | 1 | 14 | Objetos JHipster/Spring Batch/Liquibase sem leitura e `pg_stat_statements` consultavel. |

Via `information_schema.tables`, que respeita privilegios, aparecem apenas:

| Schema | Tabelas visiveis | Views visiveis |
|---|---:|---:|
| `prescricao` | 37 | 0 |
| `prestador` | 19 | 0 |
| `public` | 0 | 1 |

---

## 4. Convenções de Nomenclatura

As convencoes observadas no documento anterior continuam coerentes:

| Prefixo | Uso observado |
|---|---|
| `tb_` | Tabelas transacionais ou entidades principais. |
| `td_` | Tabelas de dominio/de-para. |
| `tl_` | Tabelas de log/auditoria. |
| `rl_` | Tabelas relacionais/associativas. |
| `vw_` | Views. |

Padrões de colunas:

| Prefixo | Significado usual |
|---|---|
| `id_` | Identificador/chave. |
| `nu_` | Numero/documento/codigo numerico textual. |
| `nm_` | Nome. |
| `ds_` | Descricao, hash, relatorio, caminho ou texto descritivo. |
| `tx_` | Texto mais longo ou identificador externo. |
| `dt_` | Data. |
| `dh_` | Data-hora. |
| `in_` | Indicador/status/flag. |
| `sg_` | Sigla. |
| `co_` | Codigo externo. |
| `ar_`, `im_` | Binario/arquivo/imagem. |

---

## 5. Integridade, Chaves e Índices

Correção importante: há constraints declaradas no banco.

Resumo de constraints confirmadas:

| Schema | PK | FK | UNIQUE | CHECK |
|---|---:|---:|---:|---:|
| `prescricao` | 49 | 58 | 11 | 41 |
| `prestador` | 62 | 90 | 8 | 0 |

Pontos confirmados:

- As principais tabelas possuem `PRIMARY KEY` declarada.
- Os relacionamentos centrais de prescricao possuem `FOREIGN KEY` declarada.
- Ha `CHECK` para flags como ativo, assinado, cancelado, sexo, status, tipo de plataforma e outros indicadores.
- Existem indices adicionais relevantes, inclusive:
  - `tb_pessoa.nu_cpf`;
  - `tb_medico.(nu_crm, sg_uf)` unico;
  - `tb_consulta_documento.ds_qrcode` unico;
  - `tb_consulta_documento.id_consulta`;
  - `tb_receita.id_consulta_documento`;
  - `tb_receita.id_medicamento`;
  - `rl_medico_paciente.(id_paciente, id_medico)` e `(id_medico, id_paciente)`.

Ponto de performance confirmado:

- Nao foi encontrado indice em `prescricao.tb_consulta_documento(dh_documento)`.
- Como `tb_consulta_documento` tem aproximadamente 60,4 milhoes de linhas e 43 GB, consultas filtrando por periodo em `dh_documento` podem exigir varredura grande se nao houver outro predicado seletivo.
- Tambem nao ha indices em `tb_consulta.dt_consulta`, `tb_dispensacao.dh_documento`, `tb_dispensacao.id_farmacia`, `tb_dispensacao.id_farmaceutico`, `tb_historico_dispensacao.id_dispensacao_receita` nem `tb_historico_dispensacao.dh_historico_dispensacao` (confirmado no catalogo).
- `tb_historico_dispensacao.id_dispensacao_receita` e FK sem indice; joins com `rl_dispensacao_receita` exigem hash join/varredura.

---

## 6. Fatos de Escala

Os numeros abaixo sao estimativas do catalogo PostgreSQL (`pg_class.reltuples`) e podem divergir de `count(*)`, mas sao adequados para dimensionamento sem forcar leituras pesadas.

### Maiores tabelas de `prescricao`

| Tabela | Linhas estimadas | Tamanho total |
|---|---:|---:|
| `tl_prescricao_auditoria_20260702_old` | 2.135.224.448 | 262 GB |
| `tl_prescricao_auditoria` | 282.322.560 | 42 GB |
| `tb_consulta_documento` | 60.356.520 | 43 GB |
| `tb_consulta` | 59.969.884 | 5.563 MB |
| `tb_receita` | 51.623.096 | 10.183 MB |
| `rl_med_especialidade_consulta` | 40.158.156 | 3.697 MB |
| `tb_pessoa` | 22.864.146 | 2.955 MB |
| `tb_endereco` | 19.077.152 | 2.197 MB |
| `rl_medico_paciente` | 18.094.666 | 2.474 MB |
| `tb_paciente` | 17.778.008 | 1.228 MB |
| `tb_medicamento` | 14.737.237 | 2.021 MB |
| `tb_historico_email` | 8.444.800 | 822 MB |
| `tb_solicitacao_login` | 8.405.955 | 1.819 MB |
| `tb_sessao_ativa_usuario` | 3.966.356 | 1.594 MB |
| `rl_dispensacao_receita` | 3.941.724 | 412 MB |
| `tb_telefone` | 4.338.575 | 876 MB |
| `tb_historico_dispensacao` | 4.070.362 | 354 MB |
| `tb_email` | 3.807.300 | 708 MB |
| `tb_dispensacao` | 3.268.009 | 337 MB |

### Observações de escala

- O núcleo operacional de consultas/documentos/receitas passa de dezenas de milhoes de linhas.
- A maior tabela por volume é a auditoria antiga `tl_prescricao_auditoria_20260702_old`.
- `tb_medico` tem tamanho total muito alto para a cardinalidade (~605 mil linhas, 15 GB), provavelmente impactado por coluna binaria `ds_foto bytea`.
- O schema `prestador`, pelas estimativas do catalogo, esta vazio no momento da verificacao.

---

## 7. Dicionário Resumido - Schema `prescricao`

### Cadastros e pessoas

| Tabela | Linhas estimadas | Papel |
|---|---:|---|
| `tb_pessoa` | 22.864.146 | Entidade central de pessoa. Guarda nome, tipo, CPF, CNPJ, nome fantasia/social, CNS e passaporte. |
| `tb_paciente` | 17.778.008 | Dados de paciente; PK tambem referencia `tb_pessoa.id_pessoa`; contem nascimento, sexo, mae, responsavel legal e integracao externa. |
| `tb_medico` | 605.518 | Registro de medico por CRM/UF, situacao, tipo de inscricao, pessoa e foto. Nao possui data de cadastro (somente `dh_atualizacao`). `ds_foto` e `bytea` e domina o tamanho (~15 GB). |
| `tb_medico_especialidade` | 310.516 | Especialidades/areas de atuacao do medico, RQE e flags. |
| `tb_farmaceutico` | 65.996 | Farmaceutico por CRF/UF, ligado a pessoa. |
| `tb_unidade_atendimento` | 565.325 | Unidade/local de atendimento; PK referencia `tb_pessoa.id_pessoa`; guarda CRM/UF, CNES, logomarca e origem externa. |
| `tb_usuario` | 483.239 | Conta de usuario vinculada a pessoa e termo aceito; contem hash de senha. |
| `tb_endereco` | 19.077.152 | Enderecos de pessoas, incluindo municipio e indicador principal. |
| `tb_telefone` | 4.338.575 | Telefones de pessoas. |
| `tb_email` | 3.807.300 | Emails de pessoas. |

### Vínculos

| Tabela | Linhas estimadas | Papel |
|---|---:|---|
| `rl_medico_paciente` | 18.094.666 | Relaciona medico e paciente; possui unicidade declarada para o par. |
| `rl_medico_unidade_atendimento` | 544.161 | Relaciona medico e unidade de atendimento. |
| `rl_med_especialidade_unidade` | 234.920 | Relaciona especialidade do medico e unidade. |
| `rl_med_especialidade_consulta` | 40.158.156 | Relaciona consulta e especialidade usada. |
| `rl_modelo_medicamento` | 1.401.384 | Medicamentos associados a modelos de documento. |
| `rl_dispensacao_receita` | 3.941.724 | Relaciona dispensacao e receita; inclui observacao e medicamento substituto. |

### Atendimento, documentos e receita

| Tabela | Linhas estimadas | Papel |
|---|---:|---|
| `tb_consulta` | 59.969.884 | Evento de atendimento, ligado a medico-paciente e medico-unidade. |
| `tb_consulta_documento` | 60.356.520 | Documento emitido na consulta; tipo, relatorio, data-hora, assinatura, cancelamento, QR Code, caminho do PDF, CID e campos de atestado. |
| `tb_receita` | 51.623.096 | Item de receita ligado ao documento e ao medicamento; posologia, continuo, duracao, concentracao e observacao. |
| `tb_medicamento` | 14.737.237 | Catalogo/texto de medicamento por medico. |
| `tb_dispensacao` | 3.268.009 | Evento de dispensacao por farmacia/farmaceutico; assinatura, cancelamento, hash, QR Code e caminho. Porem `dh_documento`, `ds_hash`, `ds_qrcode` e `tx_caminho` sao ~99,97% NULL (apenas 895 linhas possuem `dh_documento`, todas com `in_assinado='S'`). O evento temporal real esta em `tb_historico_dispensacao`. |
| `tb_historico_dispensacao` | 4.070.362 | Historico/status da dispensacao de uma receita. Coluna temporal `dh_historico_dispensacao` 100% preenchida (2021-11-05 a 2026-09-21). `in_status`: D=99%, C=0,96%, A=0,02%. Fonte correta para series temporais de dispensacao. |
| `tb_modelo` | 1.535.190 | Modelos/templates de documentos por medico e tipo de documento. |
| `tb_historico_email` | 8.444.800 | Log de envio de email de documentos por medico/tipo/destinatario. |

### Domínios, parâmetros e apoio

| Tabela | Linhas estimadas | Papel |
|---|---:|---|
| `td_tipo_documento` | 16 | Tipos de documentos medicos. |
| `td_uf` | 28 | UFs brasileiras e regiao/populacao. |
| `td_municipio` | 10.980 | Municipios, IBGE/DNE, capital e UF. |
| `tb_conselho` | 28 | CFM/CRMs/delegacias, CNPJ, site e flags. |
| `tb_validade_documento` | 3 | Validade de tipos de receita. |
| `tb_parametro` | 18 | Parametros de configuracao. Pode conter dados sensiveis de configuracao; nao expor valores. |
| `tb_campanha` | 2 | Campanhas de pesquisa. |
| `tb_pesquisa` | 53.031 | Respostas/convites de pesquisa. |
| `tb_medicamentos_anvisa` | 1.404 | Referencia de medicamentos ANVISA. |
| `tb_termo` | 1 | Termo vigente/armazenado. |
| `tb_sessao_ativa_usuario` | 3.966.356 | Sessoes por login, IP, agente, status e plataforma. |
| `tb_solicitacao_login` | 8.405.955 | Tokens/segredos de solicitacao de login; tratar como sensivel. |
| `tl_prescricao_auditoria_20260702_old` | 2.135.224.448 | Auditoria antiga consultavel; grande volume. |

---

## 8. Tipos de Documento Confirmados

| ID | Documento | Ativo |
|---:|---|---|
| 1 | Atestado Médico | S |
| 2 | Receita Simples | S |
| 3 | Solicitação de Exame | S |
| 4 | Relatório Médico | S |
| 5 | Antimicrobiano | S |
| 6 | Controle Especial | S |
| 8 | Laudo Médico | S |
| 9 | Parecer Técnico | S |
| 10 | Relatório Médico - Tema STF 1234 | N |
| 11 | Atestado de Afastamento | S |
| 12 | Atestado de Acompanhamento | S |
| 13 | Atestado de Comparecimento | S |
| 14 | Atestado de Saúde | S |
| 15 | Declaração de Óbito | N |
| 16 | Sumário de Alta | N |
| 17 | Laudo de Medicamentos Especializados | S |

Validades confirmadas:

| Documento | Dias | Tipo validade |
|---|---:|---|
| Receita Simples | 30 | C |
| Antimicrobiano | 10 | C |
| Controle Especial | 30 | C |

---

## 9. Relações Confirmadas - `prescricao`

Relações centrais declaradas por FK:

```text
tb_medico.id_pessoa -> tb_pessoa.id_pessoa
tb_paciente.id_paciente -> tb_pessoa.id_pessoa
tb_paciente.id_responsavel_legal -> tb_pessoa.id_pessoa
tb_farmaceutico.id_pessoa -> tb_pessoa.id_pessoa
tb_unidade_atendimento.id_unidade_atendimento -> tb_pessoa.id_pessoa
tb_usuario.id_pessoa -> tb_pessoa.id_pessoa
tb_email.id_pessoa -> tb_pessoa.id_pessoa
tb_telefone.id_pessoa -> tb_pessoa.id_pessoa
tb_endereco.id_pessoa -> tb_pessoa.id_pessoa

rl_medico_paciente.id_medico -> tb_medico.id_medico
rl_medico_paciente.id_paciente -> tb_paciente.id_paciente
rl_medico_unidade_atendimento.id_medico -> tb_medico.id_medico
rl_medico_unidade_atendimento.id_unidade_atendimento -> tb_unidade_atendimento.id_unidade_atendimento
tb_medico_especialidade.id_medico -> tb_medico.id_medico

tb_consulta.id_medico_paciente -> rl_medico_paciente.id_medico_paciente
tb_consulta.id_medico_unidade_atendimento -> rl_medico_unidade_atendimento.id_medico_unidade_atendimento
tb_consulta_documento.id_consulta -> tb_consulta.id_consulta
tb_consulta_documento.id_tipo_documento -> td_tipo_documento.id_tipo_documento
tb_consulta_documento.id_cid -> td_cid.id_cid
rl_med_especialidade_consulta.id_consulta -> tb_consulta.id_consulta
rl_med_especialidade_consulta.id_medico_especialidade -> tb_medico_especialidade.id_medico_especialidade

tb_receita.id_consulta_documento -> tb_consulta_documento.id_consulta_documento
tb_receita.id_medicamento -> tb_medicamento.id_medicamento
tb_medicamento.id_medico -> tb_medico.id_medico

tb_dispensacao.id_farmacia -> tb_pessoa.id_pessoa
tb_dispensacao.id_farmaceutico -> tb_farmaceutico.id_farmaceutico
rl_dispensacao_receita.id_dispensacao -> tb_dispensacao.id_dispensacao
rl_dispensacao_receita.id_receita -> tb_receita.id_receita
tb_historico_dispensacao.id_dispensacao_receita -> rl_dispensacao_receita.id_dispensacao_receita

tb_modelo.id_medico -> tb_medico.id_medico
tb_modelo.id_consulta_documento -> tb_consulta_documento.id_consulta_documento
tb_modelo.id_tipo_documento -> td_tipo_documento.id_tipo_documento
rl_modelo_medicamento.id_modelo -> tb_modelo.id_modelo
rl_modelo_medicamento.id_medicamento -> tb_medicamento.id_medicamento

tb_historico_email.id_medico -> tb_medico.id_medico
tb_historico_email.id_tipo_documento -> td_tipo_documento.id_tipo_documento
tb_historico_email.id_pessoa_destinatario -> tb_pessoa.id_pessoa

td_municipio.sg_uf -> td_uf.sg_uf
tb_farmaceutico.sg_uf -> td_uf.sg_uf
tb_unidade_atendimento.sg_uf -> td_uf.sg_uf
tb_validade_documento.id_tipo_documento -> td_tipo_documento.id_tipo_documento
tb_pesquisa.id_campanha -> tb_campanha.id_campanha
tb_pesquisa.id_pessoa -> tb_pessoa.id_pessoa
```

Relações com tabelas sem permissão tambem existem, por exemplo:

- `tb_consulta_documento.id_cid -> td_cid.id_cid`
- `tb_paciente.id_orgao_externo -> tb_orgao_externo.id_orgao_externo`
- `tb_unidade_atendimento.id_orgao_externo -> tb_orgao_externo.id_orgao_externo`
- tabelas LME relacionadas a `td_cid`, `tb_lme`, `tb_item_lme`, `tb_medicamentos_lme` e `td_medicamento_lme_tipo`.

---

## 10. Objetos Sem Permissão de Leitura Relevantes

### `prescricao`

| Objeto | Tipo | Linhas estimadas | Tamanho |
|---|---|---:|---:|
| `rl_medicamento_lme_cid` | table | 2.052 | 208 kB |
| `tb_consulta_informed` | table | 5.507.857 | 479 MB |
| `tb_item_lme` | table | 28.817 | 3.904 kB |
| `tb_lme` | table | 21.821 | 6.240 kB |
| `tb_local_retirada_lme` | table | 38 | 64 kB |
| `tb_medicamentos_lme` | table | 2.859 | 376 kB |
| `tb_medicamentos_manole` | table | 1.725 | 408 kB |
| `tb_orgao_externo` | table | 0 | 16 kB |
| `td_cid` | table | 14.907 | 2.912 kB |
| `td_medicamento_lme_tipo` | table | 2 | 56 kB |
| `td_tipo_assinatura` | table | 8 | 56 kB |
| `td_tipo_consulta` | table | 6 | 56 kB |
| `tl_prescricao_auditoria` | table | 282.322.560 | 42 GB |
| `vw_login_farmaceutico` | view | 0 | 0 bytes |

### `prestador`

Ha 43 objetos sem permissao de leitura no schema `prestador`. Todos tinham estimativa de 0 linhas no momento da verificacao. Eles incluem:

`tb_pre_empresa*`, `rl_pre_empresa*`, `tb_classificacao*`, `tb_recurso_humano`, `tb_recurso_material`, `tb_regulacao_servico`, `tb_servico_medico`, `tb_tipo_documento`, `tb_tipo_gestao_empresa`, `tb_tipo_recurso_material`, `tb_vinculo`, `td_atividade`, `td_situacao`, `td_abrangencia_empresa`, `td_categoria_natureza`, `td_caracteristica_natureza` e tabelas de historico correspondentes.

---

## 11. Schema `prestador`

Tabelas consultaveis e confirmadas como vazias pelas estimativas:

| Tabela | Papel provavel |
|---|---|
| `tb_empresa` | Empresa/prestador principal, ligada a pessoa de `central_seguranca`, UF de `corporativo`, natureza juridica, funcionamento e flags de conformidade. |
| `tb_empresa_documento` | Documentos regulatórios: registro, licença sanitária, licença de funcionamento, CNES, NIRE. |
| `tb_empresa_documento_comprobatorio` | Arquivos comprobatórios (`bytea`) com nome, extensao e tamanho. |
| `tb_empresa_corpo_clinico` | Corpo clinico e atas/regimentos. |
| `tb_empresa_diretor` | Diretores da empresa. |
| `tb_empresa_socio` | Socios, pessoa e inscricao medica. |
| `tb_empresa_mantenedora` | Mantenedora. |
| `tb_empresa_terceiro` | Terceiros/pessoas associadas e permissao. |
| `tb_empresa_atividade` | Atividades da empresa. |
| `tb_empresa_classificacao` | Classificacoes da empresa. |
| `tb_empresa_servico` | Servicos medicos prestados. |
| `tb_empresa_recurso_humano` | Recursos humanos e quantidade. |
| `tb_empresa_recurso_material` | Recursos materiais e quantidade. |
| `tb_empresa_capital_social` | Historico/valor de capital social. |
| `tb_empresa_apae` | Periodos de vinculacao APAE. |
| `rl_empresa_especialidade` | Especialidades por empresa. |
| `rl_empresa_area_atuacao` | Areas de atuacao por especialidade da empresa. |
| `rl_empresa_corpo_clinico_medico` | Medicos no corpo clinico. |
| `rl_empresa_servico_chefia` | Chefia medica de servicos. |

Ponto de modelagem: `prestador` referencia outros schemas sem leitura pelo usuario atual, especialmente `central_seguranca`, `corporativo` e `medico`.

---

## 12. Riscos e Cuidados para Dashboard

1. Dados sensiveis
   - A base contem CPF, CNPJ, CNS, passaporte, nomes, contatos, IPs, user-agent, tokens e segredos de login.
   - Para dashboards, evitar expor `ds_access_token`, `ds_secret`, `ds_senha`, CPFs completos, CNPJs completos, emails e telefones quando nao forem necessarios.

2. Performance
   - Evitar `count(*)` sem filtros em tabelas grandes.
   - Evitar filtros livres em `ds_relatorio`, `tx_caminho`, `ds_medicamento` e campos textuais grandes sem estrategia.
   - Priorizar filtros por chaves indexadas (`id_*`, `ds_qrcode`, `nu_cpf`, CRM/UF) ou materializacoes/ETL.
   - Criar tabela fato agregada para dashboard: medico x dia x unidade x tipo_documento, com metricas de documentos, pacientes, receitas, cancelamentos e assinaturas.

3. Datas
   - Para analises temporais de documentos, a coluna natural é `tb_consulta_documento.dh_documento`.
   - Para consultas, existe `tb_consulta.dt_consulta`.
   - Para dispensacao, existe `tb_dispensacao.dh_documento`.
   - Como nao foi encontrado indice em `dh_documento`, dashboards temporais devem preferir carga incremental/agregada.

4. Auditoria
   - `tl_prescricao_auditoria_20260702_old` e `tl_prescricao_auditoria` somam centenas de GB.
   - `tl_prescricao_auditoria` (atual) nao e consultavel por `usr_select`.
   - Decisao (2026-09-21): o dashboard nao usara a tabela de auditoria relacional; a visao Auditoria sera alimentada somente por anomalias das fatos, com media de referencia calculada sobre todos os medicos.

5. Permissoes
   - `usr_select` e somente leitura.
   - Algumas FKs apontam para tabelas sem `SELECT`; joins diretos podem falhar mesmo quando a constraint aparece no catalogo.

---

## 13. Avaliação do Documento Original

O documento original estava correto em linhas gerais sobre:

- natureza funcional da base como Prescrição Eletrônica;
- principais tabelas de `prescricao`;
- papel de consultas, documentos, receitas, dispensações e vínculos;
- existencia de tabelas LME sem permissao;
- escala aproximada das maiores tabelas;
- existencia de `prestador` como modulo de cadastro de empresas.

O documento original precisava de correção/complemento em:

- versao do PostgreSQL: confirmar `13.8`;
- completude de schemas: incluir schemas sem leitura e explicar a diferenca entre catalogo e `information_schema`;
- integridade: substituir a afirmacao de inexistencia de PK/FK por resumo de constraints declaradas;
- volumes: atualizar estimativas, especialmente `tb_historico_email`, `rl_med_especialidade_consulta`, `tb_parametro` e `tb_consulta_informed`;
- `public`: nao e apenas `pg_stat_statements` no catalogo; existem objetos Spring Batch/JHipster/Liquibase sem permissao de leitura;
- `prestador`: existem 62 tabelas no catalogo, nao apenas as 19 consultaveis.

---

## 14. Recomendações Práticas para o PE Dashboard

Modelo minimo recomendado:

- `dim_medico`: `id_medico`, CRM, UF, situacao, tipo inscricao, dados minimizados da pessoa.
- `dim_paciente`: apenas identificador tecnico e atributos agregaveis, sem expor CPF/nome por padrao.
- `dim_unidade`: `id_unidade_atendimento`, UF, CNES quando necessario.
- `dim_tipo_documento`: baseada em `td_tipo_documento`.
- `fato_documento_dia`: por dia, medico, unidade, tipo_documento, com contagens de documentos, assinados, cancelados, pacientes distintos e receitas.
- `fato_dispensacao_dia`: por dia, farmacia/farmaceutico/tipo ou receita, com contagens de dispensacoes, cancelamentos e status historico.
- `fato_sessao_dia`: por dia/plataforma/status, para uso operacional, sem dados pessoais.

Consultas operacionais devem sempre aplicar:

- limite de linhas;
- filtro temporal quando possivel;
- mascara/ocultacao de identificadores pessoais;
- allowlist de tabelas e colunas;
- bloqueio de acesso a colunas sensiveis (`ds_senha`, `ds_access_token`, `ds_secret`, campos pessoais completos) quando o dashboard nao exigir auditoria nominal.

---

## 15. Adendos de Validação (2026-09-21)

Confirmados via MCP nesta revisão:

1. Permissões:
   - `tl_prescricao_auditoria` (tabela atual, 282M linhas) **não** tem SELECT para `usr_select`; apenas `tl_prescricao_auditoria_20260702_old` é consultável.
   - `td_tipo_assinatura` (8 linhas, colunas `id_tipo_assinatura`, `ds_tipo_assinatura`, `in_situacao_tipo_assinatura`) existe no catálogo sem SELECT.
   - Existe tabela anômala `prescricao.pk_assinatura` (uma coluna: `id_tipo_assinatura`); aparente resíduo de renomeação, irrelevante para o dashboard.

2. Distribuições de valores (via `pg_stats` e contagens leves):
   - `tb_consulta_documento.in_assinado`: S=96,1%, N=3,9%. `in_cancelado`: N=99,3%, S=0,66%. `ds_origem_criacao`: WEB, WEB-MOBILE (72,9% NULL).
   - `tb_medico.in_situacao`: A=65,1%, NULL=19,4%, T=12,2%, L=3,4% + raros (G, E, P, U, J, X, F, N, S, I, O, M, B). `in_tipo_inscricao`: P=70,6%, S=9,9%, V=0,1%, NULL=19,4%.
   - `tb_pessoa.in_tipo_pessoa`: P=81,1%, F=14,1%, U=2,6%, M=1,9%, T=0,3%, R<0,1%. Farmácia é tipo `F`.
   - `tb_endereco.in_principal` é `S` em 100% das linhas; não discrimina endereço principal.
   - `tb_sessao_ativa_usuario`: `in_status` R=84,3%, A=15,7%; `in_tipo_plataforma` W=99,7%, A=0,3%. Coluna temporal: `dt_criacao`.
   - `tb_farmaceutico.sg_uf` 100% preenchido; `tb_unidade_atendimento.sg_uf` tem 0,007% NULL e o valor `BR`.

3. Janela temporal dos dados:
   - `tb_consulta.dt_consulta`: 2021-11-23 a 2026-09-03.
   - `tb_consulta_documento.dh_documento`: 2021-11-30 a 2026-09-07.
   - `tb_historico_dispensacao.dh_historico_dispensacao`: 2021-11-05 a 2026-09-21.
   - A janela histórica "desde 2021" do plano é consistente com a origem.

4. Auditoria:
   - Estrutura de `tl_prescricao_auditoria`: `id_prescricao_auditoria` (bigint), `id_responsavel`, `dh_alteracao` (DATE, não timestamp), `in_tipo_alteracao`, `nm_funcionalidade`, `ds_chave_tabela` (bigint), `nm_campo`, `ds_valor_anterior` (text), `ds_valor_atual` (text).
   - Não existem colunas `status`, `origem` ou `entidade`.
   - Consulta filtrando por `dh_alteracao` na tabela `_old` excedeu timeout do MCP; reforça a necessidade de predicados seletivos e ETL em lotes.

5. Índices ausentes relevantes para ETL (além do já conhecido):
   - `tb_consulta.dt_consulta`
   - `tb_dispensacao.dh_documento`, `id_farmacia`, `id_farmaceutico`
   - `tb_historico_dispensacao.id_dispensacao_receita`, `dh_historico_dispensacao`

6. AE/CD em dispensações: não encontrada coluna consultável que distinga assinatura eletrônica de certificado digital. Decisão (2026-09-21): um único tipo de assinatura; assinada = `tb_dispensacao.in_assinado = 'S'`.

