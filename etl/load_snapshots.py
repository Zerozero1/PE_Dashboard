import sys
import time

from common import connect_dw, log


def main():
    dw = connect_dw()
    t0 = time.time()
    cur = dw.cursor()
    cur.execute("SET work_mem = '512MB'")

    cur.execute("TRUNCATE prescricao.snap_medico_tipo")
    cur.execute(
        "INSERT INTO prescricao.snap_medico_tipo "
        "(id_medico, sg_uf, id_tipo_documento, documentos) "
        "SELECT id_medico, sg_uf, id_tipo_documento, sum(documentos)::bigint "
        "  FROM prescricao.fato_documento_medico_tipo_dia "
        " GROUP BY 1, 2, 3"
    )
    log(f"snap_medico_tipo: {cur.rowcount:,} linhas")
    dw.commit()

    cur.execute("TRUNCATE prescricao.snap_medico_paciente")
    cur.execute(
        "INSERT INTO prescricao.snap_medico_paciente (id_medico, sg_uf, pacientes) "
        "SELECT id_medico, sg_uf, count(DISTINCT id_paciente)::bigint "
        "  FROM prescricao.fato_documento_medico_paciente_dia "
        " GROUP BY 1, 2"
    )
    log(f"snap_medico_paciente (por UF): {cur.rowcount:,} linhas")
    dw.commit()
    cur.execute(
        "INSERT INTO prescricao.snap_medico_paciente (id_medico, sg_uf, pacientes) "
        "SELECT id_medico, '**', count(DISTINCT id_paciente)::bigint "
        "  FROM prescricao.fato_documento_medico_paciente_dia "
        " GROUP BY 1"
    )
    log(f"snap_medico_paciente (global '**'): {cur.rowcount:,} linhas")
    dw.commit()

    cur.execute("TRUNCATE prescricao.snap_instituicao")
    cur.execute(
        "INSERT INTO prescricao.snap_instituicao "
        "(chave, instituicao, cnes, uf, unidades, medicos, pacientes) "
        "WITH por_instituicao AS ("
        "  SELECT COALESCE(NULLIF(u.co_cnes, ''), 'UNIDADE:' || f.id_unidade_atendimento::text) AS chave,"
        "         NULLIF(u.co_cnes, '') AS cnes,"
        "         MAX(NULLIF(u.nm_unidade, '')) AS instituicao,"
        "         MAX(f.sg_uf) AS uf,"
        "         count(DISTINCT f.id_unidade_atendimento)::int AS unidades,"
        "         count(DISTINCT f.id_paciente)::bigint AS pacientes"
        "    FROM prescricao.fato_documento_unidade_paciente_dia f"
        "    LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = f.id_unidade_atendimento"
        "   GROUP BY 1, 2"
        "), medicos_instituicao AS ("
        "  SELECT COALESCE(NULLIF(u.co_cnes, ''), 'UNIDADE:' || mu.id_unidade_atendimento::text) AS chave,"
        "         count(DISTINCT mu.id_medico)::int AS medicos"
        "    FROM prescricao.fato_medico_unidade mu"
        "    LEFT JOIN prescricao.dim_unidade u ON u.id_unidade_atendimento = mu.id_unidade_atendimento"
        "   WHERE mu.in_ativo = 'S'"
        "   GROUP BY 1"
        ")"
        "SELECT i.chave, i.instituicao, i.cnes, i.uf, i.unidades,"
        "       COALESCE(m.medicos, 0), i.pacientes"
        "  FROM por_instituicao i"
        "  LEFT JOIN medicos_instituicao m ON m.chave = i.chave"
    )
    log(f"snap_instituicao: {cur.rowcount:,} linhas")
    dw.commit()

    cur.execute("TRUNCATE prescricao.snap_especialidade")
    cur.execute(
        "INSERT INTO prescricao.snap_especialidade "
        "(sg_uf, id_medico_especialidade, documentos) "
        "SELECT sg_uf, id_medico_especialidade, sum(documentos)::bigint "
        "  FROM prescricao.fato_documento_especialidade_dia "
        " GROUP BY 1, 2"
    )
    log(f"snap_especialidade: {cur.rowcount:,} linhas")
    dw.commit()

    cur.execute("TRUNCATE prescricao.snap_especialidade_medicos")
    cur.execute(
        "INSERT INTO prescricao.snap_especialidade_medicos "
        "(sg_uf, ds_especialidade, medicos, documentos) "
        "SELECT f.sg_uf, COALESCE(NULLIF(btrim(e.ds_especialidade), ''), 'NAO_INFORMADO'), "
        "       count(DISTINCT dm.id_pessoa)::bigint, sum(f.documentos)::bigint "
        "  FROM prescricao.fato_documento_especialidade_dia f "
        "  JOIN prescricao.dim_especialidade e "
        "    ON e.id_medico_especialidade = f.id_medico_especialidade "
        "  JOIN prescricao.dim_medico dm ON dm.id_medico = e.id_medico "
        " GROUP BY 1, 2"
    )
    log(f"snap_especialidade_medicos (por UF): {cur.rowcount:,} linhas")
    dw.commit()
    cur.execute(
        "INSERT INTO prescricao.snap_especialidade_medicos "
        "(sg_uf, ds_especialidade, medicos, documentos) "
        "SELECT '**', COALESCE(NULLIF(btrim(e.ds_especialidade), ''), 'NAO_INFORMADO'), "
        "       count(DISTINCT dm.id_pessoa)::bigint, sum(f.documentos)::bigint "
        "  FROM prescricao.fato_documento_especialidade_dia f "
        "  JOIN prescricao.dim_especialidade e "
        "    ON e.id_medico_especialidade = f.id_medico_especialidade "
        "  JOIN prescricao.dim_medico dm ON dm.id_medico = e.id_medico "
        " GROUP BY 2"
    )
    log(f"snap_especialidade_medicos (global '**'): {cur.rowcount:,} linhas")
    dw.commit()

    cur.execute("TRUNCATE prescricao.snap_medicamento_top")
    base = (
        "SELECT sg_uf, id_tipo_documento, medicamento, sum(itens)::bigint AS itens "
        "  FROM prescricao.fato_receita_medicamento_mes GROUP BY 1, 2, 3"
    )
    combos = [
        ("UF+tipo", f"SELECT sg_uf, id_tipo_documento, medicamento, itens FROM ({base}) b"),
        ("UF", f"SELECT sg_uf, 0 AS id_tipo_documento, medicamento, "
               f"sum(itens)::bigint AS itens FROM ({base}) b GROUP BY 1, 3"),
        ("tipo", f"SELECT '**'::char(2) AS sg_uf, id_tipo_documento, medicamento, "
                 f"sum(itens)::bigint AS itens FROM ({base}) b GROUP BY 2, 3"),
        ("global", f"SELECT '**'::char(2) AS sg_uf, 0 AS id_tipo_documento, medicamento, "
                   f"sum(itens)::bigint AS itens FROM ({base}) b GROUP BY 3"),
    ]
    for nome, sql in combos:
        part = (["sg_uf", "id_tipo_documento"] if nome == "UF+tipo"
                else ["sg_uf"] if nome == "UF"
                else ["id_tipo_documento"] if nome == "tipo" else [])
        cur.execute(
            "INSERT INTO prescricao.snap_medicamento_top "
            "(sg_uf, id_tipo_documento, posicao, medicamento, itens) "
            "SELECT sg_uf, id_tipo_documento, posicao, medicamento, itens FROM ("
            "  SELECT sg_uf, id_tipo_documento, medicamento, itens,"
            "         row_number() OVER ("
            + ("PARTITION BY " + ", ".join(part) if part else "")
            + " ORDER BY itens DESC) AS posicao FROM (" + sql + ") c"
            ") d WHERE posicao <= 100"
        )
        log(f"snap_medicamento_top ({nome}): {cur.rowcount:,} linhas")
        dw.commit()

    cur.close()
    dw.close()
    log(f"snapshots: concluido em {time.time()-t0:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
