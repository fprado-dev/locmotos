-- A semana que ninguém andou: encerramento retroativo e as cobranças que
-- sobram depois da devolução.
--
-- O gerador cria um ciclo por semana **até hoje**, enquanto a locação está de
-- pé. Encerrar com data retroativa — "a moto voltou dia 1º" — rateava o ciclo
-- que contém o dia 1º e deixava intactos os que vieram depois. Eles venciam,
-- entravam no `overdue_amount`, no card "Inadimplentes" e no chip: o locatário
-- virava devedor de uma semana em que a moto estava na garagem da locadora.
--
-- A decisão está na issue #49: apagar, não marcar. Uma cobrança de um ciclo
-- que começa depois da devolução não é fato consumado — é sobra do
-- agendamento. O `docs/adr/0009` protege a cobrança de ser reescrita por
-- correção de preço; protege o histórico do negócio, não o lixo do cron.

-- Apagar **esta** cobrança, e não "apagar cobrança".
--
-- A condição mora na policy e não num `where` que alguém pode esquecer: pelo
-- PostgREST, o gestor não consegue estender isto para nenhuma outra linha. É
-- por isso que não há `security definer` aqui — a contenção é da RLS, que é
-- onde ela não depende de ninguém lembrar dela.
--
-- ponytail: órfã já paga fica de pé (o `not exists` a exclui). Só acontece se
-- alguém pagou a semana adiantada e depois lançou a devolução para trás, e aí
-- houve dinheiro: apagar deixaria um pagamento apontando para o nada. O acerto
-- é estorno, e estorno entra quando a v1 tiver conversa de dinheiro de volta.
create policy charges_delete_after_return
  on public.charges for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1
      from public.rentals r
      where r.id = charges.rental_id
        and r.ended_on is not null
        and charges.cycle_start > r.ended_on
    )
    and not exists (
      select 1
      from public.payments p
      where p.charge_id = charges.id
        and p.reversed_at is null
    )
  );

-- `settle_last_cycle` vira `settle_return`: ela não acerta só o último ciclo,
-- ela acerta a conta da devolução inteira — o ciclo em curso vira rateio, e os
-- que começam depois da devolução vão embora.
drop function public.settle_last_cycle(uuid);

-- Acerta a conta de uma locação encerrada.
--
-- Duas coisas, nesta ordem, porque a segunda depende da primeira não ter
-- acontecido ainda: descarta as semanas inteiramente posteriores à devolução,
-- e rateia por dia a semana que a devolução partiu ao meio.
--
-- Encolhe o período junto com o valor: uma cobrança de R$ 128,57 rotulada
-- "01/06 – 07/06" seria mentira de tela, e o vencimento passa a ser o dia da
-- devolução — a mesma regra de sempre, o último dia do ciclo.
--
-- **Ciclo já pago fica inteiro.** Baixar o valor de uma cobrança quitada
-- criaria um crédito que a v1 não sabe guardar; o estorno é conversa fora do
-- sistema. É o mesmo "em aberto é a ausência de pagamento em pé" que o resto
-- do dinheiro usa.
--
-- Devolve o novo valor do ciclo rateado, ou nulo quando não havia o que
-- ratear — a locação acabou no fim de um ciclo, o ciclo estava pago, ou ela é
-- de outra locadora (`security invoker`: quem decide isso é a RLS, não um
-- `where tenant_id`).
create function public.settle_return(p_rental_id uuid)
returns numeric
language sql
volatile
set search_path = ''
as $$
  delete from public.charges c
  using public.rentals r
  where r.id = c.rental_id
    and c.rental_id = p_rental_id
    and r.ended_on is not null
    and c.cycle_start > r.ended_on;

  update public.charges c
  set cycle_end = r.ended_on,
      due_on = r.ended_on,
      amount = public.cycle_amount(c.amount, c.cycle_start, r.ended_on)
  from public.rentals r
  where r.id = c.rental_id
    and c.rental_id = p_rental_id
    and r.ended_on is not null
    and c.cycle_start <= r.ended_on
    and c.cycle_end > r.ended_on
    and not exists (
      select 1
      from public.payments p
      where p.charge_id = c.id
        and p.reversed_at is null
    )
  returning c.amount;
$$;

comment on function public.settle_return(uuid) is
  'Acerta a conta da devolução: descarta as semanas posteriores a ela e rateia por dia a que ela partiu ao meio.';

grant execute on function public.settle_return(uuid) to authenticated, service_role;
