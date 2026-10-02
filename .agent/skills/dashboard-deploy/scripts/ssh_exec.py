# -*- coding: utf-8 -*-
"""Executa um comando na SCF179 via SSH (paramiko).

Sem segredos neste arquivo. Credenciais (nesta ordem):
  1. variaveis de ambiente SCF179_USER / SCF179_PASSWORD
  2. arquivo em SCF179_SECRET_FILE (padrao: ~/.config/opencode/secrets/scf179.env,
     formato KEY=VALUE com SCF179_USER e SCF179_PASSWORD)

Uso:
  python ssh_exec.py <comando_base64> [host]

O comando vai em base64 para evitar problemas de aspas/escape no Windows.
Se o paramiko nao estiver instalado, instala em %TEMP%/opencode/libs.
"""
import base64
import os
import pathlib
import subprocess
import sys

DEFAULT_HOST = "192.168.1.179"
DEFAULT_USER = "mrichard"
DEFAULT_SECRET = pathlib.Path.home() / ".config" / "opencode" / "secrets" / "scf179.env"


def ensure_paramiko():
    libs = pathlib.Path(os.environ.get("TEMP", "/tmp")) / "opencode" / "libs"
    if libs.exists():
        sys.path.insert(0, str(libs))
    try:
        import paramiko
        return paramiko
    except ImportError:
        libs.mkdir(parents=True, exist_ok=True)
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet",
                               "--target", str(libs), "paramiko"])
        sys.path.insert(0, str(libs))
        import paramiko
        return paramiko


def load_credentials():
    user = os.environ.get("SCF179_USER", DEFAULT_USER)
    pw = os.environ.get("SCF179_PASSWORD")
    path = pathlib.Path(os.environ.get("SCF179_SECRET_FILE", str(DEFAULT_SECRET)))
    if pw is None and path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = (part.strip() for part in line.split("=", 1))
            if key == "SCF179_USER":
                user = value
            elif key == "SCF179_PASSWORD":
                pw = value
    if not pw:
        sys.exit(f"Credencial nao encontrada. Defina SCF179_PASSWORD ou crie {path}")
    return user, pw


def main():
    host = os.environ.get("SCF179_HOST", DEFAULT_HOST)
    timeout = int(os.environ.get("SCF179_TIMEOUT", "600"))
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    if len(sys.argv) > 1:
        cmd = base64.b64decode(sys.argv[1]).decode("utf-8")
    else:
        cmd = "hostname; whoami"
    if len(sys.argv) > 2:
        host = sys.argv[2]
    user, pw = load_credentials()
    paramiko = ensure_paramiko()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, username=user, password=pw, timeout=20,
                       banner_timeout=20, auth_timeout=20)
    except paramiko.AuthenticationException:
        sys.exit("FALHA DE AUTENTICACAO: pare e peca as credenciais ao usuario "
                 "(o servidor pode bloquear o IP apos falhas — fail2ban).")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    sys.stdout.write(stdout.read().decode("utf-8", "replace"))
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        sys.stderr.write(err)
    code = stdout.channel.recv_exit_status()
    client.close()
    sys.exit(code)


if __name__ == "__main__":
    main()
