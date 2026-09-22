import sys

from common import connect_dw, connect_origin, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute("SELECT sum(documentos) FROM prescricao.fato_documento_dia")
    total_docs = cur.fetchone()[0]
    cur.execute("SELECT sum(documentos) FROM prescricao.fato_documento_especialidade_dia")
    total_esp = cur.fetchone()[0]
    log(f"fato_documento_dia (todos): {total_docs:,}")
    log(f"fato_documento_especialidade_dia (somados por especialidade): {total_esp:,}")
    log(f"diferenca (docs sem especialidade + duplicacoes): {total_esp - total_docs:+,}")
    dw.close()

    origin = connect_origin()
    cur = origin.cursor()
    cur.execute("SET statement_timeout = 0")
    log("origem: distribuicao de vinculos de especialidade por consulta (varredura)...")
    cur.execute(
        "SELECT n, count(*) FROM ("
        "  SELECT c.id_consulta, count(rec.id_medico_especialidade) AS n "
        "  FROM prescricao.tb_consulta c "
        "  LEFT JOIN prescricao.rl_med_especialidade_consulta rec "
        "    ON rec.id_consulta = c.id_consulta "
        "  GROUP BY c.id_consulta"
        ") s GROUP BY n ORDER BY n")
    for n, c in cur.fetchall():
        log(f"  consultas com {n} especialidade(s): {c:,}")
    origin.close()


if __name__ == "__main__":
    sys.exit(main())
