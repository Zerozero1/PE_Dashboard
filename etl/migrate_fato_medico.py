import sys

from common import connect_dw, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute("DROP TABLE IF EXISTS prescricao.fato_medico_dia CASCADE")
    dw.commit()
    log("fato_medico_dia removida para recriacao com novos_aceite_termo")
    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
