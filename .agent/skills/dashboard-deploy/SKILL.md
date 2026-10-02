---
name: dashboard-deploy
description: Faz o deploy do PE Dashboard (stack prescricao-dashboard) no servidor SCF179 (192.168.1.179) e publica em https://dashboard.prescricao.cfm.org.br/ — git pull no repo /opt/cfm/docker/code/prescricao-dashboard, docker compose up -d --build (web/etl-worker/etl-scheduler), setup.py no DW e validações (health, status_dw, versão no rodapé, dados via MCP postgres-dw), com rollback. Use SEMPRE que o usuário pedir para publicar, atualizar, subir ou deployar o dashboard da prescrição eletrônica CFM, uma versão (vX.Y) do PE Dashboard, ou mencionar dashboard.prescricao.cfm.org.br, SCF179 ou 192.168.1.179.
---

# Deploy do PE Dashboard (produção CFM)

## Visão geral

- **Servidor**: `SCFM179` / `192.168.1.179` (Debian), usuário SSH `mrichard`.
- **Repositório**: `/opt/cfm/docker/code/prescricao-dashboard` (dono `root:root` — exige root/sudo).
- **Stack Docker**: `prescricao-dashboard` (`docker-compose.yml` no repo) com 3 containers:
  `prescricao-dashboard-web-1` (porta 3000), `-etl-worker-1`, `-etl-scheduler-1`.
- **Domínio**: https://dashboard.prescricao.cfm.org.br/ (proxy = stack `nginx`, container `nginx-nginx-1`, rede `cfm-network`).
- **Banco**: `prescricao_dw` (172.16.7.112) — o ETL também lê a origem `bd_cfm`.
- **Checklist canônico**: seção 9 do `DEPLOY_PRODUCAO.md` (mantenha os dois em sincronia ao mudar o processo).

## Credenciais (nunca versionar)

- Usuário SSH: `mrichard`. Senha: no arquivo **`~/.config/opencode/secrets/scf179.env`** (`SCF179_USER`/`SCF179_PASSWORD`), fora do repositório.
- Se o arquivo não existir, **peça a senha ao usuário** e/ou crie-o; jamais grave a senha no repo, no SESSION_STATE ou em commits.
- **Se a autenticação falhar duas vezes, pare** — o servidor derruba a conexão após falhas (fail2ban). Nesse caso, entregue os comandos ao usuário para ele rodar na sessão SSH dele.

## Pré-condições

1. O commit do release está **commitado e pushado** (origin + cfm). Confira: `git log --oneline -1` no laptop.
2. De preferência **longe das 02:00** (job agendado do ETL) — e o deploy do ETL deve terminar antes dele.
3. Avisar que o site fica fora ~1–2 min durante o `up -d --build` (o ETL é reiniciado; o web recriado).

## Fluxo de deploy

Os comandos rodam na SCF179 via `scripts/ssh_exec.py` (paramiko; lê a senha do arquivo acima). O comando vai em **base64** no argumento para evitar problemas de aspas:

```powershell
$c = 'hostname; whoami'
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($c))
python .agent/skills/dashboard-deploy/scripts/ssh_exec.py $b64
```

Como o repo é do root, os comandos precisam de root. Teste `sudo -n true` primeiro; se exigir senha, use `echo "$SCF179_PASSWORD" | sudo -S -p '' bash -lc '<comando>'` (a senha vem do arquivo de segredo; não a imprima) ou peça ao usuário para rodar.

**Passo a passo** (ou use `scripts/deploy_remote.sh`, que faz 1–5):

1. **Git** (o repo costuma estar em HEAD detached):
   ```bash
   cd /opt/cfm/docker/code/prescricao-dashboard
   git status --short          # se houver alteração local, PARE e mostre ao usuário
   git checkout main
   git fetch origin
   git pull --ff-only
   git log --oneline -1        # confirme o commit do release
   ```
2. **Guarda do `.env`** (crítico): o diretório **não tem `.env` versionado**; se `.env` estiver ausente/vazio, reconstrua dos containers em execução **antes** do build (receita em `references/troubleshooting.md`). Sem isso o stack sobe sem credenciais.
3. **Build + subir**:
   ```bash
   docker compose up -d --build
   docker compose ps           # 3 containers Up
   ```
4. **Banco (DDL + seeds + DROPs de limpeza)**:
   ```bash
   docker compose exec -T etl-worker python setup.py
   ```
5. **Validações na máquina**:
   ```bash
   docker compose exec -T etl-worker python status_dw.py
   curl -s http://localhost:3000/api/health; echo
   curl -sI https://dashboard.prescricao.cfm.org.br/ | head -3
   ```
6. **Validação visual** (peça ao usuário, Ctrl+F5): rodapé `PE Dashboard · CFM vX.Y`, cards novos, dados coerentes.
7. **Validação no DW via MCP `postgres-dw`** (ver `references/troubleshooting.md` para as consultas): janela da `fato_documento_medico_paciente_dia` (não truncou), `fato_receita_medicamento_mes`, `fato_documento_versao_dia`, `snap_especialidade` e ausência das tabelas removidas.

## Rollback

```bash
cd /opt/cfm/docker/code/prescricao-dashboard
git log --oneline -3            # identifique o commit anterior
git checkout <commit-anterior>
docker compose up -d --build
```
O DW não precisa de rollback na maioria dos casos (mudanças são aditivas; `setup.py` é idempotente).

## Armadilhas conhecidas (detalhes em `references/troubleshooting.md`)

- **`.env` ausente** na pasta → reconstruir dos containers (nunca subir sem).
- **HEAD detached** → `git checkout main` antes do pull.
- **502 no domínio** após o deploy → nginx com IP antigo: `docker restart nginx-nginx-1`.
- **fail2ban**: pare após 2 falhas de autenticação; não insista.
- **02:00**: job agendado; para validar o pipeline antes: `docker compose exec -T etl-worker python jobs.py enqueue-scheduled` (~45–60 min).
- **`setup.py`** aplica `schema.sql` + `ddl_extra.sql` + seeds (`seed_de_para_medicamento.sql`, `seed_categoria_medicamento.sql`) e executa os `DROP` de limpeza.

## Referências

- `references/troubleshooting.md` — receita do `.env`, validações SQL, rollback detalhado.
- `scripts/ssh_exec.py` — executa um comando na SCF179 (sem segredos no arquivo).
- `scripts/deploy_remote.sh` — sequência 1–5 para rodar na máquina (como root).
- `DEPLOY_PRODUCAO.md` seção 9 — checklist oficial de atualização.
