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

def main():
    dw = connect_dw()
    log("fato_auditoria_dia: iniciando (AN1 e AN2)")
    run(dw, SQL_AN1, "AN1", "Documentos")
    run(dw, SQL_AN2, "AN2", "Atendimentos")
    dw.close()
    log("fato_auditoria_dia: concluido")


if __name__ == "__main__":
    sys.exit(main())
