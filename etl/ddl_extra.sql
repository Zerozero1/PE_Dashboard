-- DDL complementar (executar uma unica vez)

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_origem_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    ds_origem_criacao TEXT NOT NULL,
    documentos BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    documentos BIGINT NOT NULL,
    assinados BIGINT NOT NULL,
    cancelados BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_especialidade_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico_especialidade INTEGER NOT NULL,
    documentos BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_unidade_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    documentos BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_medico_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico INTEGER NOT NULL,
    documentos BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_unidade_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    documentos BIGINT NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_unidade_atendimento)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_medico_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico INTEGER NOT NULL,
    documentos BIGINT NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_medico)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_medico_snapshot (
    sg_uf CHAR(2) PRIMARY KEY,
    inscricoes_cadastradas BIGINT NOT NULL,
    medicos_ativos BIGINT NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices para os padroes de consulta do dashboard
CREATE INDEX IF NOT EXISTS idx_fato_medico_dia_medico
    ON prescricao.fato_documento_medico_dia (id_medico, dia);

CREATE INDEX IF NOT EXISTS idx_fato_especialidade_esp
    ON prescricao.fato_documento_especialidade_dia (id_medico_especialidade, dia);

CREATE INDEX IF NOT EXISTS idx_fato_unidade_un
    ON prescricao.fato_documento_unidade_dia (id_unidade_atendimento, dia);

CREATE INDEX IF NOT EXISTS idx_dim_medico_uf
    ON prescricao.dim_medico (sg_uf);

ALTER TABLE prescricao.dim_medico
    ADD COLUMN IF NOT EXISTS id_pessoa INTEGER;

ALTER TABLE prescricao.dim_medico
    ADD COLUMN IF NOT EXISTS nm_medico VARCHAR(200);

ALTER TABLE prescricao.dim_unidade
    ADD COLUMN IF NOT EXISTS co_cnes VARCHAR(50);

ALTER TABLE prescricao.dim_unidade
    ALTER COLUMN co_cnes TYPE VARCHAR(50);

ALTER TABLE prescricao.dim_unidade
    ADD COLUMN IF NOT EXISTS nm_unidade TEXT;

CREATE INDEX IF NOT EXISTS idx_dim_medico_pessoa
    ON prescricao.dim_medico (id_pessoa);

CREATE INDEX IF NOT EXISTS idx_fato_documento_medico_dia_uf
    ON prescricao.fato_documento_medico_dia (sg_uf, dia);

CREATE INDEX IF NOT EXISTS idx_fato_medico_dia_uf
    ON prescricao.fato_medico_dia (sg_uf, dia);

CREATE TABLE IF NOT EXISTS prescricao.fato_medico_emissao_mes (
    mes CHAR(7) NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    cpfs_distintos BIGINT NOT NULL,
    PRIMARY KEY (mes, sg_uf)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_medico_extremos_emissao (
    sg_uf CHAR(2) NOT NULL,
    id_pessoa INTEGER NOT NULL,
    primeiro_dia DATE NOT NULL,
    ultimo_dia DATE NOT NULL,
    PRIMARY KEY (sg_uf, id_pessoa)
);

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_medico_tipo_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico INTEGER NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    documentos BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_medico_tipo_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico INTEGER NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    documentos BIGINT NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_medico, id_tipo_documento)
);

CREATE INDEX IF NOT EXISTS idx_fato_medico_tipo_tipo
    ON prescricao.fato_documento_medico_tipo_dia (id_tipo_documento, sg_uf, dia);

CREATE INDEX IF NOT EXISTS idx_fato_medico_tipo_medico
    ON prescricao.fato_documento_medico_tipo_dia (id_medico, dia);

DROP TABLE IF EXISTS prescricao.fato_documento_medico_pacientes_dia;

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_medico_paciente_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico INTEGER NOT NULL,
    id_paciente INTEGER NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_medico, id_paciente)
);

CREATE INDEX IF NOT EXISTS idx_fato_med_pac_medico
    ON prescricao.fato_documento_medico_paciente_dia (id_medico, dia);

CREATE INDEX IF NOT EXISTS idx_fato_med_pac_uf
    ON prescricao.fato_documento_medico_paciente_dia (sg_uf, dia);

-- AN3 de 5 minutos descontinuada em 2026-09-30 (substituida pela AN3 diaria).
-- Tabelas removidas definitivamente; os DROP abaixo limpam bases que ainda as possuam.
DROP TABLE IF EXISTS prescricao.stg_an3_emissao_detalhe;
DROP TABLE IF EXISTS prescricao.stg_an3_medico_unidade_tipo_dia;
DROP TABLE IF EXISTS prescricao.fato_an3_emissao_detalhe;
DROP TABLE IF EXISTS prescricao.fato_an3_medico_unidade_tipo_dia;

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_medico_paciente_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico INTEGER NOT NULL,
    id_paciente INTEGER NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_medico, id_paciente)
);

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_unidade_paciente_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    id_paciente INTEGER NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_unidade_atendimento, id_paciente)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_unidade_paciente_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    id_paciente INTEGER NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_unidade_atendimento, id_paciente)
);

CREATE INDEX IF NOT EXISTS idx_fato_unid_pac_unidade_dia
    ON prescricao.fato_documento_unidade_paciente_dia (id_unidade_atendimento, dia);

CREATE TABLE IF NOT EXISTS prescricao.stg_medico_unidade (
    id_medico INTEGER NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    in_ativo CHAR(1) NOT NULL,
    dt_cadastro DATE,
    PRIMARY KEY (id_medico, id_unidade_atendimento)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_medico_unidade (
    id_medico INTEGER NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    in_ativo CHAR(1) NOT NULL,
    dt_cadastro DATE,
    PRIMARY KEY (id_medico, id_unidade_atendimento)
);

CREATE INDEX IF NOT EXISTS idx_medico_unidade_unidade
    ON prescricao.fato_medico_unidade (id_unidade_atendimento, in_ativo);

CREATE TABLE IF NOT EXISTS prescricao.stg_medico_maior_dia (
    id_medico INTEGER NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    dia DATE NOT NULL,
    documentos BIGINT NOT NULL,
    pacientes BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.fato_medico_maior_dia (
    id_medico INTEGER NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    dia DATE NOT NULL,
    documentos BIGINT NOT NULL,
    pacientes BIGINT NOT NULL,
    PRIMARY KEY (id_medico, sg_uf)
);

CREATE INDEX IF NOT EXISTS idx_medico_maior_dia_docs
    ON prescricao.fato_medico_maior_dia (documentos DESC);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_emissao (
    id_consulta_documento INTEGER PRIMARY KEY,
    dia DATE NOT NULL,
    dh_documento TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    id_medico INTEGER NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    in_assinado CHAR(1) NOT NULL,
    in_cancelado CHAR(1) NOT NULL,
    ds_qrcode VARCHAR(100)
);

ALTER TABLE prescricao.fato_documento_emissao
    ADD COLUMN IF NOT EXISTS ds_qrcode VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_doc_emissao_medico_dia_hora
    ON prescricao.fato_documento_emissao (id_medico, dia, dh_documento);

CREATE INDEX IF NOT EXISTS idx_doc_emissao_dia_assinado
    ON prescricao.fato_documento_emissao (dia, in_assinado)
    INCLUDE (id_medico, sg_uf);

CREATE INDEX IF NOT EXISTS idx_doc_emissao_unidade_dia
    ON prescricao.fato_documento_emissao (id_unidade_atendimento, dia)
    INCLUDE (id_tipo_documento)
    WHERE in_assinado = 'S';
