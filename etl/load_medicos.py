import sys

from common import connect_dw, connect_origin, log, upsert_rows


def main():
    origin = connect_origin()
    dw = connect_dw()
    log("fato_medico_snapshot e novos por aceite do termo: iniciando")

    cur = origin.cursor()
    cur.execute(
        "SELECT m.sg_uf, count(*) AS inscricoes, "
        "count(DISTINCT p.nu_cpf) FILTER (WHERE u.dh_aceite_termo IS NOT NULL) AS ativos "
        "FROM prescricao.tb_medico m "
        "LEFT JOIN prescricao.tb_usuario u ON u.id_pessoa = m.id_pessoa "
        "LEFT JOIN prescricao.tb_pessoa p ON p.id_pessoa = m.id_pessoa "
        "GROUP BY m.sg_uf")
    rows = [(uf, tot, atv) for uf, tot, atv in cur.fetchall()]
    cur.execute(
        "SELECT count(*) AS inscricoes, "
        "count(DISTINCT p.nu_cpf) FILTER (WHERE u.dh_aceite_termo IS NOT NULL) AS ativos "
        "FROM prescricao.tb_medico m "
        "LEFT JOIN prescricao.tb_usuario u ON u.id_pessoa = m.id_pessoa "
        "LEFT JOIN prescricao.tb_pessoa p ON p.id_pessoa = m.id_pessoa")
    tot, atv = cur.fetchone()
    rows.append(("--", tot, atv))
    upsert_rows(dw, "prescricao.fato_medico_snapshot",
                ["sg_uf", "inscricoes_cadastradas", "medicos_ativos"],
                rows, ["sg_uf"])
    log(f"fato_medico_snapshot: {len(rows)} UFs + total global ('--')")

    cur.execute(
        "SELECT u.dh_aceite_termo AS dia, m.sg_uf, count(DISTINCT m.id_pessoa) "
        "FROM prescricao.tb_medico m "
        "JOIN prescricao.tb_usuario u ON u.id_pessoa = m.id_pessoa "
        "WHERE u.dh_aceite_termo IS NOT NULL "
        "GROUP BY 1, 2")
    rows = cur.fetchall()
    cur.execute(
        "SELECT u.dh_aceite_termo AS dia, count(DISTINCT m.id_pessoa) "
        "FROM prescricao.tb_medico m "
        "JOIN prescricao.tb_usuario u ON u.id_pessoa = m.id_pessoa "
        "WHERE u.dh_aceite_termo IS NOT NULL "
        "GROUP BY 1")
    rows += [(dia, "--", n) for dia, n in cur.fetchall()]
    cur.close()
    upsert_rows(dw, "prescricao.fato_medico_dia",
                ["dia", "sg_uf", "novos_aceite_termo"], rows,
                ["dia", "sg_uf"])
    log(f"fato_medico_dia.novos_aceite_termo: {len(rows):,} linhas (por UF + global '--')")

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

    cur = dw.cursor()
    cur.execute("TRUNCATE prescricao.fato_medico_emissao_mes")
    cur.execute(
        "INSERT INTO prescricao.fato_medico_emissao_mes (mes, sg_uf, cpfs_distintos) "
        "SELECT to_char(f.dia,'YYYY-MM'), '--', count(DISTINCT dm.id_pessoa) "
        "FROM prescricao.fato_documento_medico_dia f "
        "JOIN prescricao.dim_medico dm ON dm.id_medico = f.id_medico "
        "GROUP BY 1 "
        "UNION ALL "
        "SELECT to_char(f.dia,'YYYY-MM'), f.sg_uf, count(DISTINCT dm.id_pessoa) "
        "FROM prescricao.fato_documento_medico_dia f "
        "JOIN prescricao.dim_medico dm ON dm.id_medico = f.id_medico "
        "WHERE f.sg_uf <> '--' "
        "GROUP BY 1, 2")
    dw.commit()
    log("fato_medico_emissao_mes: reconstruida (por mes x UF + global '--')")

    cur.execute("TRUNCATE prescricao.fato_medico_extremos_emissao")
    cur.execute(
        "INSERT INTO prescricao.fato_medico_extremos_emissao "
        "(sg_uf, id_pessoa, primeiro_dia, ultimo_dia) "
        "SELECT '--', dm.id_pessoa, min(f.dia), max(f.dia) "
        "FROM prescricao.fato_documento_medico_dia f "
        "JOIN prescricao.dim_medico dm ON dm.id_medico = f.id_medico "
        "GROUP BY 2 "
        "UNION ALL "
        "SELECT f.sg_uf, dm.id_pessoa, min(f.dia), max(f.dia) "
        "FROM prescricao.fato_documento_medico_dia f "
        "JOIN prescricao.dim_medico dm ON dm.id_medico = f.id_medico "
        "WHERE f.sg_uf <> '--' "
        "GROUP BY 1, 2")
    dw.commit()
    log("fato_medico_extremos_emissao: reconstruida")

    origin.close()
    dw.close()
    log("medicos: concluido")


if __name__ == "__main__":
    sys.exit(main())
