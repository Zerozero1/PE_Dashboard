import sys
from datetime import date, timedelta

from common import connect_dw, connect_origin, log, upsert_rows


def load_dim_data(dw):
    start = date(2021, 11, 1)
    end = date.today()
    rows = []
    d = start
    while d <= end:
        rows.append((d, d.year, d.month, f"{d.year}-{d.month:02d}"))
        d += timedelta(days=1)
    upsert_rows(dw, "prescricao.dim_data",
                ["data", "ano", "mes", "ano_mes"], rows, ["data"])
    log(f"dim_data: {len(rows)} linhas")


def load_simple_dim(origin, dw, table, columns, sql, conflict):
    cur = origin.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    upsert_rows(dw, table, columns, rows, conflict)
    log(f"{table}: {len(rows)} linhas")


def main():
    origin = connect_origin()
    dw = connect_dw()
    log("dimensoes: iniciando")

    load_dim_data(dw)

    load_simple_dim(
        origin, dw, "prescricao.dim_uf",
        ["sg_uf", "ds_uf", "in_regiao"],
        "SELECT sg_uf, ds_uf, in_regiao FROM prescricao.td_uf", ["sg_uf"])

    load_simple_dim(
        origin, dw, "prescricao.dim_tipo_documento",
        ["id_tipo_documento", "nm_documento", "in_ativo"],
        "SELECT id_tipo_documento, nm_documento, in_ativo FROM prescricao.td_tipo_documento",
        ["id_tipo_documento"])

    cur = origin.cursor()
    cur.execute(
        "SELECT id_medico, nu_crm, sg_uf, in_situacao, in_tipo_inscricao "
        "FROM prescricao.tb_medico")
    log("tb_medico: lendo 605k linhas (sem ds_foto)...")
    for batch in iter(lambda: cur.fetchmany(20000), []):
        upsert_rows(dw, "prescricao.dim_medico",
                    ["id_medico", "nu_crm", "sg_uf", "in_situacao", "in_tipo_inscricao"],
                    batch, ["id_medico"])
    cur.close()
    log("dim_medico: carregada")

    cur = origin.cursor()
    cur.execute(
        "SELECT id_medico_especialidade, id_medico, ds_especialidade, nu_registro "
        "FROM prescricao.tb_medico_especialidade")
    for batch in iter(lambda: cur.fetchmany(20000), []):
        upsert_rows(dw, "prescricao.dim_especialidade",
                    ["id_medico_especialidade", "id_medico", "ds_especialidade", "nu_registro"],
                    batch, ["id_medico_especialidade"])
    cur.close()
    log("dim_especialidade: carregada")

    cur = origin.cursor()
    cur.execute(
        "SELECT id_unidade_atendimento, sg_uf FROM prescricao.tb_unidade_atendimento")
    for batch in iter(lambda: cur.fetchmany(20000), []):
        upsert_rows(dw, "prescricao.dim_unidade",
                    ["id_unidade_atendimento", "sg_uf"], batch,
                    ["id_unidade_atendimento"])
    cur.close()
    log("dim_unidade: carregada")

    cur = origin.cursor()
    cur.execute(
        "SELECT id_farmaceutico, sg_uf FROM prescricao.tb_farmaceutico")
    for batch in iter(lambda: cur.fetchmany(20000), []):
        upsert_rows(dw, "prescricao.dim_farmaceutico",
                    ["id_farmaceutico", "sg_uf"], batch,
                    ["id_farmaceutico"])
    cur.close()
    log("dim_farmaceutico: carregada")

    origin.close()
    dw.close()
    log("dimensoes: concluido")


if __name__ == "__main__":
    sys.exit(main())
