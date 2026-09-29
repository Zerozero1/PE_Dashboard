import sys
import time

import psycopg2

from common import append_rows, connect_dw, connect_origin, log


STAGING = "prescricao.stg_an3_medico_unidade_tipo_dia"
FACT = "prescricao.fato_an3_medico_unidade_tipo_dia"
PERSON_BATCH_SIZE = 10000

COLUMNS = [
    "dia", "id_pessoa", "sg_uf", "id_unidade_atendimento",
    "id_tipo_documento", "documentos", "intervalos", "intervalos_ate_5s",
    "max_docs_60s", "intervalos_tipo", "intervalos_tipo_ate_5s",
    "max_docs_60s_tipo",
]

SQL_AN3 = """
WITH medicos AS MATERIALIZED (
  SELECT id_medico,id_pessoa
    FROM prescricao.tb_medico
   WHERE id_pessoa BETWEEN %s AND %s
), eventos AS (
  SELECT d.id_consulta_documento,
         d.dh_documento,
         d.dh_documento::date AS dia,
         m.id_pessoa,
         d.id_tipo_documento,
         mu.id_unidade_atendimento,
         COALESCE(NULLIF(ua.sg_uf, 'BR'), '--') AS sg_uf
    FROM medicos m
    JOIN prescricao.rl_medico_unidade_atendimento mu
      ON mu.id_medico = m.id_medico
    JOIN prescricao.tb_consulta c
      ON c.id_medico_unidade_atendimento = mu.id_medico_unidade_atendimento
    JOIN prescricao.tb_consulta_documento d
      ON d.id_consulta = c.id_consulta
    LEFT JOIN prescricao.tb_unidade_atendimento ua
      ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
   WHERE d.in_cancelado IS DISTINCT FROM 'S'
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
    dw = connect_dw()
    t0 = time.time()
    total = 0

    log("AN3: iniciando cálculo por pessoa, horário e unidade")
    truncate = dw.cursor()
    truncate.execute(f"TRUNCATE {STAGING}")
    dw.commit()
    truncate.close()

    origin = connect_origin()
    bounds = origin.cursor()
    bounds.execute(
        "SELECT min(id_pessoa), max(id_pessoa) "
        "FROM prescricao.tb_medico WHERE id_pessoa IS NOT NULL"
    )
    min_person, max_person = bounds.fetchone()
    bounds.close()
    origin.close()

    if min_person is not None and max_person is not None:
        start = min_person
        batch = 0
        while start <= max_person:
            end = min(start + PERSON_BATCH_SIZE - 1, max_person)
            batch_rows = 0
            for attempt in range(1, 4):
                origin = connect_origin()
                origin.autocommit = False
                source = None
                try:
                    setup = origin.cursor()
                    setup.execute("SET LOCAL statement_timeout = 0")
                    setup.execute("SET LOCAL work_mem = '256MB'")
                    setup.close()

                    source = origin.cursor(name="an3_medico_unidade_tipo")
                    source.itersize = 5000
                    source.execute(SQL_AN3, (start, end))
                    batch_rows = 0
                    while True:
                        rows = source.fetchmany(5000)
                        if not rows:
                            break
                        append_rows(dw, STAGING, COLUMNS, rows)
                        batch_rows += len(rows)
                    source.close()
                    origin.rollback()
                    origin.close()
                    break
                except psycopg2.OperationalError:
                    if source is not None:
                        try:
                            source.close()
                        except psycopg2.Error:
                            pass
                    try:
                        origin.rollback()
                        origin.close()
                    except psycopg2.Error:
                        pass
                    cleanup = dw.cursor()
                    cleanup.execute(
                        f"DELETE FROM {STAGING} WHERE id_pessoa BETWEEN %s AND %s",
                        (start, end),
                    )
                    dw.commit()
                    if attempt == 3:
                        raise
                    log(f"AN3: origem cancelou faixa {start}-{end}; tentativa {attempt + 1}/3")
                    time.sleep(attempt * 5)
                finally:
                    if source is not None and not source.closed:
                        source.close()
                    if not origin.closed:
                        origin.close()
            else:
                raise RuntimeError(f"AN3: não foi possível carregar id_pessoa {start}-{end}")

            total += batch_rows

            batch += 1
            log(f"AN3: faixa id_pessoa {start}-{end} concluída ({batch_rows:,} agregados · total {total:,})")
            start = end + 1

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
    log(f"AN3: {total:,} agregados carregados em {time.time()-t0:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
