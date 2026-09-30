import sys
import time

from common import append_rows, connect_dw, connect_origin, log


STAGING = "prescricao.stg_an3_emissao_detalhe"
FACT = "prescricao.fato_an3_emissao_detalhe"

COLUMNS = [
    "id_consulta_documento", "id_pessoa", "id_medico", "dh_documento",
    "id_tipo_documento", "id_unidade_atendimento", "sg_uf", "gap_pessoa_seg",
    "gap_tipo_seg", "docs_60s", "docs_60s_tipo",
    "gap_pessoa_entre_pacientes", "gap_tipo_entre_pacientes",
    "janela_pessoa_mult_paciente", "janela_tipo_mult_paciente",
    "docs_300s", "docs_300s_tipo",
    "janela_pessoa_mult_paciente_300s", "janela_tipo_mult_paciente_300s",
]

SQL_CANDIDATOS = """
 SELECT id_pessoa
   FROM prescricao.fato_an3_medico_unidade_tipo_dia
 GROUP BY id_pessoa
 HAVING max(max_docs_300s_multi_paciente) >= 10
     OR max(max_docs_300s_tipo_multi_paciente) >= 10
"""

SQL_DETALHES = """
 WITH medicos AS MATERIALIZED (
  SELECT id_medico,id_pessoa
    FROM prescricao.tb_medico
   WHERE id_pessoa = ANY(%s::integer[])
 ), eventos AS (
   SELECT d.id_consulta_documento,
         d.dh_documento,
         m.id_pessoa,
         mp.id_paciente,
         mu.id_medico,
         d.id_tipo_documento,
         mu.id_unidade_atendimento,
         COALESCE(NULLIF(ua.sg_uf, 'BR'), '--') AS sg_uf
     FROM medicos m
     JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico = m.id_medico
     JOIN prescricao.tb_consulta c
       ON c.id_medico_unidade_atendimento = mu.id_medico_unidade_atendimento
     LEFT JOIN prescricao.rl_medico_paciente mp
       ON mp.id_medico_paciente = c.id_medico_paciente
      AND mp.id_medico = m.id_medico
     JOIN prescricao.tb_consulta_documento d
       ON d.id_consulta = c.id_consulta
    LEFT JOIN prescricao.tb_unidade_atendimento ua
      ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
   WHERE d.in_cancelado IS DISTINCT FROM 'S'
), sequencia AS (
   SELECT *,
          extract(epoch FROM dh_documento - lag(dh_documento) OVER pessoa) AS gap_pessoa_seg,
          lag(id_paciente) OVER pessoa AS paciente_anterior_pessoa,
          extract(epoch FROM dh_documento - lag(dh_documento) OVER tipo) AS gap_tipo_seg,
          lag(id_paciente) OVER tipo AS paciente_anterior_tipo,
          count(*) OVER pessoa_60s AS docs_60s,
          min(id_paciente) OVER pessoa_60s AS min_paciente_60s,
          max(id_paciente) OVER pessoa_60s AS max_paciente_60s,
          count(*) OVER tipo_60s AS docs_60s_tipo,
          min(id_paciente) OVER tipo_60s AS min_paciente_60s_tipo,
          max(id_paciente) OVER tipo_60s AS max_paciente_60s_tipo,
          count(*) OVER pessoa_300s AS docs_300s,
          min(id_paciente) OVER pessoa_300s AS min_paciente_300s,
          max(id_paciente) OVER pessoa_300s AS max_paciente_300s,
          count(*) OVER tipo_300s AS docs_300s_tipo,
          min(id_paciente) OVER tipo_300s AS min_paciente_300s_tipo,
          max(id_paciente) OVER tipo_300s AS max_paciente_300s_tipo
     FROM eventos
    WINDOW pessoa AS (
             PARTITION BY id_pessoa
             ORDER BY dh_documento, id_consulta_documento
           ),
           tipo AS (
             PARTITION BY id_pessoa, id_tipo_documento
             ORDER BY dh_documento, id_consulta_documento
           ),
           pessoa_60s AS (
             PARTITION BY id_pessoa
             ORDER BY dh_documento
             RANGE BETWEEN INTERVAL '60 seconds' PRECEDING AND CURRENT ROW
           ),
            tipo_60s AS (
              PARTITION BY id_pessoa, id_tipo_documento
              ORDER BY dh_documento
              RANGE BETWEEN INTERVAL '60 seconds' PRECEDING AND CURRENT ROW
            ),
            pessoa_300s AS (
              PARTITION BY id_pessoa
              ORDER BY dh_documento
              RANGE BETWEEN INTERVAL '300 seconds' PRECEDING AND CURRENT ROW
            ),
            tipo_300s AS (
              PARTITION BY id_pessoa, id_tipo_documento
              ORDER BY dh_documento
              RANGE BETWEEN INTERVAL '300 seconds' PRECEDING AND CURRENT ROW
            )
 ), avaliados AS (
   SELECT *,
          id_paciente IS NOT NULL
            AND paciente_anterior_pessoa IS NOT NULL
            AND id_paciente <> paciente_anterior_pessoa AS gap_pessoa_entre_pacientes,
          id_paciente IS NOT NULL
            AND paciente_anterior_tipo IS NOT NULL
            AND id_paciente <> paciente_anterior_tipo AS gap_tipo_entre_pacientes,
          min_paciente_60s IS NOT NULL
            AND min_paciente_60s <> max_paciente_60s AS janela_pessoa_mult_paciente,
          min_paciente_60s_tipo IS NOT NULL
            AND min_paciente_60s_tipo <> max_paciente_60s_tipo AS janela_tipo_mult_paciente,
          min_paciente_300s IS NOT NULL
            AND min_paciente_300s <> max_paciente_300s AS janela_pessoa_mult_paciente_300s,
          min_paciente_300s_tipo IS NOT NULL
            AND min_paciente_300s_tipo <> max_paciente_300s_tipo AS janela_tipo_mult_paciente_300s
     FROM sequencia
 )
 SELECT id_consulta_documento, id_pessoa, id_medico, dh_documento,
        id_tipo_documento, id_unidade_atendimento, sg_uf,
        gap_pessoa_seg, gap_tipo_seg, docs_60s, docs_60s_tipo,
        gap_pessoa_entre_pacientes, gap_tipo_entre_pacientes,
        janela_pessoa_mult_paciente, janela_tipo_mult_paciente,
        docs_300s, docs_300s_tipo,
        janela_pessoa_mult_paciente_300s, janela_tipo_mult_paciente_300s
    FROM avaliados
  WHERE (docs_300s >= 2 AND janela_pessoa_mult_paciente_300s)
     OR (docs_300s_tipo >= 2 AND janela_tipo_mult_paciente_300s)
  ORDER BY id_pessoa, dh_documento, id_consulta_documento
"""


def main():
    dw = connect_dw()
    t0 = time.time()
    cur = dw.cursor()
    cur.execute(SQL_CANDIDATOS)
    candidatos = [row[0] for row in cur.fetchall()]
    cur.close()
    log(f"AN3 detalhe: {len(candidatos):,} pessoas candidatas")

    cur = dw.cursor()
    cur.execute(f"TRUNCATE {STAGING}")
    dw.commit()
    cur.close()

    total = 0
    if candidatos:
        origin = connect_origin()
        origin.autocommit = False
        setup = origin.cursor()
        setup.execute("SET LOCAL statement_timeout = 0")
        setup.execute("SET LOCAL work_mem = '256MB'")
        setup.close()

        source = origin.cursor(name="an3_emissoes_sinalizadas")
        source.itersize = 5000
        source.execute(SQL_DETALHES, (candidatos,))
        while True:
            rows = source.fetchmany(5000)
            if not rows:
                break
            append_rows(dw, STAGING, COLUMNS, rows)
            total += len(rows)
            if total % 100000 == 0:
                log(f"AN3 detalhe: {total:,} emissões sinalizadas extraídas")
        source.close()
        origin.rollback()
        origin.close()

    replace = dw.cursor()
    try:
        replace.execute(f"TRUNCATE {FACT}")
        replace.execute(
            f"INSERT INTO {FACT} ({', '.join(COLUMNS)}) "
            f"SELECT {', '.join(COLUMNS)} FROM {STAGING}"
        )
        replace.execute(f"TRUNCATE {STAGING}")
        dw.commit()
    except Exception:
        dw.rollback()
        raise
    finally:
        replace.close()

    dw.close()
    log(f"AN3 detalhe: {total:,} emissões sinalizadas carregadas em {time.time()-t0:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
