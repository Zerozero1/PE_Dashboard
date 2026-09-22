import sys

from common import connect_dw, connect_origin, log, upsert_rows


def main():
    origin = connect_origin()
    dw = connect_dw()
    log("fato_medico_snapshot e novos por dh_atualizacao: iniciando")

    cur = origin.cursor()
    cur.execute(
        "SELECT sg_uf, count(*) AS inscricoes, "
        "count(*) FILTER (WHERE in_situacao = 'A') AS ativos "
        "FROM prescricao.tb_medico GROUP BY sg_uf")
    rows = [(uf, tot, atv, atv) for uf, tot, atv in cur.fetchall()]
    upsert_rows(dw, "prescricao.fato_medico_snapshot",
                ["sg_uf", "inscricoes_cadastradas", "inscricoes_ativas",
                 "medicos_ativos"], rows, ["sg_uf"])
    log(f"fato_medico_snapshot: {len(rows)} UFs")

    cur.execute(
        "SELECT dh_atualizacao::date AS dia, sg_uf, count(*) "
        "FROM prescricao.tb_medico "
        "WHERE dh_atualizacao IS NOT NULL "
        "GROUP BY 1, 2")
    rows = cur.fetchall()
    cur.close()
    upsert_rows(dw, "prescricao.fato_medico_dia",
                ["dia", "sg_uf", "novos_por_dh_atualizacao"], rows,
                ["dia", "sg_uf"])
    log(f"fato_medico_dia.novos_por_dh_atualizacao: {len(rows):,} linhas")

    cur = dw.cursor()
    cur.execute(
        "UPDATE prescricao.fato_medico_dia f SET medicos_com_emissao = s.n "
        "FROM (SELECT dia, sg_uf, count(DISTINCT id_medico) AS n "
        "      FROM prescricao.fato_documento_medico_dia "
        "      GROUP BY dia, sg_uf) s "
        "WHERE s.dia = f.dia AND s.sg_uf = f.sg_uf")
    dw.commit()
    cur.close()
    log("fato_medico_dia.medicos_com_emissao: atualizado a partir do DW")

    origin.close()
    dw.close()
    log("medicos: concluido")


if __name__ == "__main__":
    sys.exit(main())
