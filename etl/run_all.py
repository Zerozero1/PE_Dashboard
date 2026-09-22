import sys
import time

from common import log


def main():
    log("ETL PE Dashboard: carga completa (idempotente)")
    t0 = time.time()
    steps = [
        ("dimensoes", "load_dims"),
        ("fato docs", "load_fatos docs"),
        ("fato especialidade", "load_fatos especialidade"),
        ("fato unidade", "load_fatos unidade"),
        ("fato medico-dia", "load_fatos medico"),
        ("fato pacientes", "load_fatos pacientes"),
        ("medicos (snapshot/novos)", "load_medicos"),
        ("dispensacoes", "load_dispensacoes"),
        ("anomalias", "load_anomalias"),
    ]
    for nome, cmd in steps:
        log(f"=== {nome} ===")
        code = run_module(cmd)
        if code != 0:
            log(f"falhou: {cmd} (exit {code})")
            sys.exit(code)
    log(f"ETL concluido em {time.time()-t0:.0f}s")


def run_module(cmd):
    parts = cmd.split()
    if len(parts) == 1:
        return subprocess_run([sys.executable, parts[0] + ".py"])
    return subprocess_run([sys.executable, parts[0] + ".py"] + parts[1:])


def subprocess_run(argv):
    import subprocess
    return subprocess.call(argv, cwd=".")


if __name__ == "__main__":
    sys.exit(main())
