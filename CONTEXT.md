# locmotos

Sistema de gestão para locadoras de motos: frota, locatários, locações e a cobrança semanal que as sustenta.

Este documento é um **glossário**, não uma especificação. Decisões de arquitetura ficam em `docs/adr/`.

Convenção: os termos são definidos em português; o identificador correspondente no código vem em inglês, marcado como _Código_.

## Quem é quem

**Locadora**:
Empresa que aluga motos. É a fronteira de isolamento de dados do sistema — uma locadora, um tenant, sem filiais.
_Código_: `Tenant`
_Evitar_: cliente, empresa, unidade, filial, conta

**Gestor**:
Pessoa que administra uma locadora dentro do sistema. Enxerga tudo da sua locadora e nada das outras.
_Código_: `Manager`
_Evitar_: admin, dono, proprietário

**Locatário**:
Pessoa que aluga a moto e a pilota. No locmotos, quem aluga e quem conduz são a mesma pessoa.
_Código_: `Renter`
_Evitar_: cliente, condutor, motorista, usuário, motoboy

**Operador do SaaS**:
Quem administra o produto e enxerga todas as locadoras. É o papel do fornecedor do sistema, não da locadora.
_Código_: `Operator`
_Evitar_: super admin, root

> **"Cliente" é palavra proibida.** Ela significa a locadora quando vista do SaaS, e o locatário quando vista da locadora. Use sempre o termo específico.

## A locação

**Locação**:
Acordo comercial pelo qual uma locadora cede uma moto a um locatário por um período, em troca de pagamento semanal.
_Código_: `Rental`
_Evitar_: aluguel, contrato, reserva

**Contrato**:
Documento assinado que dá evidência jurídica a uma locação. Uma locação tem no máximo um contrato assinado.
_Código_: `Contract`
_Evitar_: termo, acordo

**Fidelidade**:
Prazo mínimo pelo qual o locatário se compromete com a locação. Sair antes dele gera penalidade.
_Código_: `commitmentTerm`
_Evitar_: tempo mínimo, prazo mínimo, carência, lock-in

**Rescisão antecipada**:
Encerramento de uma locação antes do fim da fidelidade.
_Código_: `earlyTermination`
_Evitar_: cancelamento, quebra de contrato

**Caução**:
Valor retido no início da locação e devolvido no encerramento, descontadas avarias e débitos em aberto.
_Código_: `deposit`
_Evitar_: depósito, garantia, entrada, sinal

## Dinheiro

**Ciclo**:
Semana de cobrança de uma locação. É a unidade de tempo do negócio.
_Código_: `BillingCycle`
_Evitar_: período, competência, mês

**Cobrança**:
Valor que o locatário deve por um ciclo.
_Código_: `Charge`
_Evitar_: parcela, fatura, boleto, mensalidade, título

**Pagamento**:
Registro de que uma cobrança foi quitada. Na v1 é o gestor quem registra, na mão.
_Código_: `Payment`
_Evitar_: baixa, quitação, recebimento

**Inadimplência**:
Condição de uma locação que tem cobrança vencida e não paga. **Não é um estado do ciclo de vida** — uma locação pode estar simultaneamente ativa e inadimplente.
_Código_: `delinquency`
_Evitar_: atraso, débito, status inadimplente

**Régua de inadimplência**:
Sequência de dias de atraso e as ações que cada marco dispara.
_Código_: `DelinquencyPolicy`
_Evitar_: política de cobrança, fluxo de cobrança

**Recebimento** / **Despesa**:
Dinheiro que entra e dinheiro que sai do caixa da locadora.
_Código_: `Income` / `Expense`
_Evitar_: entrada, saída — ambíguos com a entrada de um financiamento

**Plano de assinatura**:
O que a locadora paga ao locmotos para usar o sistema. Distinto de **plano de manutenção**, que é serviço incluído numa locação.
_Código_: `SubscriptionPlan` / `MaintenancePlan`
_Evitar_: plano, sozinho e sem qualificador

## A frota

**Veículo**:
Unidade alugável da frota. A v1 só opera motos, mas o modelo não presume isso.
_Código_: `Vehicle`
_Evitar_: moto, bem, ativo

**Frota**:
Conjunto de veículos de uma locadora.
_Código_: `Fleet`

**Situação**:
Em que estado de operação um veículo está: disponível, reservada, em manutenção ou indisponível. Na v1 quem define é o gestor, na mão.
_Código_: `VehicleStatus`
_Evitar_: estado, disponibilidade, condição

**Vistoria**:
Registro do estado de um veículo na entrega e na devolução: quilometragem, combustível e avarias.
_Código_: `Inspection`
_Evitar_: checklist, laudo, conferência

**Manutenção**:
Intervenção técnica num veículo, preventiva ou corretiva.
_Código_: `Maintenance`
_Evitar_: revisão, reparo, ordem de serviço

## Risco

**Restrição**:
Marca que impede um locatário de abrir nova locação, com motivo e responsável registrados.
_Código_: `Restriction`
_Evitar_: blacklist, lista negra, bloqueio

**Sinistro**:
Evento que tira o veículo de operação por dano, roubo, furto ou perda total.
_Código_: `Incident`
_Evitar_: ocorrência, acidente, evento

**Infração**:
Multa de trânsito atribuída a um veículo durante uma locação.
_Código_: `TrafficViolation`
_Evitar_: multa — ambíguo com a multa por atraso de pagamento

## Lacunas conhecidas

Três regras existem no negócio mas ainda não têm valor definido. Só o dono da locadora responde, via `to-questionnaire-gestao-locadora-motos.md`. Não invente números para elas:

1. **Régua de inadimplência** — quantos dias de atraso até restringir o locatário, e o que cada marco dispara.
2. **Penalidade de rescisão antecipada** — quanto paga quem sai antes do fim da fidelidade.
3. **Cálculo de preço e caução** — tabela fixa por categoria de moto, ou negociado por locação.
