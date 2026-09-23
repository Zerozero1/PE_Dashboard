import sys

from common import connect_dw, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute("DROP TABLE IF EXISTS prescricao.fato_dispensacao_dia CASCADE")
    cur.execute("DROP TABLE IF EXISTS prescricao.dim_farmaceutico CASCADE")
    dw.commit()
    log("fato_dispensacao_dia e dim_farmaceutico removidas (visao dispensacoes descontinuada)")
    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
