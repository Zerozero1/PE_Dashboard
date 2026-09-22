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
    lo, hi = 28000001, 30000000
    origin = connect_origin()
    cur = origin.cursor()
    cur.execute(SQL, (lo, hi))
    rows = cur.fetchall()
    cur.close()
    origin.close()
    dias = sorted({r[0] for r in rows})
    log(f"cursor: {len(rows)} linhas; sum = {sum(r[4] for r in rows):,}; "
        f"dias {dias[0]}..{dias[-1]}")

    dw = connect_dw()
    cur = dw.cursor()
    cur.execute(
        "SELECT coalesce(sum(documentos),0) FROM prescricao.fato_documento_dia "
        "WHERE dia BETWEEN %s AND %s", (dias[0], dias[-1]))
    antes = cur.fetchone()[0]
    log(f"DW antes (dia {dias[0]}..{dias[-1]}): {antes:,}")

    upsert_rows(dw, "prescricao.fato_documento_dia",
                ["dia", "sg_uf", "id_tipo_documento", "in_assinado",
                 "documentos", "cancelados"],
                rows,
                ["dia", "sg_uf", "id_tipo_documento", "in_assinado"])

    cur.execute(
        "SELECT coalesce(sum(documentos),0) FROM prescricao.fato_documento_dia "
        "WHERE dia BETWEEN %s AND %s", (dias[0], dias[-1]))
    depois = cur.fetchone()[0]
    log(f"DW depois: {depois:,} (delta {depois - antes:+,})")
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
