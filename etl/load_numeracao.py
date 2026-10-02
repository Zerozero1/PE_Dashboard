# -*- coding: utf-8 -*-
"""Carrega o pool de numeracoes ANVISA reservadas (origem tb_numeracao_anvisa).

Agrega na origem por medico x tipo de documento: disponiveis (D) e utilizados (U),
e grava em prescricao.snap_numeracao_anvisa_medico (visao RDC1000).
A tabela da origem e um snapshot do pool (sem historico); este passo entra no
run_all para refletir o estado atual a cada carga.
"""
import sys

from common import connect_dw, connect_origin, log

SQL = """
SELECT m.sg_uf,
       n.id_medico,
       n.id_tipo_documento,
       count(*) FILTER (WHERE n.in_situacao_numeracao = 'D')::bigint AS disponiveis,
       count(*) FILTER (WHERE n.in_situacao_numeracao = 'U')::bigint AS utilizados
  FROM prescricao.tb_numeracao_anvisa n
  JOIN prescricao.tb_medico m ON m.id_medico = n.id_medico
 GROUP BY 1, 2, 3
"""

TABLE = "prescricao.snap_numeracao_anvisa_medico"
COLS = ["sg_uf", "id_medico", "id_tipo_documento", "disponiveis", "utilizados"]


def main():
    origin = connect_origin()
    cur = origin.cursor()
    cur.execute(SQL)
    rows = cur.fetchall()
    cur.close()
    origin.close()

    dw = connect_dw()
    cur = dw.cursor()
    cur.execute(f"TRUNCATE {TABLE}")
    sql = (f"INSERT INTO {TABLE} ({', '.join(COLS)}) "
           f"VALUES ({', '.join(['%s'] * len(COLS))})")
    for i in range(0, len(rows), 5000):
        cur.executemany(sql, rows[i:i + 5000])
    dw.commit()
    cur.execute(f"SELECT count(*), sum(disponiveis), sum(utilizados) FROM {TABLE}")
    n, disp, usados = cur.fetchone()
    log(f"snap_numeracao_anvisa_medico: {n:,} linhas "
        f"({disp:,} disponiveis / {usados:,} utilizados)")
    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
