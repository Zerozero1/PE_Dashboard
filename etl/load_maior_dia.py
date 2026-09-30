import sys
import time

from common import connect_dw, log


STAGING = "prescricao.stg_medico_maior_dia"
FACT = "prescricao.fato_medico_maior_dia"

SQL_CONSTRUIR = """
WITH melhor AS (
  SELECT DISTINCT ON (id_medico, sg_uf)
         id_medico, sg_uf, dia, documentos
    FROM prescricao.fato_documento_medico_dia
   ORDER BY id_medico, sg_uf, documentos DESC, dia
), pacientes AS (
  SELECT id_medico, sg_uf, dia, count(*)::bigint AS pacientes
    FROM prescricao.fato_documento_medico_paciente_dia
   GROUP BY id_medico, sg_uf, dia
)
INSERT INTO {staging} (id_medico, sg_uf, dia, documentos, pacientes)
SELECT b.id_medico, b.sg_uf, b.dia, b.documentos, COALESCE(p.pacientes, 0)
  FROM melhor b
  LEFT JOIN pacientes p
    ON p.id_medico = b.id_medico AND p.sg_uf = b.sg_uf AND p.dia = b.dia
"""


def main():
    dw = connect_dw()
    t0 = time.time()

    log("maior dia: iniciando (melhor dia por medico/UF)")
    cur = dw.cursor()
    try:
        cur.execute("SET work_mem = '512MB'")
        cur.execute(f"TRUNCATE {STAGING}")
        cur.execute(SQL_CONSTRUIR.format(staging=STAGING))
        n = cur.rowcount
        cur.execute(f"TRUNCATE {FACT}")
        cur.execute(
            f"INSERT INTO {FACT} (id_medico, sg_uf, dia, documentos, pacientes) "
            f"SELECT id_medico, sg_uf, dia, documentos, pacientes FROM {STAGING}"
        )
        cur.execute(f"TRUNCATE {STAGING}")
        dw.commit()
    except Exception:
        dw.rollback()
        raise
    finally:
        cur.close()

    dw.close()
    log(f"maior dia: {n:,} linhas carregadas em {time.time()-t0:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
