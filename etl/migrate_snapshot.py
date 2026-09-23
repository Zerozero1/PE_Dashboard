import sys

from common import connect_dw, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute("DROP TABLE IF EXISTS prescricao.fato_medico_snapshot CASCADE")
    dw.commit()
    log("fato_medico_snapshot removida para recriacao (sem inscricoes_ativas, ativos = CPF com aceite)")
    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
