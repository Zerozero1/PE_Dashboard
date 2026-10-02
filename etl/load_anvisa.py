# -*- coding: utf-8 -*-
"""Carrega o registro de medicamentos da ANVISA (dados abertos) no DW.

Uso:
    python load_anvisa.py [arquivo.csv]

Sem arquivo, baixa de https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv
(rede interna pode exigir o download manual; nesse caso passe o caminho do CSV).

Fonte: ANVISA — Dados Abertos de Medicamentos (CSV latin-1, separador ';').
ATENCAO: a tabela da origem `prescricao.tb_medicamentos_anvisa` (bd_cfm) esta com
linhas desalinhadas (import quebrado) — NAO usar; esta carga e a versao correta.
"""
import csv
import datetime as dt
import io
import sys
import urllib.request

from common import connect_dw, log

URL = "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv"
TABLE = "prescricao.medicamento_anvisa"
COLS = [
    "tp_produto", "nm_produto", "dt_final_processo", "tp_categoria_regulatoria",
    "nu_reg_produto", "dt_vencimento_reg", "nu_processo", "tp_classe_terapeutica",
    "nm_empresa_reg", "in_situacao_reg", "ds_principio_ativo",
]


def parse_data(s):
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%m%Y", "%m/%Y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def limpa(s):
    return (s or "").strip()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if path:
        raw = open(path, "rb").read()
    else:
        log(f"baixando {URL}")
        raw = urllib.request.urlopen(URL, timeout=120).read()
    reader = csv.DictReader(io.StringIO(raw.decode("latin-1")),
                            delimiter=";", quotechar='"')
    rows = [
        (
            limpa(r["TIPO_PRODUTO"]), limpa(r["NOME_PRODUTO"]),
            parse_data(r["DATA_FINALIZACAO_PROCESSO"]),
            limpa(r["CATEGORIA_REGULATORIA"]), limpa(r["NUMERO_REGISTRO_PRODUTO"]),
            parse_data(r["DATA_VENCIMENTO_REGISTRO"]), limpa(r["NUMERO_PROCESSO"]),
            limpa(r["CLASSE_TERAPEUTICA"]), limpa(r["EMPRESA_DETENTORA_REGISTRO"]),
            limpa(r["SITUACAO_REGISTRO"]), limpa(r["PRINCIPIO_ATIVO"]),
        )
        for r in reader
    ]
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute(f"TRUNCATE {TABLE}")
    sql = (f"INSERT INTO {TABLE} ({', '.join(COLS)}) "
           f"VALUES ({', '.join(['%s'] * len(COLS))})")
    for i in range(0, len(rows), 5000):
        cur.executemany(sql, rows[i:i + 5000])
    dw.commit()
    cur.execute(f"SELECT count(*) FROM {TABLE}")
    log(f"medicamento_anvisa: {cur.fetchone()[0]:,} linhas")
    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
