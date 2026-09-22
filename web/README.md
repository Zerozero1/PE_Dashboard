# PE Dashboard — Aplicação Web

Frontend/API do PE Dashboard: monolito Next.js 16 (App Router, TypeScript) que consome o datamart `prescricao_dw`.

## Executar em desenvolvimento

```bash
npm install
# preencher .env.local (ver abaixo)
npm run dev
```

Abrir http://localhost:3000.

## Variáveis de ambiente (`.env.local` — nunca versionar)

| Variável | Descrição |
|---|---|
| `DW_DATABASE_URL` | Conexão com o datamart: `postgres://usr_prescricao_dw:SENHA@172.16.7.112:5432/prescricao_dw` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciais OAuth do Google (console.cloud.google.com; redirect URI `http://localhost:3000/api/auth/callback/google`) |
| `NEXTAUTH_SECRET` | Segredo de sessão (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL pública da aplicação |

Sem as credenciais do Google, o modo `development` usa sessão mock (`mrichard@portalmedico.org.br`) para permitir visualizar o shell.

## Autenticação

- next-auth v4 + provider Google (escopos `openid email profile`)
- Validação de domínio no callback `signIn`: somente `@portalmedico.org.br`
- Perfil único: todos os usuários do domínio veem as quatro visões

## Endpoints

| Rota | Descrição |
|---|---|
| `GET /api/health` | Status da carga (último job), config (horário) e última data dos dados |
| `GET /api/filtros` | UFs e tipos de documento para os filtros |
| `GET /api/dashboard/documentos` | KPIs, série mensal, por tipo, por UF, ranking de especialidades (`de`, `ate`, `uf`, `tipo`, `assinado`) |
| `GET /api/dashboard/medicos` | KPIs snapshot, novos por mês, por UF, inatividade por faixa (`de`, `ate`, `uf`) |
| `GET /api/dashboard/dispensacoes` | KPIs, série mensal, por UF (`de`, `ate`, `uf`) |
| `GET /api/dashboard/auditoria` | Eventos por dia, tipos, dimensões, detalhe (`de`, `ate`, `tipo`) |
| `POST /api/admin/refresh-jobs` | Enfileira job manual no `dashboard_refresh_job` (botão "Atualizar dados") |

## Estrutura

```
src/
  app/
    api/...          # route handlers (dados e autenticação)
    globals.css      # tema cyberpunk dark
    layout.tsx       # shell raiz
    page.tsx         # sessão + dashboard
  components/
    dashboard.tsx    # abas, filtros e visões (SVG/CSS, sem lib de gráficos)
  lib/
    auth.ts          # next-auth (Google + domínio)
    db.ts            # pool pg do datamart
public/
  brazil.geojson     # mapa do Brasil por UF (simplificado)
  cfm.png            # logo
```

## Deploy (servidor interno Windows)

1. `npm run build` → `npm start` (ou serviço Windows/PM2)
2. Configurar `.env.local` com credenciais reais do Google e `NEXTAUTH_URL` do host interno
3. Remover o mock de dev (aplicação já cai no redirect do next-auth quando `GOOGLE_CLIENT_ID` existe)
