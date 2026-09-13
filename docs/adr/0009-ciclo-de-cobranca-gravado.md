# O ciclo de cobrança é gravado, não derivado

Cada semana de uma locação vira **uma linha** em `public.charges`, criada por um gerador que roda todo dia no banco. O ciclo — o período — e a cobrança — o valor devido por ele — moram na mesma linha.

A alternativa era derivar tudo da locação: a data de início mais o valor semanal já descrevem todas as semanas que existiram, e nenhuma linha precisaria ser criada. Nada desincroniza porque não há nada para sincronizar.

Foi descartada por duas razões, e a segunda é a que decide.

**Um pagamento precisa apontar para alguma coisa.** Registrar "recebi do Fulano" é registrar o quê, exatamente — a terceira semana? Contada de quando? Um ciclo derivado não tem identidade: ele é um índice numa sequência que se recalcula toda vez que alguém olha.

**Um valor semanal corrigido reescreveria o passado.** O `CONTEXT.md` já protege o acordo da tabela de preços da frota: a locação copia o valor na abertura. Mas a locação em si é corrigível — um desconto negociado, um erro de digitação. Com o ciclo derivado, corrigir o valor semanal muda retroativamente quanto o locatário devia em maio, inclusive nas semanas que ele já pagou. Cobrança é fato consumado, e fato consumado não se recalcula.

É a mesma linha que o resto do sistema já segue: derivar o que é consulta — dias sem locação, dias até a CNH, "reservada" —, gravar o que é fato — a restrição com motivo e responsável, a locação, o encerramento.

## Consequências

**Existe um gerador, e ele roda sozinho.** `public.generate_charges()` cria as cobranças dos ciclos que já começaram, agendado no `pg_cron` às 03:00 de Brasília. Não é uma rota do aplicativo: uma locadora que passou a semana sem abrir o sistema precisa encontrar as cobranças da semana quando voltar.

**Rodar duas vezes não cobra duas vezes.** A idempotência é do índice único `(rental_id, cycle_start)` com `on conflict do nothing` — não de um `if` no gerador, que duas execuções simultâneas atravessariam.

**O gerador é `security invoker`, de propósito.** Chamado pelo agendamento, roda como dono das tabelas e gera para todas as locadoras; chamado por um gestor logado, a RLS o prende à locadora dele. Os dois comportamentos certos sem o buraco que um `security definer` abriria.

**Só o que já começou.** `generate_series` para em hoje: uma locação aberta hoje ganha o ciclo desta semana, que vence daqui a seis dias. Ela não nasce devendo.

**O atraso continua derivado.** A linha grava o vencimento; quantos dias se passaram desde ele é conta de leitura, feita por `lib/calendar.ts`, como a da CNH e a do licenciamento. Não existe coluna `overdue`, e inadimplência não é situação da locação — uma locação pode estar ativa e inadimplente ao mesmo tempo.

**O corte de "vencido" é dia de Brasília.** O banco roda em UTC, onde às 21h já é amanhã; `public.today_br()` é a mesma correção de fuso que `lib/calendar.ts` faz do lado do aplicativo.

**O vencimento é o último dia do ciclo.** O locatário usa a semana e paga por ela. Se a locadora passar a cobrar adiantado ou a dar prazo, quem muda é o gerador — e as cobranças já criadas continuam valendo com a regra que valia no dia em que nasceram. É exatamente o que gravar compra.

**A última semana de uma locação encerrada no meio do ciclo é rateada por dia** — `valor do ciclo ÷ 7 × dias andados`, ao centavo (issue #46). É o encerramento que encolhe a cobrança já criada, e o gerador que já cria encolhida a que nascer depois; a regra mora em `public.cycle_amount` para as duas portas não divergirem no arredondamento. Ciclo já pago fica inteiro: baixar o valor de uma cobrança quitada criaria um crédito que a v1 não sabe guardar.
