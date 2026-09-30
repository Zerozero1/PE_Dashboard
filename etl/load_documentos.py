import sys
import time

import psycopg2

from common import connect_dw, connect_origin, log, upsert_rows


FACT = "prescricao.fato_documento_emissao"
COLUMNS = [
    "id_consulta_documento", "dia", "dh_documento", "id_medico", "sg_uf",
    "id_tipo_documento", "id_unidade_atendimento", "in_assinado", "in_cancelado",
    "ds_qrcode",
]
BATCH_IDS = 2000000
LOOKBACK_BATCHES = 2
CHUNK = 50000

SQL_DOCUMENTOS = """
SELECT d.id_consulta_documento,
       d.dh_documento::date AS dia,
       d.dh_documento,
       mu.id_medico,
       CASE WHEN ua.sg_uf = 'BR' THEN '--' ELSE COALESCE(ua.sg_uf, '--') END AS sg_uf,
       d.id_tipo_documento,
       mu.id_unidade_atendimento,
       COALESCE(NULLIF(d.in_assinado, ''), 'N') AS in_assinado,
       COALESCE(NULLIF(d.in_cancelado, ''), 'N') AS in_cancelado,
       NULLIF(d.ds_qrcode, '') AS ds_qrcode
  FROM prescricao.tb_consulta_documento d
  LEFT JOIN prescricao.tb_consulta c
    ON c.id_consulta = d.id_consulta
  LEFT JOIN prescricao.rl_medico_unidade_atendimento mu
    ON mu.id_medico_unidade_atendimento = c.id_medico_unidade_atendimento
  LEFT JOIN prescricao.tb_unidade_atendimento ua
    ON ua.id_unidade_atendimento = mu.id_unidade_atendimento
 WHERE d.id_consulta_documento BETWEEN %s AND %s
   AND mu.id_medico IS NOT NULL
 ORDER BY d.id_consulta_documento
"""


def carregar_lote(dw, start, end):
    origin = connect_origin()
    origin.autocommit = False
    try:
        setup = origin.cursor()
        setup.execute("SET LOCAL statement_timeout = 0")
        setup.execute("SET LOCAL work_mem = '256MB'")
        setup.close()

        source = origin.cursor(name="documentos_emitidos")
        source.itersize = CHUNK
        source.execute(SQL_DOCUMENTOS, (start, end))

        total = 0
        while True:
            rows = source.fetchmany(CHUNK)
            if not rows:
                break
            upsert_rows(dw, FACT, COLUMNS, rows, ["id_consulta_documento"])
            total += len(rows)
        source.close()
    finally:
        try:
            origin.rollback()
        except psycopg2.Error:
            pass
        try:
            origin.close()
        except psycopg2.Error:
            pass
    return total


def main():
    dw = connect_dw()

    origin = connect_origin()
    cur = origin.cursor()
    cur.execute("SELECT max(id_consulta_documento) FROM prescricao.tb_consulta_documento")
    source_max = cur.fetchone()[0]
    cur.close()
    origin.close()

    cur = dw.cursor()
    cur.execute(f"SELECT max(id_consulta_documento) FROM {FACT}")
    loaded_max = cur.fetchone()[0]
    cur.close()

    if source_max is None:
        log("documentos emitidos: origem sem documentos")
        dw.close()
        return

    if loaded_max is None:
        start = 1
        log(f"documentos emitidos: carga cheia de {start:,} a {source_max:,}")
    else:
        inicio_lote = (loaded_max // BATCH_IDS) * BATCH_IDS
        start = max(1, inicio_lote - (LOOKBACK_BATCHES * BATCH_IDS))
        log(f"documentos emitidos: incremental de {start:,} a {source_max:,} "
            f"(max carregado {loaded_max:,})")

    if start > source_max:
        log("documentos emitidos: nada a carregar")
        dw.close()
        return

    total = 0
    t0 = time.time()
    n_batch = 0
    while start <= source_max:
        end = min(start + BATCH_IDS - 1, source_max)
        n = None
        for attempt in range(1, 4):
            try:
                n = carregar_lote(dw, start, end)
                break
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                if attempt == 3:
                    raise RuntimeError(
                        f"documentos emitidos: lote {start:,}-{end:,} falhou apos 3 tentativas") from e
                log(f"documentos emitidos: lote {start:,}-{end:,} caiu "
                    f"({e.__class__.__name__}: {e}); tentativa {attempt + 1}/3")
                time.sleep(attempt * 5)
        total += n
        n_batch += 1
        log(f"documentos emitidos: lote {n_batch} ids {start:,}-{end:,} "
            f"({n:,} linhas · acumulado {total:,} · {time.time()-t0:.0f}s)")
        start = end + 1

    dw.close()
    log(f"documentos emitidos: concluido — {total:,} linhas em {time.time()-t0:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
