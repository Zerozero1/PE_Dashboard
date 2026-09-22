import sys
import time

from common import connect_dw, log, upsert_rows


def run(dw, sql, tipo, dimensao):
    cur = dw.cursor()
    cur.execute("SET work_mem = '256MB'")
    t0 = time.time()
    cur.execute(sql)
    rows = [(d, tipo, dimensao, float(o), float(e), float(o) / float(e),
             sev) for d, o, e, sev in cur.fetchall()]
    cur.close()
    if rows:
        upsert_rows(dw, "prescricao.fato_auditoria_dia",
                    ["dia", "tipo_anomalia", "dimensao_afetada",
                     "valor_observado", "valor_esperado", "desvio",
                     "severidade"],
                    rows, ["dia", "tipo_anomalia", "dimensao_afetada"])
    log(f"{tipo}/{dimensao}: {len(rows):,} registros em {time.time()-t0:.0f}s")


SQL_AN1 = """
WITH diario AS (
  SELECT dia, sum(documentos)::numeric AS docs
  FROM prescricao.fato_documento_dia GROUP BY dia
), media AS (
  SELECT dia, docs,
         avg(docs) OVER (ORDER BY dia ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING) AS esperado
  FROM diario
)
SELECT dia, docs, esperado,
       CASE WHEN docs/esperado >= 5 THEN 5
            WHEN docs/esperado >= 3 THEN 3
            WHEN docs/esperado >= 2 THEN 2 END AS sev
FROM media
WHERE esperado IS NOT NULL AND esperado > 0
  AND docs/esperado >= 2
"""

SQL_AN2 = """
WITH diario AS (
  SELECT dia, sum(pacientes_distintos)::numeric AS pac
  FROM prescricao.fato_documento_paciente_dia GROUP BY dia
), media AS (
  SELECT dia, pac,
         avg(pac) OVER (ORDER BY dia ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING) AS esperado
  FROM diario
)
SELECT dia, pac, esperado,
       CASE WHEN pac/esperado >= 5 THEN 5
            WHEN pac/esperado >= 3 THEN 3
            WHEN pac/esperado >= 2 THEN 2 END AS sev
FROM media
WHERE esperado IS NOT NULL AND esperado > 0
  AND pac/esperado >= 2
"""

SQL_AN3 = """
WITH gaps AS (
  SELECT id_medico, dia,
         (dia - lag(dia) OVER (PARTITION BY id_medico ORDER BY dia)) AS gap
  FROM prescricao.fato_documento_medico_dia
), media_geral AS (
  SELECT avg(gap) AS ga FROM gaps WHERE gap IS NOT NULL
), por_dia AS (
  SELECT dia, avg(gap) AS gap_medio
  FROM gaps WHERE gap IS NOT NULL GROUP BY dia
)
SELECT dia, gap_medio, (SELECT ga FROM media_geral),
       CASE WHEN gap_medio/(SELECT ga FROM media_geral) >= 5 THEN 5
            WHEN gap_medio/(SELECT ga FROM media_geral) >= 3 THEN 3
            WHEN gap_medio/(SELECT ga FROM media_geral) >= 2 THEN 2 END AS sev
FROM por_dia
WHERE (SELECT ga FROM media_geral) IS NOT NULL
  AND gap_medio/(SELECT ga FROM media_geral) >= 2
"""

SQL_AN4 = """
WITH por_unidade_dia AS (
  SELECT dia, id_unidade_atendimento, sum(documentos)::numeric AS docs
  FROM prescricao.fato_documento_unidade_dia GROUP BY dia, id_unidade_atendimento
), media AS (
  SELECT dia, id_unidade_atendimento, docs,
         avg(docs) OVER (ORDER BY dia ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING) AS esperado
  FROM por_unidade_dia
), agregado AS (
  SELECT dia, max(docs) AS pico, max(esperado) AS esperado
  FROM media
  WHERE esperado IS NOT NULL AND esperado > 0 AND docs/esperado >= 2
  GROUP BY dia
)
SELECT dia, pico, esperado,
       CASE WHEN pico/esperado >= 5 THEN 5
            WHEN pico/esperado >= 3 THEN 3 ELSE 2 END AS sev
FROM agregado
"""


def main():
    dw = connect_dw()
    log("fato_auditoria_dia: iniciando (AN1-AN4)")
    run(dw, SQL_AN1, "AN1", "Documentos")
    run(dw, SQL_AN2, "AN2", "Atendimentos")
    run(dw, SQL_AN3, "AN3", "Documentos")
    run(dw, SQL_AN4, "AN4", "Local")
    dw.close()
    log("fato_auditoria_dia: concluido")


if __name__ == "__main__":
    sys.exit(main())
