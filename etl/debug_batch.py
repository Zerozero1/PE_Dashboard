import sys

from common import connect_dw, connect_origin, log, upsert_rows

SQL = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       d.id_tipo_documento,
       COALESCE(d.in_assinado, 'N') AS in_assinado,
       count(*) AS documentos,
       count(*) FILTER (WHERE d.in_cancelado = 'S') AS cancelados
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
WHERE d.id_consulta_documento BETWEEN %s AND %s
GROUP BY 1, 2, 3, 4
"""


def main():
    lo, hi = 62000001, 62095517
    origin = connect_origin()
    cur = origin.cursor()
    cur.execute(SQL, (lo, hi))
    rows = cur.fetchall()
    cur.close()
    origin.close()
    log(f"cursor: {len(rows)} linhas, sum documentos = {sum(r[4] for r in rows):,}")
    dup = len(rows) - len(set((r[0], r[1], r[2], r[3]) for r in rows))
    log(f"duplicatas de chave no lote: {dup}")
    nulos = sum(1 for r in rows if r[2] is None)
    log(f"linhas com id_tipo_documento NULL: {nulos}")

    dw = connect_dw()
    cur = dw.cursor()
    cur.execute(
        "SELECT coalesce(sum(documentos),0) FROM prescricao.fato_documento_dia "
        "WHERE dia = ANY (SELECT DISTINCT dia FROM (VALUES %s) AS v(dia))")
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
