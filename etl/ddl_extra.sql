-- DDL complementar (executar uma unica vez)

CREATE TABLE IF NOT EXISTS prescricao.stg_documento_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    in_assinado CHAR(1) NOT NULL,
    documentos BIGINT NOT NULL,
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
    inscricoes_ativas BIGINT NOT NULL,
    medicos_ativos BIGINT NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
