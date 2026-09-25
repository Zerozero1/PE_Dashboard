# PE Dashboard — Colocação em Produção

> Documento técnico para o arquiteto responsável pela implantação do PE Dashboard
> (Prescrição Eletrônica CFM) na rede interna.
> _Versão: 2026-09-23 · Repositório: https://github.com/Zerozero1/PE_Dashboard_

## 1. Visão geral do produto

Painel analítico web restrito ao domínio `@portalmedico.org.br` (autenticação Google
OAuth) sobre a base operacional `bd_cfm`. Os dados são transformados por um ETL Python
em um datamart próprio (`prescricao_dw`) que alimenta três visões:

- **Documentos médicos** — emissões por período/UF/tipo/especialidade, origem de criação
- **Médicos** — inscrições cadastradas (CRM/UF), médicos cadastrados (CPF), novos por
  aceite do termo, inatividade por faixa de dias sem emissão
- **Auditoria** — anomalias agregadas (AN1–AN4), sem registros individuais

Restrições de negócio já definidas: sem exportação CSV/Excel, sem auditoria do uso do
dashboard, sem nomes de médicos/pacientes (somente agregados e identificadores técnicos).

## 2. Componentes e topologia

| Componente | Tecnologia | Localização recomendada |
|---|---|---|
| **Aplicação web** (`web/`) | Next.js 16 (App Router, TypeScript), Node.js 20+, next-auth v4, `pg` | Servidor Windows interno (Node como serviço) |
| **ETL** (`etl/`) | Python 3.12+, `psycopg2` (sem pandas) | **Máquina Windows separada** da web |
| **Origem** | PostgreSQL 13.8 `bd_cfm` (172.16.2.177:5432), leitura `usr_select` | Existente — somente leitura |
| **Datamart** | PostgreSQL 13.7 `prescricao_dw` (172.16.7.112:5432), escrita `usr_prescricao_dw` | Existente — schema `prescricao` |

Comunicação entre web e ETL: **exclusivamente via datamart** (fila
`dashboard_refresh_job` + status + fatos). Não há chamadas HTTP entre as máquinas.

```
bd_cfm (origem)  ──leitura──►  [Máquina ETL: Python]  ──escrita──►  prescricao_dw
                                                                    ▲
[Servidor web: Next.js] ──leitura (pg) ──────────────────────────────┘
        ▲
        └─ usuários @portalmedico.org.br (Google OAuth)
```

## 3. Pré-requisitos de rede e segurança

| Origem → Destino | Porta | Uso | Necessário |
|---|---|---|---|
| Usuários → servidor web | 80/443 (ou 3000) | HTTP/HTTPS | Sim |
| Servidor web → `172.16.7.112` | 5432 | Leitura do datamart | Sim |
| Máquina ETL → `172.16.2.177` | 5432 | Leitura da origem | Sim |
| Máquina ETL → `172.16.7.112` | 5432 | Escrita no datamart | Sim |
| Servidor web → máquina ETL | — | **Não necessário** (fila no DW) | Não |
| Internet (egress) do servidor web | 443 | Google OAuth (token validation) | Sim |

Pontos de atenção:

- **Credenciais nunca versionadas**: conexões via variáveis de ambiente (`.env.local`
  na web; env vars na sessão do Task Scheduler no ETL).
- **`usr_select` é somente leitura** na origem; nenhuma gravação em `bd_cfm`.
- **`usr_prescricao_dw` não cria schemas**; os objetos vivem no schema `prescricao`.
- O datamart armazena **apenas agregados e identificadores técnicos**; CPF é usado
  somente para contagens DISTINCT no ETL e não é persistido.
- `tb_medico.ds_foto` (bytea, ~15 GB) nunca é lida pelo ETL.

## 4. Implantação da aplicação web

### 4.1 Pré-requisitos no servidor
- Windows Server com Node.js 20+ (mesma versão validada no ambiente de desenvolvimento)
- Acesso à pasta de aplicação (ex.: `C:\apps\pe-dashboard-web`)

> **Docker (recomendado):** todo o deploy (web + ETL) pode ser feito com o
> `docker-compose.yml` na raiz do repositório — ver seção 4.0 abaixo.

### 4.0 Deploy via Docker (web + ETL juntos)

```powershell
# 1. copiar o .env.example para .env e preencher (nunca versionar)
Copy-Item .env.example .env
notepad .env

# 2. subir tudo (web, etl-worker, etl-scheduler)
docker compose up -d --build
```

Comunicação entre Web e ETL: **não há chamada HTTP**. O botão "Atualizar dados"
insere um job `manual` em `prescricao.dashboard_refresh_job`; o container
`etl-worker` consome a fila (`FOR UPDATE SKIP LOCKED`) e roda o pipeline;
`etl-scheduler` cria os jobs `scheduled` diários (02:00 BRT). Ambos só precisam
enxergar o mesmo `prescricao_dw`; o ETL também lê `bd_cfm`.

```text
                    ┌─────────────────────────────┐
  usuário ──HTTP──► │ web (Next.js standalone)     │──leitura/escrita──┐
                    └─────────────────────────────┘                   │
                                                        prescricao_dw (fila de jobs)
                    ┌─────────────────────────────┐                   │
                    │ etl-worker (consome fila)     │──leitura/escrita─┤
                    │ etl-scheduler (cria jobs)     │                  │
                    └──────────┬──────────────────┘                   │
                               │ leitura (bd_cfm)                      │
                               ▼                                       ▼
                             bd_cfm (origem)                PostgreSQL 172.16.7.112
```

### 4.2 Obtenção do código
```powershell
git clone https://github.com/Zerozero1/PE_Dashboard.git C:\apps\pe-dashboard-web
cd C:\apps\pe-dashboard-web\web
```

### 4.3 Configuração (`.env.local` — criar no servidor, nunca versionar)
```ini
DW_DATABASE_URL=postgres://usr_prescricao_dw:SENHA@172.16.7.112:5432/prescricao_dw
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://dashboard.prescricao.cfm.org.br/
```

**Obrigatório no Google Cloud Console** (console.cloud.google.com, projeto `dashboard-prescricao`):
adicionar a redirect URI do servidor em **Google Auth Platform → Clients → Authorized redirect URIs**:

```
https://dashboard.prescricao.cfm.org.br/api/auth/callback/google
```

O app usa OAuth **Internal** (somente contas `@portalmedico.org.br`); nesse modo não é
necessário publicar a tela de consentimento. A validação de domínio também ocorre no
backend (`signIn` callback em `src/lib/auth.ts`), não apenas no Google.

### 4.3.1 Login em produção (HTTPS + reverse proxy)

Aplicação atrás de reverse proxy (Nginx/Traefik/IIS) com HTTPS terminado no proxy:

- `NEXTAUTH_URL` deve ser a URL pública com HTTPS (ex.: `https://dashboard.prescricao.cfm.org.br/`).
- O proxy deve repassar `X-Forwarded-Proto: https` para o Next.js (cookies `Secure` são
  gerados a partir disso).
- `NEXTAUTH_SECRET` deve ser um segredo forte, diferente do usado em desenvolvimento.

Sem o mock de dev: em produção (`NODE_ENV=production`) o mock nunca é usado; sem sessão
válida o usuário é redirecionado para `/login`.

### 4.4 Build e execução
```powershell
cd C:\apps\pe-dashboard-web\web
npm install
npm run build
npm start          # porta 3000
```

### 4.5 Serviço Windows (sem sessão interativa)
Opção A — **PM2**:
```powershell
npm i -g pm2
pm2 start npm --name pe-dashboard -- start
pm2 save
npm i -g pm2-windows-startup; pm2-startup install
```

Opção B — **NSSM** (serviço nativo):
```powershell
nssm install PE-Dashboard node "C:\apps\pe-dashboard-web\web\node_modules\next\dist\bin\next" start
nssm set PE-Dashboard AppDirectory "C:\apps\pe-dashboard-web\web"
nssm set PE-Dashboard AppEnvironmentExtra "NEXTAUTH_URL=http://<host-interno>:3000"
nssm start PE-Dashboard
```

### 4.6 Smoke test
- `GET http://<host-interno>:3000/api/health` → retorna status do último job do ETL,
  horário configurado e última data dos dados.
- Login com conta `@portalmedico.org.br`; contas de outros domínios são rejeitadas no
  callback (validação server-side em `src/lib/auth.ts`).
- Botão "Atualizar dados" só aparece para `mrichard@portalmedico.org.br`.

## 5. Implantação do ETL (máquina separada)

### 5.1 Pré-requisitos
- Windows com Python 3.12+ e `pip install psycopg2`
- Pasta `C:\apps\pe-dashboard-etl` (clone do repo ou cópia da pasta `etl\`)

### 5.2 Variáveis de ambiente (na sessão do serviço/Task Scheduler)
```ini
BDCFM_HOST=172.16.2.177
BDCFM_PORT=5432
BDCFM_DB=bd_cfm
BDCFM_USER=usr_select
BDCFM_PASSWORD=<senha>
DW_HOST=172.16.7.112
DW_PORT=5432
DW_DB=prescricao_dw
DW_USER=usr_prescricao_dw
DW_PASSWORD=<senha>
ETL_BATCH_SIZE=2000000
```

### 5.3 Carga inicial
```powershell
cd C:\apps\pe-dashboard-etl\etl
python setup.py          # cria estrutura (idempotente)
python run_all.py        # carga completa (~30–40 min)
```

### 5.4 Agendamento (Task Scheduler)
Dois agendamentos permanentes na máquina do ETL:

| Tarefa | Comando | Frequência |
|---|---|---|
| Scheduler | `python jobs.py scheduler` | a cada 5–10 min (cria o job diário às 02:00 BRT conforme `dashboard_refresh_config`) |
| Worker | `python jobs.py worker` | contínua/loop (consome jobs `queued` com `FOR UPDATE SKIP LOCKED`; recupera jobs `running` órfãos no start) |

Características da fila: um único job `running` por vez; falha não apaga a última versão
válida (cargas idempotentes via upsert); o job diário roda o `run_all` completo
(incremental por watermark ainda não implementado).

## 6. Backup, manutenção e monitoramento

- **Backup do datamart**: definir `pg_dump` diário de `prescricao_dw` no servidor de
  banco (pendência operacional a incluir no plano de backup corporativo).
- **Monitoramento básico**: `/api/health` (polling 30s na própria UI) + status do último
  job em `dashboard_refresh_job` (success/failed, `mensagem`).
- **Origem em produção ativa**: contagens podem variar entre varreduras; a carga diária
  converge — não comparar DW com origem em horários de carga.
- **Índices na origem** (`tb_consulta_documento.dh_documento`, `tb_consulta.dt_consulta`)
  seguem como pedido aberto ao DBA; sem eles o ETL usa varredura em lotes por faixa de id.

## 7. Rollback

- Aplicação web: reverter o checkout (`git checkout <tag>`) e reiniciar o serviço; o
  datamart não é afetado.
- ETL: cargas são idempotentes; reexecutar `run_all.py` reconstrói fatos com `SUM` sem
  duplicação. Falhas de job não corrompem a última versão válida.
- Migrações de estrutura do DW usam scripts pontuais `migrate_*.py` versionados.

## 8. Checklist de go-live

- [ ] Node.js 20+ instalado no servidor web
- [ ] `.env.local` criado (sem credenciais no repositório)
- [ ] Redirect URI do novo host adicionado no Google Cloud Console
- [ ] Firewall liberado (5432 web→DW; 5432 ETL→origem e ETL→DW)
- [ ] Serviço Windows da web iniciado e `/api/health` OK
- [ ] Login Google testado com domínio `@portalmedico.org.br`
- [ ] ETL: env vars configuradas, `run_all.py` validado, scheduler/worker agendados
- [ ] Backup do `prescricao_dw` definido
- [ ] Rollback testado (reverter versão web sem afetar o DW)
