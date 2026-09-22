import sys

from common import connect_dw, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute("ALTER TABLE prescricao.dim_data DROP COLUMN IF EXISTS dia_semana")
    cur.execute(
        "ALTER TABLE prescricao.fato_medico_dia "
        "DROP COLUMN IF EXISTS inscricoes_cadastradas, "
        "DROP COLUMN IF EXISTS inscricoes_ativas, "
        "DROP COLUMN IF EXISTS medicos_ativos")
    dw.commit()
    log("colunas sem uso removidas (dim_data.dia_semana; fato_medico_dia x3)")
    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
