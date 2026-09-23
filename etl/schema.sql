-- DDL do datamart PE Dashboard (schema prescricao na base prescricao_dw)
-- Executar uma unica vez: psql -f schema.sql

CREATE TABLE IF NOT EXISTS prescricao.dim_data (
    data DATE PRIMARY KEY,
    ano SMALLINT NOT NULL,
    mes SMALLINT NOT NULL,
    ano_mes CHAR(7) NOT NULL
);

CREATE TABLE IF NOT EXISTS prescricao.dim_uf (
    sg_uf CHAR(2) PRIMARY KEY,
    ds_uf VARCHAR(60),
    in_regiao VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS prescricao.dim_tipo_documento (
    id_tipo_documento INTEGER PRIMARY KEY,
    nm_documento VARCHAR(100),
    in_ativo CHAR(1)
);

CREATE TABLE IF NOT EXISTS prescricao.dim_medico (
    id_medico INTEGER PRIMARY KEY,
    nu_crm VARCHAR(20),
    sg_uf CHAR(2),
    in_situacao CHAR(1),
    in_tipo_inscricao CHAR(1)
);

CREATE TABLE IF NOT EXISTS prescricao.dim_especialidade (
    id_medico_especialidade INTEGER PRIMARY KEY,
    id_medico INTEGER,
    ds_especialidade VARCHAR(200),
    nu_registro VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS prescricao.dim_unidade (
    id_unidade_atendimento INTEGER PRIMARY KEY,
    sg_uf CHAR(2)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_tipo_documento INTEGER NOT NULL,
    documentos BIGINT NOT NULL,
    assinados BIGINT NOT NULL,
    cancelados BIGINT NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_tipo_documento)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_origem_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    ds_origem_criacao TEXT NOT NULL,
    documentos BIGINT NOT NULL,
    PRIMARY KEY (dia, sg_uf, ds_origem_criacao)
);

CREATE INDEX IF NOT EXISTS idx_fato_documento_origem_dia_uf
    ON prescricao.fato_documento_origem_dia (sg_uf, dia);

CREATE INDEX IF NOT EXISTS idx_fato_documento_dia_uf ON prescricao.fato_documento_dia (sg_uf, dia);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_especialidade_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    id_medico_especialidade INTEGER NOT NULL,
    documentos BIGINT NOT NULL,
    PRIMARY KEY (dia, sg_uf, id_medico_especialidade)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_documento_paciente_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    pacientes_distintos BIGINT NOT NULL,
    PRIMARY KEY (dia, sg_uf)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_medico_dia (
    dia DATE NOT NULL,
    sg_uf CHAR(2) NOT NULL,
    novos_por_dh_atualizacao BIGINT NOT NULL DEFAULT 0,
    medicos_com_emissao BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, sg_uf)
);

CREATE TABLE IF NOT EXISTS prescricao.fato_auditoria_dia (
    dia DATE NOT NULL,
    tipo_anomalia CHAR(3) NOT NULL,
    dimensao_afetada VARCHAR(30) NOT NULL,
    valor_observado NUMERIC NOT NULL,
    valor_esperado NUMERIC NOT NULL,
    desvio NUMERIC,
    severidade SMALLINT,
    PRIMARY KEY (dia, tipo_anomalia, dimensao_afetada)
);

CREATE TABLE IF NOT EXISTS prescricao.dashboard_refresh_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    horario_diario TIME NOT NULL DEFAULT '02:00',
    timezone VARCHAR(40) NOT NULL DEFAULT 'America/Sao_Paulo',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    intervalo_verificacao_minutos INTEGER NOT NULL DEFAULT 5,
    ultima_execucao_programada_em TIMESTAMPTZ,
    atualizado_por VARCHAR(120),
    atualizado_em TIMESTAMPTZ
);

INSERT INTO prescricao.dashboard_refresh_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS prescricao.dashboard_refresh_job (
    id_job BIGSERIAL PRIMARY KEY,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('scheduled', 'manual')),
    status VARCHAR(10) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed')),
    solicitado_por VARCHAR(120),
    agendado_para TIMESTAMPTZ,
    iniciado_em TIMESTAMPTZ,
    finalizado_em TIMESTAMPTZ,
    mensagem TEXT,
    lock_key UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_job_status ON prescricao.dashboard_refresh_job (status);
