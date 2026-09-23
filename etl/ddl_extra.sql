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
