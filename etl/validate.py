import sys

from common import connect_dw, log


def main():
    dw = connect_dw()
    cur = dw.cursor()

    cur.execute(open("ddl_extra.sql", encoding="utf-8").read())
    dw.commit()

    cur.execute("SELECT sum(documentos), count(*) FROM prescricao.fato_documento_dia")
    total, linhas = cur.fetchone()
    log(f"fato_documento_dia: {total:,} documentos em {linhas:,} linhas")

    cur.execute("SELECT min(dia), max(dia) FROM prescricao.fato_documento_dia")
    log(f"janela: {cur.fetchone()}")

    cur.execute(
        "SELECT sg_uf, sum(documentos) AS docs FROM prescricao.fato_documento_dia "
        "GROUP BY sg_uf ORDER BY docs DESC LIMIT 5")
    for r in cur.fetchall():
        log(f"  UF {r[0]}: {r[1]:,}")

    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
