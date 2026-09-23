import sys

from common import connect_dw, log

TABLES = [
    "dim_data", "dim_uf", "dim_tipo_documento", "dim_medico",
    "dim_especialidade", "dim_unidade",
    "fato_documento_dia", "fato_documento_especialidade_dia",
    "fato_documento_unidade_dia", "fato_documento_medico_dia",
    "fato_documento_paciente_dia", "fato_medico_dia",
    "fato_medico_snapshot",
    "fato_auditoria_dia", "dashboard_refresh_config",
    "dashboard_refresh_job",
]


def main():
    dw = connect_dw()
    cur = dw.cursor()
    for t in TABLES:
        cur.execute(f"SELECT count(*) FROM prescricao.{t}")
        n = cur.fetchone()[0]
        log(f"{t:38s} {n:>12,}")

    log("--- coberturas ---")
    cur.execute("SELECT sum(documentos) FROM prescricao.fato_documento_dia")
    log(f"fato_documento_dia: {cur.fetchone()[0]:,} documentos")
    cur.execute("SELECT min(dia), max(dia) FROM prescricao.fato_documento_dia")
    log(f"janela documentos: {cur.fetchone()}")
    cur.execute(
        "SELECT tipo_anomalia, count(*) FROM prescricao.fato_auditoria_dia "
        "GROUP BY 1 ORDER BY 1")
    log(f"anomalias: {cur.fetchall()}")
    cur.execute(
        "SELECT count(*) FROM prescricao.fato_medico_dia WHERE novos_por_dh_atualizacao > 0")
    log(f"fato_medico_dia linhas com novos: {cur.fetchone()[0]:,}")
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
