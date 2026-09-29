import sys
import time

from common import append_rows, connect_dw, connect_origin, log


STAGING = "prescricao.stg_an3_medico_unidade_tipo_dia"
FACT = "prescricao.fato_an3_medico_unidade_tipo_dia"

COLUMNS = [
    "dia", "id_pessoa", "sg_uf", "id_unidade_atendimento",
    "id_tipo_documento", "documentos", "intervalos", "intervalos_ate_5s",
    "max_docs_60s", "intervalos_tipo", "intervalos_tipo_ate_5s",
    "max_docs_60s_tipo",
]

SQL_AN3 = """
WITH eventos AS (
  SELECT d.id_consulta_documento,
         d.dh_documento,
         d.dh_documento::date AS dia,
         m.id_pessoa,
         d.id_tipo_documento,
         mu.id_unidade_atendimento,
         COALESCE(NULLIF(ua.sg_uf, 'BR'), '--') AS sg_uf
    FROM prescricao.tb_consulta_documento d
    JOIN prescricao.tb_consulta c
      ON c.id_consulta = d.id_consulta
    JOIN prescricao.rl_medico_unidade_atendimento mu
      ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
    JOIN prescricao.tb_medico m
      ON m.id_medico = mu.id_medico
    LEFT JOIN prescricao.tb_unidade_atendimento ua
      ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
   WHERE d.in_cancelado IS DISTINCT FROM 'S'
     AND m.id_pessoa IS NOT NULL
), sequencia AS (
  SELECT *,
         extract(epoch FROM dh_documento - lag(dh_documento) OVER (
           PARTITION BY id_pessoa
           ORDER BY dh_documento, id_consulta_documento
         )) AS gap_pessoa_seg,
         extract(epoch FROM dh_documento - lag(dh_documento) OVER (
           PARTITION BY id_pessoa, id_tipo_documento
           ORDER BY dh_documento, id_consulta_documento
         )) AS gap_tipo_seg,
         count(*) OVER (
           PARTITION BY id_pessoa
           ORDER BY dh_documento
           RANGE BETWEEN INTERVAL '60 seconds' PRECEDING AND CURRENT ROW
         ) AS docs_60s,
         count(*) OVER (
           PARTITION BY id_pessoa, id_tipo_documento
           ORDER BY dh_documento
           RANGE BETWEEN INTERVAL '60 seconds' PRECEDING AND CURRENT ROW
         ) AS docs_60s_tipo
    FROM eventos
)
SELECT dia, id_pessoa, sg_uf, id_unidade_atendimento, id_tipo_documento,
       count(*) AS documentos,
       count(gap_pessoa_seg) AS intervalos,
       count(*) FILTER (WHERE gap_pessoa_seg BETWEEN 0 AND 5) AS intervalos_ate_5s,
       max(docs_60s) AS max_docs_60s,
       count(gap_tipo_seg) AS intervalos_tipo,
       count(*) FILTER (WHERE gap_tipo_seg BETWEEN 0 AND 5) AS intervalos_tipo_ate_5s,
       max(docs_60s_tipo) AS max_docs_60s_tipo
  FROM sequencia
 GROUP BY dia, id_pessoa, sg_uf, id_unidade_atendimento, id_tipo_documento
"""


def main():
    origin = connect_origin()
    origin.autocommit = False
    dw = connect_dw()
    t0 = time.time()
    total = 0

    log("AN3: iniciando cálculo por pessoa, horário e unidade")
    truncate = dw.cursor()
    truncate.execute(f"TRUNCATE {STAGING}")
    dw.commit()
    truncate.close()

    setup = origin.cursor()
    setup.execute("SET LOCAL statement_timeout = 0")
    setup.execute("SET LOCAL work_mem = '256MB'")
    setup.close()

    source = origin.cursor(name="an3_medico_unidade_tipo")
    source.itersize = 5000
    source.execute(SQL_AN3)
    while True:
        rows = source.fetchmany(5000)
        if not rows:
            break
        append_rows(dw, STAGING, COLUMNS, rows)
        total += len(rows)
        if total % 100000 == 0:
            log(f"AN3: {total:,} agregados extraídos")
    source.close()
    origin.rollback()

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

    origin.close()
    dw.close()
    log(f"AN3: {total:,} agregados carregados em {time.time()-t0:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
