# App Portaria360

MVP SaaS completo para controle de acesso em condominios residenciais e comerciais, com arquitetura API-first, operacao em tempo real, multi-condominio, trilha de auditoria, billing SaaS e app mobile/PWA para moradores.

## O que esta pronto

- Gestao de usuarios com perfis `administrator`, `syndic`, `doorman` e `resident`
- Cadastro de visitantes e prestadores via diretoria de contatos
- Associacao de moradores a unidades
- Agendamento, autorizacao recorrente e historico de visitas por unidade
- Registro de entradas e saidas em tempo real
- Liberacao remota de gates pela web ou app do morador
- Dashboard operacional com alertas, dispositivos, CFTV e movimentacao recente
- Webhooks, billing por plano, exportacao CSV/PDF e logs de notificacao
- PWA mobile com fila offline e sincronizacao posterior
- Criptografia de dados sensiveis, hash de senha, sessao assinada e 2FA TOTP opcional

## Arquitetura

- Backend: Node.js puro com API REST, SSE para realtime e persistencia em JSON
- Frontend web: HTML/CSS/JS sem build, com painel responsivo para administracao e portaria
- Frontend mobile: PWA em HTML/CSS/JS para moradores
- Persistencia: `data/database.json`
- Dominio multi-tenant: um usuario pode acessar multiplos condominios pela mesma conta

## Estrutura

- `src/server.mjs`: bootstrap HTTP
- `src/app.mjs`: API, regras de negocio e entrega de arquivos estaticos
- `src/seed.mjs`: base de demonstracao multi-condominio
- `src/services/`: persistencia, realtime e relatorios
- `src/utils/`: seguranca e utilitarios HTTP
- `public/`: painel web, app mobile/PWA, CSS e assets
- `tests/api.test.mjs`: testes automatizados da API
- `docs/api.md`: guia rapido dos endpoints

## Credenciais demo

- Administrador: `admin@portaria360.local` / `Admin@123`
- Sindico: `sindico@solaris.local` / `Sindico@123`
- Porteiro: `porteiro@solaris.local` / `Porteiro@123`
- Moradora: `mariana@solaris.local` / `Morador@123`

## Como executar

Se `node` estiver no PATH:

```powershell
node --run start
```

Se nao estiver, use o launcher deste workspace:

```powershell
.\run.ps1 start
```

Depois abra:

- Painel web: `http://localhost:3000/`
- App do morador: `http://localhost:3000/app`
- OpenAPI resumido: `http://localhost:3000/api/docs/openapi`

## Testes

```powershell
.\run.ps1 test
```


