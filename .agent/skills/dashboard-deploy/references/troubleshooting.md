# Troubleshooting — deploy do dashboard (SCF179)

## 1. `.env` ausente na pasta do repo (crítico)

O `docker-compose.yml` substitui `${DW_DATABASE_URL}`, `${BDCFM_*}`, `${NEXTAUTH_*}` etc.
A pasta `/opt/cfm/docker/code/prescricao-dashboard` **não tem `.env`** (só `.env.example`);
sem ele o `up --build` sobe o stack sem credenciais. Reconstrua a partir dos containers
em execução (valores não são impressos):

```bash
cd /opt/cfm/docker/code/prescricao-dashboard
docker inspect prescricao-dashboard-web-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(DW_DATABASE_URL|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|NEXTAUTH_SECRET|NEXTAUTH_URL)=' > /tmp/web.env
docker inspect prescricao-dashboard-etl-worker-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(BDCFM_HOST|BDCFM_PORT|BDCFM_DB|BDCFM_USER|BDCFM_PASSWORD|DW_HOST|DW_PORT|DW_DB|DW_USER|DW_PASSWORD|ETL_BATCH_SIZE)=' > /tmp/etl.env
cat /tmp/web.env /tmp/etl.env > .env
chmod 600 .env
cut -d= -f1 .env    # confira as CHAVES (16), nunca os valores
```

Validar antes do build: `docker compose config --quiet; echo exit=$?` (deve dar `exit=0`).

## 2. HEAD detached

O repo já apareceu em `HEAD detached at origin/main`. Antes de qualquer pull:

```bash
git checkout main && git fetch origin && git pull --ff-only
```

## 3. 502 no domínio após o deploy

O nginx resolve o nome/IP do container no start e pode ficar com o IP antigo:

```bash
docker restart nginx-nginx-1
```

## 4. fail2ban / autenticação

O sshd derruba a conexão após poucas falhas de senha. Se `ssh_exec.py` falhar 2×,
**pare** e peça ao usuário para rodar os comandos na sessão SSH dele (ou obter
credencial/chave correta). Não fique tentando.

## 5. Root e sudo

O repo é `root:root` (750) → `git` exige root. O `docker` funciona para `mrichard`
(grupo docker). Se `sudo -n true` falhar (senha obrigatória), use
`echo "$SCF179_PASSWORD" | sudo -S -p '' bash -lc '<comando>'` ou peça ao usuário.

## 6. Validações no DW (MCP `postgres-dw`)

```sql
-- não truncou (esperado: 2021-10-07)
SELECT min(dia), max(dia) FROM prescricao.fato_documento_medico_paciente_dia;
-- volumes de referência (aprox.)
SELECT count(*) FROM prescricao.fato_receita_medicamento_mes;      -- ~10,2M linhas
SELECT sum(documentos) FROM prescricao.fato_documento_versao_dia;  -- ~62,8M
SELECT count(*) FROM prescricao.snap_especialidade;                -- ~214k
-- tabelas removidas em 2026-10-02 (não devem existir)
SELECT to_regclass('prescricao.fato_documento_unidade_dia'),
       to_regclass('prescricao.fato_auditoria_dia'),
       to_regclass('prescricao.fato_documento_paciente_dia');
```

## 7. Rollback

```bash
cd /opt/cfm/docker/code/prescricao-dashboard
git log --oneline -3
git checkout <commit-anterior>
docker compose up -d --build
```
Mudanças de DW são aditivas; o `setup.py` é idempotente e não precisa de rollback.

## 8. Job agendado (02:00) e validação antecipada

- O scheduler roda o pipeline diário às 02:00 (America/Sao_Paulo).
- Para validar o pipeline novo antes: `docker compose exec -T etl-worker python jobs.py enqueue-scheduled`
  (pipeline completo, ~45–60 min; acompanhe em `/api/health` ou no dashboard).
- Não rode cargas manuais em paralelo com o job agendado.

## 9. Contexto do host

- `docker compose ls` na SCF179 lista vários stacks; o nosso é `prescricao-dashboard`.
- Containers: `prescricao-dashboard-web-1`, `-etl-worker-1`, `-etl-scheduler-1`.
- Proxy: stack `nginx` (`/opt/cfm/docker/code/nginx`), rede externa `cfm-network`.
