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

CREATE TABLE IF NOT EXISTS prescricao.stg_an3_medico_unidade_tipo_dia (
    dia DATE NOT NULL,
    id_pessoa INTEGER NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    documentos BIGINT NOT NULL,
    intervalos BIGINT NOT NULL,
    intervalos_ate_5s BIGINT NOT NULL,
    max_docs_60s BIGINT NOT NULL,
    intervalos_tipo BIGINT NOT NULL,
    intervalos_tipo_ate_5s BIGINT NOT NULL,
    max_docs_60s_tipo BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.fato_an3_medico_unidade_tipo_dia (
    dia DATE NOT NULL,
    id_pessoa INTEGER NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    documentos BIGINT NOT NULL,
    intervalos BIGINT NOT NULL,
    intervalos_ate_5s BIGINT NOT NULL,
    max_docs_60s BIGINT NOT NULL,
    intervalos_tipo BIGINT NOT NULL,
    intervalos_tipo_ate_5s BIGINT NOT NULL,
    max_docs_60s_tipo BIGINT NOT NULL,
    PRIMARY KEY (dia, id_pessoa, sg_uf, id_unidade_atendimento, id_tipo_documento)
);

CREATE INDEX IF NOT EXISTS idx_fato_an3_data_uf_tipo
    ON prescricao.fato_an3_medico_unidade_tipo_dia (dia, sg_uf, id_tipo_documento);

CREATE INDEX IF NOT EXISTS idx_fato_an3_pessoa_dia
    ON prescricao.fato_an3_medico_unidade_tipo_dia (id_pessoa, dia);

CREATE TABLE IF NOT EXISTS prescricao.stg_an3_emissao_detalhe (
    id_consulta_documento INTEGER NOT NULL,
    id_pessoa INTEGER NOT NULL,
    id_medico INTEGER NOT NULL,
    dh_documento TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    gap_pessoa_seg NUMERIC(14,3),
    gap_tipo_seg NUMERIC(14,3),
    docs_60s BIGINT NOT NULL,
    docs_60s_tipo BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.fato_an3_emissao_detalhe (
    id_consulta_documento INTEGER PRIMARY KEY,
    id_pessoa INTEGER NOT NULL,
    id_medico INTEGER NOT NULL,
    dh_documento TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    id_unidade_atendimento INTEGER NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    gap_pessoa_seg NUMERIC(14,3),
    gap_tipo_seg NUMERIC(14,3),
    docs_60s BIGINT NOT NULL,
    docs_60s_tipo BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fato_an3_detalhe_pessoa_hora
    ON prescricao.fato_an3_emissao_detalhe (id_pessoa, dh_documento, id_consulta_documento);

CREATE INDEX IF NOT EXISTS idx_fato_an3_detalhe_pessoa_tipo_hora
    ON prescricao.fato_an3_emissao_detalhe (id_pessoa, id_tipo_documento, dh_documento, id_consulta_documento);

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_medico_paciente_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico INTEGER NOT NULL,
    id_paciente INTEGER NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_medico, id_paciente)
);
