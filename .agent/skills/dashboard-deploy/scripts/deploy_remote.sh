#!/usr/bin/env bash
# Deploy do PE Dashboard na SCF179 — rodar COMO ROOT (o repo e root-owned).
# Uso: sudo bash deploy_remote.sh   (ou dentro de `sudo -i`)
# Antes de rodar: garanta que o commit do release esta pushado.
set -euo pipefail

REPO=/opt/cfm/docker/code/prescricao-dashboard
cd "$REPO"

echo "== 1) git =="
git status --short
if [ -n "$(git status --porcelain)" ]; then
  echo "ERRO: ha alteracoes locais no repo — nao forcar; avaliar com o usuario."
  exit 1
fi
git checkout main
git fetch origin
git pull --ff-only
git log --oneline -1

echo "== 2) guarda do .env =="
if [ ! -s .env ]; then
  echo "ERRO: .env ausente/vazio. Reconstrua a partir dos containers em execucao"
  echo "antes do build (ver references/troubleshooting.md). Abortando."
  exit 1
fi

echo "== 3) build + subir =="
docker compose up -d --build
docker compose ps

echo "== 4) setup (DDL + seeds + DROPs de limpeza) =="
docker compose exec -T etl-worker python setup.py

echo "== 5) validacoes =="
docker compose exec -T etl-worker python status_dw.py
curl -s http://localhost:3000/api/health; echo
curl -sI https://dashboard.prescricao.cfm.org.br/ | head -3

echo "== deploy concluido: validar o rodape (versao) no navegador =="
