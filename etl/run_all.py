"""Pipeline completo do ETL (idempotente).

Ordem: dimensoes -> fato docs -> origem-criacao -> versao do app
       -> receita-medicamento -> especialidade -> unidade
       -> medico-dia -> medico-tipo -> medico-pacientes -> unidade-pacientes
       -> medicos (snapshot/novos) -> AN3 maior dia
       -> documentos emitidos -> anomalias (AN1).

Uso: python run_all.py   (requer variaveis de ambiente; ver README.md)
"""
import sys
import time

from common import log


def main():
    log("ETL PE Dashboard: carga completa (idempotente)")
    t0 = time.time()
    steps = [
        ("dimensoes", "load_dims"),
        ("fato docs", "load_fatos docs"),
        ("fato origem-criacao", "load_fatos origem"),
        ("fato versao do app", "load_fatos versao"),
        ("fato receita-medicamento", "load_fatos receitas"),
        ("fato especialidade", "load_fatos especialidade"),
        ("fato unidade", "load_fatos unidade"),
        ("fato medico-dia", "load_fatos medico"),
        ("fato medico-tipo", "load_fatos medico_tipo"),
        ("fato medico-pacientes", "load_fatos medico_pacientes"),
        ("fato unidade-pacientes", "load_fatos unidade_pacientes"),
        ("fato medico-unidade (vinculos)", "load_fatos medico_unidade"),
        ("snapshots AN1/AN2/AN4", "load_snapshots"),
        ("medicos (snapshot/novos)", "load_medicos"),
        ("AN3 maior dia (emissoes por dia)", "load_maior_dia"),
        ("documentos emitidos (drill AN3)", "load_documentos"),
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
