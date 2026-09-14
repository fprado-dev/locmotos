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

**CNH**:
Habilitação do locatário: a categoria e a data de validade. A locadora entrega moto, então a categoria tem que incluir o A. Vencida ou vencendo é derivado na leitura, nunca guardado — como **Dias sem locação**.
_Código_: `cnhCategory`, `cnhDueDate`
_Evitar_: carteira, habilitação, licença

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
Encerramento de uma locação antes do fim da fidelidade. Fica registrado na locação, com quantas semanas faltavam — o sistema **não calcula penalidade**: quanto se cobra é a lacuna nº 2, e o valor é digitado pelo gestor.
_Código_: `earlyTermination`
_Evitar_: cancelamento, quebra de contrato

**Valor semanal**:
O que o locatário paga por semana de locação. A moto tem o dela na tabela de preços; a locação copia esse valor na abertura e passa a tê-lo como seu. Mudar a tabela de preços da frota não mexe em acordo já feito.
_Código_: `weeklyPrice`
_Evitar_: mensalidade, diária, tarifa

**Caução**:
Valor retido no início da locação e devolvido no encerramento, descontadas avarias e débitos em aberto. O desconto por avaria é digitado pelo gestor, com motivo registrado. O débito em aberto **não** é abatido sozinho: cobrança vencida sobrevive ao encerramento e continua devida, e a tela avisa antes de confirmar.
_Código_: `deposit`
_Evitar_: depósito, garantia, entrada, sinal

## Dinheiro

**Ciclo**:
Semana de cobrança de uma locação. É a unidade de tempo do negócio. Gravado linha a linha, não derivado da data de início (`docs/adr/0009`): cobrança é fato consumado, e corrigir o valor semanal não pode reescrever o que já foi cobrado.
_Código_: `BillingCycle`
_Evitar_: período, competência, mês

**Cobrança**:
Valor que o locatário deve por um ciclo. Vence no último dia do ciclo — o locatário usa a semana e paga por ela. Uma locação aberta hoje não nasce devendo. A última cobrança é **rateada por dia** quando a moto volta no meio da semana: `valor do ciclo ÷ 7 × dias andados`, ao centavo, com o período encolhendo junto. Rescisão antecipada não muda esse rateio — o que ela cobra a mais é valor digitado, e continua sendo a lacuna nº 2. Encerrar com data retroativa **descarta** as cobranças das semanas que começam depois da devolução: elas são sobra do gerador, não semana que alguém andou.
_Código_: `Charge`
_Evitar_: parcela, fatura, boleto, mensalidade, título

**Pagamento**:
Registro de que uma cobrança foi quitada. Na v1 é o gestor quem registra, na mão, com a data em que o dinheiro entrou — que não é a data em que ele digitou — e quem registrou. Uma cobrança é paga por inteiro, e só uma vez. Desfazer um lançamento errado registra o desfazimento; não apaga a linha. "Em aberto" é a ausência de pagamento em pé, não uma coluna.
_Código_: `Payment`
_Evitar_: baixa, quitação, recebimento

**Inadimplência**:
Condição de uma locação que tem cobrança vencida e não paga. **Não é um estado do ciclo de vida** — uma locação pode estar simultaneamente ativa e inadimplente. Os dias de atraso e o total em aberto são derivados na leitura, a partir da cobrança em aberto mais antiga; não existe coluna que os guarde.
_Código_: `delinquency`
_Evitar_: atraso, débito, status inadimplente

**Régua de inadimplência**:
Sequência de dias de atraso e as ações que cada marco dispara.
_Código_: `DelinquencyPolicy`
_Evitar_: política de cobrança, fluxo de cobrança

**Recebimento** / **Despesa**:
Dinheiro que entra e dinheiro que sai do caixa da locadora. **Recebimento não é tabela**: todo dinheiro que entra na v1 entrou quitando uma cobrança, e o pagamento já é o fato — espelhá-lo numa segunda tabela criaria duas verdades que divergem no primeiro estorno. Despesa é fato novo, com dia, valor, o que foi, uma **categoria de lista fechada** e, opcionalmente, a moto a que se refere. O recorte do caixa é o **mês**, e não a semana do ciclo: o locatário paga por semana e a locadora fecha as contas por mês. **Caução fica de fora** dos dois lados — é dinheiro que está com a locadora e não é dela, e somá-lo faria o saldo mentir duas vezes. O valor de uma infração também não é despesa até ser pago; quando for, é lançado como qualquer outra saída. **O custo de uma manutenção já é despesa e não se digita duas vezes**: o extrato lê o número da própria ordem de serviço, com a data da saída da oficina — corrigi-lo lá corrige o caixa, e apagar a ordem tira a linha.
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

**Baixa**:
Tirar um veículo da frota ou um locatário da carteira sem apagar a linha. O cadastro some da lista e as locações e cobranças ligadas a ele continuam de pé — apagar levaria o histórico junto. A baixa de veículo tem **motivo** de lista fechada — vendida, perda total, roubada, outro — e aponta para o **sinistro** que a originou quando houve um: sem isso, daqui a um ano a moto que sumiu da lista não diz por quê. Motivo nulo é baixa anterior a este campo, e continua válida. **Moto em locação aberta não leva baixa**: a ordem é encerrar a locação primeiro, e a recusa diz isso. A ficha de uma moto baixada continua abrindo — é onde o motivo está escrito.
_Código_: `deletedAt`, `discardReason`, `removeVehicle`, `removeRenter`
_Evitar_: exclusão, delete, arquivar, inativar

**Situação**:
Em que estado de operação um veículo está: disponível, reservada, em manutenção ou indisponível. Duas são derivadas na leitura e não se escolhem: **reservada** significa "tem locação ativa" e acontece ao abrir uma locação, **em manutenção** significa "tem ordem de serviço aberta" e acontece ao registrar a manutenção; as duas passam sozinhas quando a locação encerra ou a moto sai da oficina. Restam duas na mão do gestor — disponível e indisponível —, e são só essas que o select oferece.
_Código_: `VehicleStatus`
_Evitar_: estado, disponibilidade, condição

**Dias sem locação**:
Há quantos dias um veículo está parado. Calculado na leitura, nunca guardado. Conta a partir da última devolução, ou da data de cadastro para a moto que nunca foi alugada.
_Código_: `daysWithoutRental`
_Evitar_: ociosidade, dias parado, idle

**Vistoria**:
Registro do estado de um veículo na entrega e na devolução: quilometragem, combustível e avarias. **Nenhuma das duas é obrigatória** e nenhum dos três campos é: abrir locação continua sendo um passo só, e o gestor anota o que conferiu. Uma por ponta — registrar de novo **corrige** a que existe, e quem corrige passa a ser quem assina. Combustível é o ponteiro do tanque em quartos, de vazio a cheio; avaria é **texto livre**, não lista de itens; foto ficou fora da v1. Os quilômetros rodados são a subtração entre as duas pontas, derivados na leitura — só existem quando as duas anotaram o odômetro.
_Código_: `Inspection`
_Evitar_: checklist, laudo, conferência

**Manutenção**:
Intervenção técnica num veículo, **preventiva** (revisão de rotina) ou **corretiva** (algo quebrou). A linha é do veículo e traz entrada, saída, o que foi feito em texto livre, oficina, odômetro e custo. **Saída em branco é a manutenção em aberto** — é o que põe a moto em manutenção na frota, e é por isso que só pode haver **uma aberta por moto**, garantido por índice único parcial e não por `if`. Moto com locação ativa não entra na oficina, e moto na oficina não é alugada: os dois lados leem a mesma situação derivada. Dias na oficina são conta de leitura, nunca coluna: enquanto está aberta conta até hoje, fechada conta os dois extremos. Apagar existe — ordem aberta na placa errada devolve a moto à frota na hora.
_Código_: `Maintenance`, `openMaintenance`, `daysInWorkshop`
_Evitar_: revisão, reparo, ordem de serviço

**Intervalo de revisão**:
De quantos em quantos quilômetros uma moto vai à revisão preventiva. É **da locadora**, com exceção por moto: a frota inteira costuma seguir um número só, e a moto que roda mais é a exceção que se digita na ficha. Não existe coluna "próxima revisão" — ela é o odômetro da última preventiva mais o intervalo, e a quilometragem de hoje é a **maior leitura** que alguém anotou: cadastro, vistoria de devolução ou entrada na oficina. A maior e não a mais recente, porque odômetro não anda para trás. Três estados, como o licenciamento: em dia, vencendo dentro da folga, vencida. Só manutenção **preventiva** zera a conta; corretiva não é revisão.
_Código_: `revisionIntervalKm`, `nextRevisionKm`, `revisionAlert`
_Evitar_: próxima revisão (como campo), plano de revisão

## Risco

**Restrição**:
Marca que impede um locatário de abrir nova locação, com motivo e responsável registrados.
_Código_: `Restriction`
_Evitar_: blacklist, lista negra, bloqueio

**Sinistro**:
Evento **externo** que tira o veículo de operação: batida, furto, roubo ou perda total. Furto e roubo são valores separados porque a locadora e a seguradora os tratam diferente. **Não é manutenção com outro nome** — manutenção é intervenção planejada ou conserto de desgaste; sinistro tem data, boletim de ocorrência e muitas vezes seguradora. A linha é do **veículo**, com data e **hora**: a hora decide a borda. **Quem estava com a moto não é um campo, é a mesma consulta da infração** — `public.rental_at`, em dia de Brasília —, com a mesma recusa a escolher quando duas locações contêm o dia. Registrar um sinistro **não mexe na situação da moto**: batida pode significar oficina, baixa ou nada, e quem decide é o gestor. A única exceção é perda total, que **oferece** a baixa no mesmo ato — oferece, porque o laudo da seguradora é que manda, e o sistema não sabe se ele saiu.
_Código_: `Incident`, `recordIncident`, `whoHadIt`
_Evitar_: ocorrência, acidente, evento

**Infração**:
Multa de trânsito atribuída a um veículo durante uma locação. A linha é do **veículo** — é com a placa que a notificação chega —, e traz número do auto (opcional, único por locadora), **data e hora**, o que foi em texto livre, valor e prazo de indicação. **De quem era a moto não é um campo: é uma consulta.** A locação já diz de quando até quando, e a atribuição é resolvida na leitura, em dia de Brasília; gravar o nome junto criaria duas verdades que divergem no dia em que alguém corrigir a data de início de uma locação. Sem locação naquele dia, a infração é da locadora, e a tela diz isso com todas as letras. Data de locação tem granularidade de **dia**, então moto devolvida de manhã e alugada de novo à tarde deixa o dia com dois donos possíveis: aí o sistema **não escolhe** — avisa. Apagar existe, ao contrário de cobrança e pagamento: a linha nasce de um papel digitado à mão, e infração na placa errada é lixo, não história.
_Código_: `TrafficViolation`
_Evitar_: multa — ambíguo com a multa por atraso de pagamento

## Lacunas conhecidas

Três regras existem no negócio mas ainda não têm valor definido. Só o dono da locadora responde, via `to-questionnaire-gestao-locadora-motos.md`. Não invente números para elas:

1. **Régua de inadimplência** — quantos dias de atraso até restringir o locatário, e o que cada marco dispara.
2. **Penalidade de rescisão antecipada** — quanto paga quem sai antes do fim da fidelidade.
3. **Cálculo de preço e caução** — tabela fixa por categoria de moto, ou negociado por locação.
