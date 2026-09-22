import sys

from common import connect_dw, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute("DROP TABLE IF EXISTS prescricao.fato_documento_dia CASCADE")
    cur.execute("DROP TABLE IF EXISTS prescricao.stg_documento_dia CASCADE")
    dw.commit()
    log("fato/stg_documento_dia removidas para recriacao sem in_assinado")
    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
