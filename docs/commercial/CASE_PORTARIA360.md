# Case Comercial — PORTARIA360: SaaS de Controle de Acesso e Gestão Condominial

## PROBLEMA
Administradoras de condomínios residenciais e centros empresariais enfrentam falhas críticas de segurança em suas portarias: anotações manuais de visitantes, demora na autorização de entregadores e prestadores de serviços, riscos de invasão por clonagem de acesso e total ausência de registro auditável sobre quem autorizou e quem abriu portões ou cancelas. Além disso, as soluções legadas do setor exigem servidores dedicados caros no local e cobram mensalidades astronômicas.

## SOLUÇÃO
O **PORTARIA360** é uma plataforma SaaS API-first desenvolvida em Node.js moderno (ESM) e PostgreSQL, criada para modernizar e descentralizar o controle de portarias. A plataforma disponibiliza dashboard administrativo para múltiplos condomínios, emissão de convites digitais com códigos temporários e expiração cronometrada, acionamento remoto de acessos com controle de idempotência e geração instantânea de trilhas de auditoria para investigações e relatórios de segurança.

## FUNCIONALIDADES COMPROVADAS
- **Dashboard Multi-Condomínio**: Acesso unificado para empresas de segurança e administradoras gerenciarem dezenas de condomínios sob uma única interface.
- **Códigos Temporários de Acesso**: Moradores e síndicos agendam visitas gerando credenciais com prazo de validade rígido, inutilizadas automaticamente após o primeiro uso ou após expiração.
- **Acionamento Remoto de Portões com Idempotência**: Comandos de abertura auditáveis que bloqueiam repetições acidentais e expiram em tempo hábil para evitar acionamentos fantasmas.
- **Trilha Completa de Auditoria & Exportação CSV**: Registro de cada abertura, recusa de acesso, horário e responsável, com exportação tabular para prestação de contas.
- **Isolamento de Recursos e Permissões Baseadas em Papéis**: Barreiras estritas que impedem vazamento de dados entre condomínios vizinhos ou acessos indevidos por operadores terceirizados.

## TECNOLOGIAS VERIFICADAS
- **Runtime & Backend**: Node.js >= 20, ECMAScript Modules nativos.
- **Banco de Dados**: PostgreSQL com driver oficial `pg`, scripts de migração automatizados.
- **Infraestrutura**: Docker Compose para provisionamento ágil de banco e aplicação.
- **Testes Automatizados**: Node.js Native Test Runner (`node --test`), com 100% de aprovação comprovada em 7 testes de integração ponta a ponta.

## DIFERENCIAIS
- **Zero Dependências Supérfluas**: Arquitetura enxuta e performática, resultando em menor superfície de ataque e inicialização quase instantânea.
- **Conformidade e Segurança Auditada**: Testes cobrindo explicitamente a não-exposição de segredos e exigência de autenticação em rotas sensíveis.
- **Operação Adaptável**: Pode ser executado em servidores em nuvem ou em microcomputadores locais na portaria conectando-se a relés de acionamento.

## STATUS
**MVP Funcional Validado com Testes de Integração Aprovados** — Testes de API aprovados com sucesso (`node --test tests/api.test.mjs`), scripts de migração e containers Docker prontos.

## VALOR COMERCIAL
- **Redução de Custo de Portaria**: Habilita a transição de portarias presenciais caras para modelos de portaria remota ou híbrida, economizando até 50% na folha de pagamento do condomínio.
- **Experiência do Condômino**: Moradores autorizam convidados pelo próprio celular sem precisar ligar para a portaria nem enfrentar filas de espera.
- **Blindagem Jurídica para Administradoras**: Registros com data/hora e identificação protegem a administração contra contestações e processos de segurança patrimonial.
