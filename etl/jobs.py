"""Orquestracao da carga via fila `dashboard_refresh_job` no DW.

Uso:
  python jobs.py worker                # consome jobs queued (FOR UPDATE SKIP LOCKED)
  python jobs.py scheduler             # cria jobs scheduled conforme dashboard_refresh_config
  python jobs.py enqueue-manual <e-mail>   # job manual (botao "Atualizar dados")
  python jobs.py enqueue-scheduled     # forca um job scheduled (teste/CLI)

A aplicacao web e este processo se comunicam exclusivamente pelo DW.
"""
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from common import connect_dw, log

POLL_SECONDS = 15
ETL_DIR = os.path.dirname(os.path.abspath(__file__))


def enqueue(dw, tipo, solicitado_por=None, agendado_para=None):
    cur = dw.cursor()
    cur.execute(
        "SELECT id_job, status FROM prescricao.dashboard_refresh_job "
        "WHERE status IN ('queued', 'running') ORDER BY id_job LIMIT 1")
    row = cur.fetchone()
    if row:
        log(f"ja existe job ativo: id {row[0]} ({row[1]})")
        return row
    cur.execute(
        "INSERT INTO prescricao.dashboard_refresh_job "
        "(tipo, solicitado_por, agendado_para) VALUES (%s, %s, %s) "
        "RETURNING id_job",
        (tipo, solicitado_por, agendado_para))
    jid = cur.fetchone()[0]
    dw.commit()
    cur.close()
    log(f"job {tipo} criado: id {jid}")
    return jid, "queued"


def claim(dw):
    cur = dw.cursor()
    cur.execute(
        "UPDATE prescricao.dashboard_refresh_job "
        "SET status='running', iniciado_em=now(), lock_key=gen_random_uuid(), "
        "    updated_at=now() "
        "WHERE id_job = (SELECT id_job FROM prescricao.dashboard_refresh_job "
        "               WHERE status='queued' ORDER BY id_job "
        "               FOR UPDATE SKIP LOCKED LIMIT 1) "
        "RETURNING id_job")
    row = cur.fetchone()
    dw.commit()
    cur.close()
    return row[0] if row else None


def finish(dw, jid, status, mensagem):
    cur = dw.cursor()
    cur.execute(
        "UPDATE prescricao.dashboard_refresh_job "
        "SET status=%s, finalizado_em=now(), mensagem=%s, updated_at=now() "
        "WHERE id_job=%s",
        (status, mensagem[:2000], jid))
    dw.commit()
    cur.close()


def run_pipeline():
    log("executando pipeline run_all.py ...")
    t0 = time.time()
    proc = subprocess.run(
        [sys.executable, "run_all.py"], cwd=ETL_DIR,
        capture_output=True, text=True)
    elapsed = time.time() - t0
    if proc.returncode == 0:
        return True, f"ETL concluido em {elapsed:.0f}s"
    tail = "\n".join(proc.stderr.strip().splitlines()[-5:])
    return False, f"falha (exit {proc.returncode}): {tail[:1500]}"


def recover_stale(dw):
    cur = dw.cursor()
    cur.execute(
        "UPDATE prescricao.dashboard_refresh_job "
        "SET status='failed', finalizado_em=now(), "
        "    mensagem='interrompido (worker reiniciado)', updated_at=now() "
        "WHERE status='running'")
    n = cur.rowcount
    dw.commit()
    cur.close()
    if n:
        log(f"recuperacao: {n} job(s) running marcados como falhos")


def worker():
    dw = connect_dw()
    recover_stale(dw)
    log("worker iniciado; aguardando jobs queued...")
    while True:
        try:
            jid = claim(dw)
            if jid is None:
                time.sleep(POLL_SECONDS)
                continue
            log(f"job {jid}: running")
            ok, msg = run_pipeline()
            finish(dw, jid, "success" if ok else "failed", msg)
            log(f"job {jid}: {'success' if ok else 'failed'} — {msg}")
        except KeyboardInterrupt:
            log("worker interrompido")
            break
        except Exception as e:
            log(f"erro no worker: {e}")
            time.sleep(POLL_SECONDS)
    dw.close()


def scheduler():
    dw = connect_dw()
    log("scheduler iniciado")
    while True:
        try:
            cur = dw.cursor()
            cur.execute(
                "SELECT horario_diario, timezone, ativo, "
                "       intervalo_verificacao_minutos "
                "FROM prescricao.dashboard_refresh_config WHERE id = 1")
            horario, tz_name, ativo, intervalo = cur.fetchone()
            cur.close()

            if not ativo:
                time.sleep(intervalo * 60)
                continue

            tz = ZoneInfo(tz_name)
            agora = datetime.now(tz)
            limite = datetime.combine(agora.date(), horario, tzinfo=tz)
            cur = dw.cursor()
            cur.execute(
                "SELECT count(*) FROM prescricao.dashboard_refresh_job "
                "WHERE tipo='scheduled' AND status IN ('queued','running','success') "
                "AND agendado_para >= %s",
                (datetime.combine(agora.date(), datetime.min.time(), tzinfo=tz),))
            ja_existe = cur.fetchone()[0] > 0
            cur.close()

            if agora >= limite and not ja_existe:
                enqueue(dw, "scheduled", "scheduler", limite)
                cur = dw.cursor()
                cur.execute(
                    "UPDATE prescricao.dashboard_refresh_config "
                    "SET ultima_execucao_programada_em = now() WHERE id = 1")
                dw.commit()
                cur.close()

            time.sleep((intervalo or 5) * 60)
        except KeyboardInterrupt:
            log("scheduler interrompido")
            break
        except Exception as e:
            log(f"erro no scheduler: {e}")
            time.sleep(60)
    dw.close()


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "worker"
    if cmd == "worker":
        worker()
    elif cmd == "scheduler":
        scheduler()
    elif cmd == "enqueue-manual":
        email = sys.argv[2] if len(sys.argv) > 2 else None
        dw = connect_dw()
        enqueue(dw, "manual", email)
        dw.close()
    elif cmd == "enqueue-scheduled":
        dw = connect_dw()
        enqueue(dw, "scheduled", "cli", datetime.now())
        dw.close()
    else:
        log("uso: python jobs.py worker|scheduler|enqueue-manual <email>|enqueue-scheduled")


if __name__ == "__main__":
    sys.exit(main())
