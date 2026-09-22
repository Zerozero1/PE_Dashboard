import sys

from common import connect_dw, connect_origin, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute("SELECT sum(documentos) FROM prescricao.fato_documento_dia")
    log(f"DW fato_documento_dia sum = {cur.fetchone()[0]:,}")
    cur.execute("SELECT sum(documentos) FROM prescricao.fato_documento_unidade_dia")
    log(f"DW fato_documento_unidade_dia sum = {cur.fetchone()[0]:,}")
    cur.execute("SELECT min(dia), max(dia), count(*) FROM prescricao.fato_documento_unidade_dia")
    log(f"unidade janela/linhas = {cur.fetchone()}")
    dw.close()

    origin = connect_origin()
    cur = origin.cursor()
    cur.execute("SET statement_timeout = 0")
    log("origem: count(*) de tb_consulta_documento (varredura completa)...")
    cur.execute("SELECT count(*) FROM prescricao.tb_consulta_documento")
    log(f"origem total docs = {cur.fetchone()[0]:,}")
    cur.execute(
        "SELECT count(*) FROM prescricao.tb_consulta_documento d "
        "JOIN prescricao.tb_consulta c ON c.id_consulta = d.id_consulta "
        "JOIN prescricao.rl_medico_unidade_atendimento mu "
        "ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento "
        "JOIN prescricao.tb_unidade_atendimento ua "
        "ON ua.id_unidade_atendimento = mu.id_unidade_atendimento")
    log(f"origem docs com unidade = {cur.fetchone()[0]:,}")
    origin.close()


if __name__ == "__main__":
    sys.exit(main())
