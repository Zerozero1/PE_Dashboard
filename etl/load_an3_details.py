import sys
import time

from common import append_rows, connect_dw, connect_origin, log


STAGING = "prescricao.stg_an3_emissao_detalhe"
FACT = "prescricao.fato_an3_emissao_detalhe"

COLUMNS = [
    "id_consulta_documento", "id_pessoa", "id_medico", "dh_documento",
    "id_tipo_documento", "id_unidade_atendimento", "sg_uf", "gap_pessoa_seg",
    "gap_tipo_seg", "docs_60s", "docs_60s_tipo",
]

SQL_CANDIDATOS = """
SELECT id_pessoa
  FROM prescricao.fato_an3_medico_unidade_tipo_dia
 GROUP BY id_pessoa
HAVING sum(documentos) >= 20
   AND (
     max(max_docs_60s) >= 10
     OR max(max_docs_60s_tipo) >= 10
     OR sum(intervalos_ate_5s) >= 5
     OR sum(intervalos_tipo_ate_5s) >= 5
   )
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
         mu.id_medico,
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
SELECT id_consulta_documento, id_pessoa, id_medico, dh_documento,
       id_tipo_documento, id_unidade_atendimento, sg_uf,
       gap_pessoa_seg, gap_tipo_seg, docs_60s, docs_60s_tipo
  FROM sequencia
 WHERE gap_pessoa_seg BETWEEN 0 AND 5
    OR docs_60s >= 10
    OR gap_tipo_seg BETWEEN 0 AND 5
    OR docs_60s_tipo >= 10
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
