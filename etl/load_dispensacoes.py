import sys
import time

from common import connect_dw, connect_origin, log, upsert_rows

SQL = """
SELECT h.dh_historico_dispensacao::date AS dia,
       CASE WHEN f.sg_uf = 'BR' THEN '--' ELSE COALESCE(f.sg_uf, '--') END AS sg_uf,
       count(*) FILTER (WHERE h.in_status = 'D') AS dispensacoes,
       count(*) FILTER (WHERE h.in_status = 'C') AS canceladas,
       count(*) FILTER (WHERE h.in_status = 'D' AND disp.in_assinado = 'S') AS assinadas,
       count(DISTINCT f.id_farmaceutico) FILTER (WHERE h.in_status = 'D') AS farmaceuticos_distintos,
       count(DISTINCT disp.id_farmacia) FILTER (WHERE h.in_status = 'D') AS farmacias_distintas,
       count(DISTINCT mp.id_paciente) FILTER (WHERE h.in_status = 'D') AS pacientes_distintos
FROM prescricao.tb_historico_dispensacao h
LEFT JOIN prescricao.rl_dispensacao_receita r
       ON r.id_dispensacao_receita = h.id_dispensacao_receita
LEFT JOIN prescricao.tb_dispensacao disp
       ON disp.id_dispensacao = r.id_dispensacao
LEFT JOIN prescricao.tb_farmaceutico f
       ON f.id_farmaceutico = disp.id_farmaceutico
LEFT JOIN prescricao.tb_receita rec
       ON rec.id_receita = r.id_receita
LEFT JOIN prescricao.tb_consulta_documento d
       ON d.id_consulta_documento = rec.id_consulta_documento
LEFT JOIN prescricao.tb_consulta c
       ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_paciente mp
       ON mp.id_medico_paciente = c.id_medico_paciente
GROUP BY 1, 2
"""


def main():
    origin = connect_origin()
    dw = connect_dw()
    log("fato_dispensacao_dia: iniciando (varredura de tb_historico_dispensacao)")

    cur = origin.cursor()
    cur.execute("SET statement_timeout = 0")
    cur.execute("SET work_mem = '256MB'")
    t0 = time.time()
    cur.execute(SQL)
    rows = cur.fetchall()
    cur.close()
    log(f"origem: {len(rows):,} linhas agregadas em {time.time()-t0:.0f}s")

    upsert_rows(dw, "prescricao.fato_dispensacao_dia",
                ["dia", "sg_uf", "dispensacoes", "canceladas", "assinadas",
                 "farmaceuticos_distintos", "farmacias_distintas",
                 "pacientes_distintos"],
                rows, ["dia", "sg_uf"])
    log(f"fato_dispensacao_dia: {len(rows):,} linhas gravadas")

    origin.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
