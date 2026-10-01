import sys
import time

from common import connect_dw, connect_origin, log, upsert_rows
from config import BATCH_SIZE

SQL_DOCS = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       d.id_tipo_documento,
       count(*) AS documentos,
       count(*) FILTER (WHERE d.in_assinado = 'S') AS assinados,
       count(*) FILTER (WHERE d.in_cancelado = 'S') AS cancelados
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
WHERE d.id_consulta_documento BETWEEN %s AND %s
GROUP BY 1, 2, 3
"""

SQL_VERSAO = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       COALESCE(NULLIF(btrim(d.ds_versao_sistema), ''), 'NAO_INFORMADO') AS ds_versao_sistema,
       count(*) AS documentos
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
WHERE d.id_consulta_documento BETWEEN %s AND %s
GROUP BY 1, 2, 3
"""

SQL_ORIGEM = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       COALESCE(NULLIF(d.ds_origem_criacao, ''), 'NAO_INFORMADO') AS ds_origem_criacao,
       count(*) AS documentos
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
WHERE d.id_consulta_documento BETWEEN %s AND %s
GROUP BY 1, 2, 3
"""

SQL_ESPECIALIDADE = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       me.id_medico_especialidade,
       count(*) AS documentos
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
LEFT JOIN prescricao.tb_medico_especialidade me
       ON me.id_medico = mu.id_medico AND me.in_ativo = 'S'
WHERE d.id_consulta_documento BETWEEN %s AND %s
  AND me.id_medico_especialidade IS NOT NULL
GROUP BY 1, 2, 3
"""

SQL_UNIDADE = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       ua.id_unidade_atendimento,
       count(*) AS documentos
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
WHERE d.id_consulta_documento BETWEEN %s AND %s
  AND ua.id_unidade_atendimento IS NOT NULL
GROUP BY 1, 2, 3
"""

SQL_MEDICO_DOCS = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       mu.id_medico,
       count(*) AS documentos
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
WHERE d.id_consulta_documento BETWEEN %s AND %s
  AND mu.id_medico IS NOT NULL
GROUP BY 1, 2, 3
"""

SQL_MEDICO_TIPO = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       mu.id_medico,
       d.id_tipo_documento,
       count(*) AS documentos
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
WHERE d.id_consulta_documento BETWEEN %s AND %s
  AND mu.id_medico IS NOT NULL
GROUP BY 1, 2, 3, 4
"""

SQL_PACIENTES = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       count(DISTINCT mp.id_paciente) AS pacientes_distintos
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
LEFT JOIN prescricao.rl_medico_paciente mp
       ON mp.id_medico_paciente = c.id_medico_paciente
GROUP BY 1, 2
"""

SQL_MEDICO_PACIENTE = """
SELECT DISTINCT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       mu.id_medico,
       mp.id_paciente
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
LEFT JOIN prescricao.rl_medico_paciente mp
       ON mp.id_medico_paciente = c.id_medico_paciente
WHERE d.id_consulta_documento BETWEEN %s AND %s
  AND mu.id_medico IS NOT NULL
  AND mp.id_paciente IS NOT NULL
"""

SQL_UNIDADE_PACIENTE = """
SELECT DISTINCT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       ua.id_unidade_atendimento,
       mp.id_paciente
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
LEFT JOIN prescricao.rl_medico_paciente mp
       ON mp.id_medico_paciente = c.id_medico_paciente
WHERE d.id_consulta_documento BETWEEN %s AND %s
  AND d.in_assinado = 'S'
  AND ua.id_unidade_atendimento IS NOT NULL
  AND mp.id_paciente IS NOT NULL
"""

SQL_MEDICO_UNIDADE = """
SELECT id_medico,
       id_unidade_atendimento,
       COALESCE(NULLIF(in_ativo, ''), 'N') AS in_ativo,
       dt_cadastro
  FROM prescricao.rl_medico_unidade_atendimento
"""

SQL_MEDICOS = """
SELECT d.dh_documento::date AS dia,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       count(DISTINCT mu.id_medico) AS medicos
FROM prescricao.tb_consulta_documento d
LEFT JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta
LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
       ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
LEFT JOIN prescricao.tb_unidade_atendimento ua
       ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
GROUP BY 1, 2
"""


def batch_loop(origin, dw, sql, stg, columns, conflict, fact, metric_idx):
    from common import append_rows, rebuild_fact, truncate_table
    truncate_table(dw, stg)
    cur = origin.cursor()
    cur.execute("SELECT max(id_consulta_documento) FROM prescricao.tb_consulta_documento")
    max_id = cur.fetchone()[0]
    total = 0
    start = 1
    t0 = time.time()
    n_batch = 0
    while start <= max_id:
        end = min(start + BATCH_SIZE - 1, max_id)
        cur.execute(sql, (start, end))
        rows = cur.fetchall()
        if rows:
            append_rows(dw, stg, columns, rows)
            total += sum(r[metric_idx] for r in rows)
        n_batch += 1
        elapsed = time.time() - t0
        log(f"{stg}: lote {n_batch} ids {start}-{end} "
            f"(metric acum: {total:,} · {elapsed:.0f}s)")
        start = end + 1
    cur.close()
    rebuild_fact(dw, fact, columns, stg, conflict)
    return total


def single_pass(origin, dw, sql, table, columns, conflict):
    log(f"{table}: consulta unica de agregacao (varredura completa, pode demorar)...")
    t0 = time.time()
    cur = origin.cursor()
    cur.execute("SET statement_timeout = 0")
    cur.execute("SET work_mem = '256MB'")
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    if rows:
        upsert_rows(dw, table, columns, rows, conflict)
    log(f"{table}: {len(rows):,} linhas em {time.time()-t0:.0f}s")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "docs"
    origin = connect_origin()
    dw = connect_dw()

    if mode == "docs":
        log("fato_documento_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_DOCS, "prescricao.stg_documento_dia",
            ["dia", "sg_uf", "id_tipo_documento",
             "documentos", "assinados", "cancelados"],
            ["dia", "sg_uf", "id_tipo_documento"],
            "prescricao.fato_documento_dia", 3)
        log(f"fato_documento_dia: concluido — {total:,} documentos")

    elif mode == "versao":
        log("fato_documento_versao_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_VERSAO, "prescricao.stg_documento_versao_dia",
            ["dia", "sg_uf", "ds_versao_sistema", "documentos"],
            ["dia", "sg_uf", "ds_versao_sistema"],
            "prescricao.fato_documento_versao_dia", 3)
        log(f"fato_documento_versao_dia: concluido — {total:,} documentos")

    elif mode == "origem":
        log("fato_documento_origem_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_ORIGEM, "prescricao.stg_documento_origem_dia",
            ["dia", "sg_uf", "ds_origem_criacao", "documentos"],
            ["dia", "sg_uf", "ds_origem_criacao"],
            "prescricao.fato_documento_origem_dia", 3)
        log(f"fato_documento_origem_dia: concluido — {total:,} documentos")

    elif mode == "especialidade":
        log("fato_documento_especialidade_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_ESPECIALIDADE,
            "prescricao.stg_documento_especialidade_dia",
            ["dia", "sg_uf", "id_medico_especialidade", "documentos"],
            ["dia", "sg_uf", "id_medico_especialidade"],
            "prescricao.fato_documento_especialidade_dia", 3)
        log(f"fato_documento_especialidade_dia: concluido — {total:,} registros")

    elif mode == "unidade":
        log("fato_documento_unidade_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_UNIDADE, "prescricao.stg_documento_unidade_dia",
            ["dia", "sg_uf", "id_unidade_atendimento", "documentos"],
            ["dia", "sg_uf", "id_unidade_atendimento"],
            "prescricao.fato_documento_unidade_dia", 3)
        log(f"fato_documento_unidade_dia: concluido — {total:,} documentos")

    elif mode == "pacientes":
        single_pass(
            origin, dw, SQL_PACIENTES, "prescricao.fato_documento_paciente_dia",
            ["dia", "sg_uf", "pacientes_distintos"], ["dia", "sg_uf"])

    elif mode == "medico":
        log("fato_documento_medico_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_MEDICO_DOCS, "prescricao.stg_documento_medico_dia",
            ["dia", "sg_uf", "id_medico", "documentos"],
            ["dia", "sg_uf", "id_medico"],
            "prescricao.fato_documento_medico_dia", 3)
        log(f"fato_documento_medico_dia: concluido — {total:,} documentos")

    elif mode == "medico_tipo":
        log("fato_documento_medico_tipo_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_MEDICO_TIPO, "prescricao.stg_documento_medico_tipo_dia",
            ["dia", "sg_uf", "id_medico", "id_tipo_documento", "documentos"],
            ["dia", "sg_uf", "id_medico", "id_tipo_documento"],
            "prescricao.fato_documento_medico_tipo_dia", 4)
        log(f"fato_documento_medico_tipo_dia: concluido — {total:,} documentos")

    elif mode == "medico_pacientes":
        log("fato_documento_medico_paciente_dia: iniciando")
        from common import append_rows, truncate_table
        stg = "prescricao.stg_documento_medico_paciente_dia"
        truncate_table(dw, stg)
        cur = origin.cursor()
        cur.execute("SET statement_timeout = 0")
        cur.execute("SET work_mem = '256MB'")
        cur.execute("SELECT max(id_consulta_documento) FROM prescricao.tb_consulta_documento")
        max_id = cur.fetchone()[0]
        start = 1
        t0 = time.time()
        n_batch = 0
        total = 0
        while start <= max_id:
            end = min(start + BATCH_SIZE - 1, max_id)
            cur.execute(SQL_MEDICO_PACIENTE, (start, end))
            rows = cur.fetchall()
            if rows:
                append_rows(dw, stg, ["dia", "sg_uf", "id_medico", "id_paciente"], rows)
                total += len(rows)
            n_batch += 1
            elapsed = time.time() - t0
            log(f"{stg}: lote {n_batch} ids {start}-{end} "
                f"(acum {total:,} · {elapsed:.0f}s)")
            start = end + 1
        cur.close()
        cur2 = dw.cursor()
        cur2.execute("TRUNCATE prescricao.fato_documento_medico_paciente_dia")
        cur2.execute(
            "INSERT INTO prescricao.fato_documento_medico_paciente_dia "
            "SELECT dia, sg_uf, id_medico, id_paciente FROM " + stg)
        cur2.execute(f"TRUNCATE {stg}")
        dw.commit()
        cur2.close()
        log(f"fato_documento_medico_paciente_dia: concluido — {total:,} linhas")

    elif mode == "unidade_pacientes":
        log("fato_documento_unidade_paciente_dia: iniciando (somente assinados)")
        from common import append_rows, truncate_table
        stg = "prescricao.stg_documento_unidade_paciente_dia"
        truncate_table(dw, stg)
        cur = origin.cursor()
        cur.execute("SET statement_timeout = 0")
        cur.execute("SET work_mem = '256MB'")
        cur.execute("SELECT max(id_consulta_documento) FROM prescricao.tb_consulta_documento")
        max_id = cur.fetchone()[0]
        start = 1
        t0 = time.time()
        n_batch = 0
        total = 0
        while start <= max_id:
            end = min(start + BATCH_SIZE - 1, max_id)
            cur.execute(SQL_UNIDADE_PACIENTE, (start, end))
            rows = cur.fetchall()
            if rows:
                append_rows(dw, stg, ["dia", "sg_uf", "id_unidade_atendimento", "id_paciente"], rows)
                total += len(rows)
            n_batch += 1
            elapsed = time.time() - t0
            log(f"{stg}: lote {n_batch} ids {start}-{end} "
                f"(acum {total:,} · {elapsed:.0f}s)")
            start = end + 1
        cur.close()
        cur2 = dw.cursor()
        cur2.execute("TRUNCATE prescricao.fato_documento_unidade_paciente_dia")
        cur2.execute(
            "INSERT INTO prescricao.fato_documento_unidade_paciente_dia "
            "SELECT dia, sg_uf, id_unidade_atendimento, id_paciente FROM " + stg)
        cur2.execute(f"TRUNCATE {stg}")
        dw.commit()
        cur2.close()
        log(f"fato_documento_unidade_paciente_dia: concluido — {total:,} linhas")

    elif mode == "medico_unidade":
        log("fato_medico_unidade: iniciando (snapshot de vinculos)")
        from common import append_rows, truncate_table
        stg = "prescricao.stg_medico_unidade"
        truncate_table(dw, stg)
        cur = origin.cursor()
        cur.execute("SET statement_timeout = 0")
        cur.execute(SQL_MEDICO_UNIDADE)
        rows = cur.fetchall()
        cur.close()
        if rows:
            append_rows(dw, stg,
                        ["id_medico", "id_unidade_atendimento", "in_ativo", "dt_cadastro"],
                        rows)
        cur2 = dw.cursor()
        cur2.execute("TRUNCATE prescricao.fato_medico_unidade")
        cur2.execute(
            "INSERT INTO prescricao.fato_medico_unidade "
            "SELECT id_medico, id_unidade_atendimento, in_ativo, dt_cadastro FROM " + stg)
        cur2.execute(f"TRUNCATE {stg}")
        dw.commit()
        cur2.close()
        log(f"fato_medico_unidade: concluido — {len(rows):,} linhas")

    origin.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
