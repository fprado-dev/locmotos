# Questionário: as lacunas do levantamento

**Propósito:** você já me passou a lista do que o sistema precisa ter. Ela me diz muito, mas descreve as telas — não as regras por trás delas. Estas perguntas cobrem só o que ficou em aberto. São as respostas que decidem o que entra na primeira versão e como o sistema calcula dinheiro.

**De:** Filipe Prado · **Para:** dono da locadora · **Como suas respostas serão usadas:** viram as regras de negócio do sistema e a ordem em que as funcionalidades são construídas.

## Contexto

Recebi sua lista com landing page, dashboard, locações, frota, clientes, finanças, simulador, rastreamento, blacklist, multas e portal do cliente. Está clara e vou usá-la. O problema é que construir tudo isso de uma vez leva muito tempo, e algumas partes dependem de regras que só você sabe — quanto custa, quando cobra, o que acontece quando dá errado. As perguntas abaixo são sobre a sua operação real, não sobre telas.

## Como responder

Leva mais ou menos **20 minutos**. Responda em texto corrido, com exemplos e valores reais. Prazo: **<!-- preencher: data -->**.

Se não souber ou variar caso a caso, diga isso — "depende" é uma resposta importante, porque significa que o sistema precisa deixar o campo aberto em vez de calcular sozinho.

## O que vem primeiro

### Se só três coisas da sua lista existissem no primeiro dia de uso, quais seriam?

_Por que isso importa: é a pergunta mais importante do documento. Sua lista tem cerca de cem funcionalidades; a primeira versão vai ter dez. Estas três definem quais._

>

### O que você colocou na lista porque viu em outro sistema, e não porque te faz falta hoje?

_Por que isso importa: não vou julgar nada do que você pediu — só preciso saber o que é desejo e o que é dor. Cortar cedo é barato._

>

### Quantas horas por semana você ou sua equipe gastam hoje com o que esse sistema resolveria?

>

## Como o dinheiro funciona

### Sua lista fala em "valor semanal" e ao mesmo tempo em "tempo mínimo de 3 a 36 meses". Como isso funciona na prática?

_Por que isso importa: pagamento semanal com contrato de meses é um modelo específico e muda toda a estrutura de cobrança do sistema. Preciso entender antes de modelar._

>

### Quem é o seu cliente típico e para que ele usa a moto?

>

### Como você chega no valor semanal de uma moto?

_Por que isso importa: se é tabela fixa, o sistema calcula. Se é negociado caso a caso, o sistema só registra. São construções diferentes._

>

### Você cobra caução? Quanto, quando devolve e o que desconta dela?

>

### O cliente não pagou a semana. O que acontece no dia seguinte?

>

### E se ele continuar sem pagar por um mês?

_Por que isso importa: sua lista pede "inadimplente", "bloqueio de nova locação" e "sugerir blacklist". Preciso dos prazos reais para o sistema disparar isso sozinho._

>

### Como você recupera uma moto de um cliente que parou de pagar?

>

## Quando dá errado

### Chegou multa de trânsito de uma moto alugada. O que você faz hoje, passo a passo?

>

### Moto roubada, acidentada ou que não voltou: quantas vezes já aconteceu e como você resolveu?

_Por que isso importa: define se "sinistros" é uma tela de verdade na primeira versão ou uma anotação que pode esperar._

>

## A operação hoje

### Quantas motos você tem na frota e quantas estão alugadas agora?

>

### O que você usa hoje para controlar isso — caderno, planilha, WhatsApp, algum sistema?

_Por que isso importa: se já existe uma planilha, ela é o melhor retrato da sua operação. Se puder me mandar uma cópia (pode apagar os nomes), vale mais que várias respostas aqui._

>

### Quem na sua equipe mexeria no sistema, e o que cada um não deveria poder ver?

>

## Mais alguma coisa?

### O que eu não perguntei e deveria ter perguntado?

>
