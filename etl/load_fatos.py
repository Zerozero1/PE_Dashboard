import sys
import time

from common import connect_dw, connect_origin, log, upsert_rows
from config import BATCH_SIZE

SQL_DOCS = """
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
LEFT JOIN prescricao.rl_med_especialidade_consulta rec
       ON rec.id_consulta = c.id_consulta
LEFT JOIN prescricao.tb_medico_especialidade me
       ON me.id_medico_especialidade = rec.id_medico_especialidade
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


def batch_loop(origin, dw, sql, table, columns, conflict, metric_idx):
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
            upsert_rows(dw, table, columns, rows, conflict)
            total += sum(r[metric_idx] for r in rows)
        n_batch += 1
        elapsed = time.time() - t0
        log(f"{table}: lote {n_batch} ids {start}-{end} "
            f"(metric acum: {total:,} · {elapsed:.0f}s)")
        start = end + 1
    cur.close()
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
            origin, dw, SQL_DOCS, "prescricao.fato_documento_dia",
            ["dia", "sg_uf", "id_tipo_documento", "in_assinado",
             "documentos", "cancelados"],
            ["dia", "sg_uf", "id_tipo_documento", "in_assinado"], 4)
        log(f"fato_documento_dia: concluido — {total:,} documentos")

    elif mode == "especialidade":
        log("fato_documento_especialidade_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_ESPECIALIDADE,
            "prescricao.fato_documento_especialidade_dia",
            ["dia", "sg_uf", "id_medico_especialidade", "documentos"],
            ["dia", "sg_uf", "id_medico_especialidade"], 3)
        log(f"fato_documento_especialidade_dia: concluido — {total:,} registros")

    elif mode == "unidade":
        log("fato_documento_unidade_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_UNIDADE, "prescricao.fato_documento_unidade_dia",
            ["dia", "sg_uf", "id_unidade_atendimento", "documentos"],
            ["dia", "sg_uf", "id_unidade_atendimento"], 3)
        log(f"fato_documento_unidade_dia: concluido — {total:,} documentos")

    elif mode == "pacientes":
        single_pass(
            origin, dw, SQL_PACIENTES, "prescricao.fato_documento_paciente_dia",
            ["dia", "sg_uf", "pacientes_distintos"], ["dia", "sg_uf"])

    elif mode == "medico":
        log("fato_documento_medico_dia: iniciando")
        total = batch_loop(
            origin, dw, SQL_MEDICO_DOCS, "prescricao.fato_documento_medico_dia",
            ["dia", "sg_uf", "id_medico", "documentos"],
            ["dia", "sg_uf", "id_medico"], 3)
        log(f"fato_documento_medico_dia: concluido — {total:,} documentos")

    origin.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
