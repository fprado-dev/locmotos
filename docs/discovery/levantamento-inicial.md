# Levantamento inicial — Sistema de Gestão de Locadoras

> Material trazido pelo dono da locadora / levantado em entrevista.
> Registrado verbatim, antes de qualquer corte de escopo. Não é spec aprovada.

## 1. Landing Page e Autenticação

### 1.1 Landing Page

- Hero com proposta de valor: "Gerencie sua locadora, frota, contratos e finanças em um só lugar."
- Benefícios por perfil: dono da locadora, operador, financeiro.
- Funcionalidades principais: frota, locações, financeiro, documentos, rastreamento, simulador.
- Planos e preços.
- Depoimentos / prova social.
- FAQ.
- Formulário de contato / solicitar demonstração.
- Blog ou central de ajuda (opcional).
- SEO básico: título, descrição, Open Graph, sitemap.

### 1.2 Login / Cadastro

- Login com Google.
- Login com "One link" / link mágico por e-mail.
- Login com e-mail e senha (opcional).
- Recuperação de senha.
- Verificação de e-mail.
- 2FA opcional para admin da locadora.
- Cadastro de nova locadora: nome, CNPJ, CEP, e-mail, WhatsApp, logo, plano escolhido.
- Termos de uso e política de privacidade.
- Onboarding inicial: configurar dados da locadora, adicionar primeiro veículo, primeiro cliente.

### 1.3 Ambientes / Perfis

| Perfil              | Acesso                                                                  |
| ------------------- | ----------------------------------------------------------------------- |
| Super Admin         | Administra o SaaS, locadoras, planos, integrações globais e logs.       |
| Admin da Locadora   | Acesso total à sua locadora.                                            |
| Operador / Equipe   | Acesso limitado por permissão.                                          |
| Financeiro          | Acesso a finanças, entradas, saídas, relatórios e conciliação.          |
| Cliente / Locatário | Portal do usuário: contratos, pagamentos, documentos e solicitações.    |
| Condutor            | Pode ser diferente do locatário; visualiza contrato e dados da locação. |

## 2. Painel da Locadora — Dashboard

Dashboard com indicadores principais, filtros por período, unidade e categoria.

| Indicador              | Descrição                                                          |
| ---------------------- | ------------------------------------------------------------------ |
| Entrada                | Total recebido no período.                                         |
| Saída                  | Total pago no período.                                             |
| Quantidade de veículos | Total da frota, por status.                                        |
| Saldo                  | Entradas menos saídas.                                             |
| Ticket médio           | Média por locação ou por cliente.                                  |
| Crescimento (mês)      | Comparativo com mês anterior.                                      |
| Clientes ativos        | Clientes com locação ativa ou pagamento em dia.                    |
| Veículos parados       | Sem locação há X dias.                                             |
| Status das locações    | Ativas, encerradas, pendentes, inadimplentes.                      |
| Documentos vencendo    | CNH, licenciamento, seguro e fim de contrato nos próximos 60 dias. |

Sugestões adicionais: gráficos de receita/despesa/lucro; alertas de inadimplência; próximas devoluções; próximas manutenções; taxa de ocupação da frota; ranking de veículos mais lucrativos.

## 3. Locações

### 3.1 Lista de Locações

- Todas; Aprovação/Pendentes; Ativas; Encerradas.
- Baseado no pagamento: em dia, atrasado, pago, previsto.
- Filtros por cliente, veículo, período, status e condutor.
- Status sugeridos: Rascunho, Aguardando documentos, Em análise, Aprovada, Ativa, Encerrada, Cancelada, Inadimplente.

### 3.2 Nova Locação

**Veículo:** veículo; início/fim; valor; frequência semanal; caução; tempo mínimo (3, 6, 12, 24, 36 meses); KM na entrega; plano de manutenção (não possui / preventiva / corretiva); inclui seguro contra terceiros; particularidades desta locação (opcional); documentos (CNH, comprovante de residência, outros PDFs).

**Locatário:** cliente já criado ou criar novo; histórico de locações; score interno; status financeiro.

**Condutor:** nome; CPF; CNH; validade; categoria; WhatsApp.

**Revisão:** resumo do contrato; cálculo de valores; aprovação; assinatura digital; anexos; checklist de vistoria; fotos de entrega; KM, combustível e avarias.

Sugestões adicionais: gerar contrato em PDF; enviar contrato por WhatsApp/e-mail; cobrança recorrente semanal/mensal; renovação automática ou manual; multa por atraso; registro de devolução; histórico de ocorrências.

## 4. Frota

### 4.1 Tela de Veículos

- Status: Disponível, Reservado, Manutenção, Indisponível.
- Filtros: placa, marca, modelo, ano, categoria, status, locação atual, próxima manutenção.

### 4.2 Adicionar Novo Veículo

Campos originais: foto do veículo; placa; CRLV (PDF ou foto); CRV; marca; modelo; ano; cor; KM; chassi; Renavam; licenciamento; FIPE; valor semanal.

Sugestões adicionais: categoria (moto, carro, van, caminhão); combustível; câmbio; portas; capacidade; data de aquisição; valor de compra; fornecedor; seguro; IPVA; rastreador; observações; histórico de manutenção; multas; documentos anexos.

### 4.3 Manutenção

Preventiva; corretiva; ordem de serviço; fornecedor; custo; data; KM; próxima revisão; alertas automáticos.

## 5. Clientes e Condutores

### 5.1 Cliente — Lista ou Adicionar

Campos originais: Nome*; CPF; RG; data de nascimento; e-mail; WhatsApp; telefone reserva; profissão; estado civil; nº registro CNH; categoria CNH; validade CNH; CEP; cidade; estado (UF); bairro; rua; número.

Sugestões adicionais: validação de CPF e CNH; busca automática de CEP; status (ativo, inativo, blacklist, em análise); score de risco; origem do cliente; observações; anexos (CNH, comprovante de residência, comprovante de renda); histórico de locações; histórico de pagamentos; sinistros; blacklist; consentimento LGPD.

### 5.2 Condutor

Nome; CPF; CNH; validade; categoria; WhatsApp. Pode ser o próprio locatário ou um condutor adicional. Validação de CNH; histórico de infrações.

## 6. Finanças

### 6.1 Dashboard Financeiro

Recebidas (mensal); pago (mensal); lucro líquido; margem de lucro.

Sugestões adicionais: fluxo de caixa; contas a receber; contas a pagar; inadimplência; DRE simples; receita por veículo; receita por locação; despesas por centro de custo; conciliação bancária; integração com Asaas.

### 6.2 Cadastrar Entrada

Campos originais: Tipo*; centro de custo; Valor (R$)_; Data_; veículo (opcional); locação (opcional); banco (opcional); forma de pagamento (opcional); "já recebido" (senão fica como previsto / a receber); anexar comprovante.

Sugestões adicionais: cliente; categoria; recorrência; parcelas; observações; conciliação com Asaas; status (previsto, recebido, atrasado, cancelado).

### 6.3 Cadastrar Saída

Campos originais: Tipo*; centro de custo; Valor (R$)_; Data_; veículo (opcional); locação (opcional); banco (opcional); forma de pagamento (opcional); vincular a pagamento no Asaas (PIX/boleto); "já paguei" (senão fica como prevista / a pagar); anexar comprovante.

Sugestões adicionais: fornecedor; categoria; recorrência; parcelas; impostos; multas; manutenção; salários; comissões; status (previsto, pago, atrasado, cancelado).

### 6.4 Integração Asaas

Conectar conta; listar pagamentos PIX/boleto/cartão; conciliar entradas e saídas; webhooks para atualização automática; repasses e taxas; cobrança automática; link de pagamento; notificações de vencimento.

## 7. Simulador de Expansão de Frota

**Entradas:** capital disponível; financiamento (taxa de juros, prazo, entrada); valor do veículo; receita semanal/mensal; custos fixos e variáveis; manutenção; seguro; depreciação; inadimplência; taxa de ocupação.

**Saídas:** payback; ROI; TIR; lucro projetado; ponto de equilíbrio; cenários (otimista, realista, pessimista); comparativo (comprar, alugar, consórcio).

## 8. Trânsito e Risco

### 8.1 Rastreamento

Integração com rastreadores; localização em tempo real; histórico de rotas; cercas eletrônicas; alertas de velocidade/ignição/saída de área; bloqueio remoto (se suportado).

### 8.2 Blacklist

Lista interna; motivo; gravidade; CPF/CNH; data de inclusão; responsável; observações; LGPD (base legal e controle de acesso).

### 8.3 Sinistros e Seguro

Registro de sinistro; apólice; seguradora; vistoria; custos; status; documentos; histórico; acompanhamento.

### 8.4 Regras Automáticas

Clientes em risco por atraso; sugerir blacklist por atrasos; motos paradas; alertas de documentos vencendo; bloqueio de nova locação para inadimplentes; notificações automáticas; score de risco.

### 8.5 Multas e Infrações

Consulta de multas; notificação ao condutor; cobrança; recurso; registro de pagamento.

## 9. Gestão e Configurações

### 9.1 Equipe

Usuários; cargos; permissões; convites; logs de auditoria; histórico de ações.

### 9.2 Configuração

Logo; nome da locadora; CNPJ; CEP; endereço; dados bancários; chave API Asaas; chave API rastreador; modelos de contrato; termos; notificações; impostos; plano; integrações.

## 10. Portal do Usuário / Cliente

Login; meus contratos; pagamentos; boletos/PIX; documentos; solicitações; suporte; histórico; dados cadastrais; assinatura de contratos; notificações.

## 11. Admin do Sistema

Gestão de locadoras; planos e assinaturas; usuários globais; integrações globais; logs; métricas do SaaS; suporte; financeiro do SaaS.

## 12. Requisitos Não Funcionais

- Segurança: LGPD, criptografia, backups, controle de acesso.
- Multi-tenant: isolamento de dados por locadora.
- Performance: carregamento rápido, paginação, cache.
- Disponibilidade: alta disponibilidade, monitoramento.
- Responsividade: desktop, tablet e mobile.
- Integrações: Google, Asaas, WhatsApp, e-mail, assinatura eletrônica, rastreadores, FIPE, consulta CPF/CNH.
- Auditoria: logs de ações críticas.
- Escalabilidade: suportar crescimento de frota e usuários.

## 13. Roadmap MVP Sugerido (pelo levantamento, não validado)

**Fase 1 — MVP:** landing page; login/cadastro com Google e link mágico; dashboard da locadora; frota; clientes; locações; financeiro básico.

**Fase 2 — Operação:** Asaas; documentos e alertas; relatórios; simulador; portal do cliente; assinatura digital.

**Fase 3 — Risco e Escala:** rastreamento; blacklist; sinistros; regras automáticas; multas; app mobile; BI avançado.

## 14. Pontos a Definir (declarados em aberto)

- Nome do produto.
- "One link" é link mágico?
- Asaas será obrigatório?
- Qual serviço de assinatura eletrônica?
- Qual serviço de rastreamento?
- Haverá app mobile para cliente?
- Modelo de cobrança do SaaS: mensal, por veículo, por locação?
- Regras de multa, atraso e renovação.
- Política de blacklist e LGPD.
- Multiunidade ou apenas uma locadora por conta?
