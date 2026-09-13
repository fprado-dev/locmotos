-- Rateio da última semana: quem devolve na quarta paga três dias.
--
-- A decisão está na issue #46: `valor do ciclo ÷ 7 × dias usados`, arredondado
-- ao centavo. Retira o `ponytail:` que `generate_charges()` carregava desde a
-- #37 — "a última semana é cobrada inteira; rateio é assunto da rescisão".
--
-- Duas pontas precisam da mesma regra, e por isso ela vira função:
--   - o gerador, para o ciclo que nasce depois da locação já encerrada;
--   - o encerramento, para o ciclo que já existia inteiro quando a moto voltou.
-- Escrita duas vezes, as duas divergiriam no primeiro arredondamento.

-- Quanto vale um ciclo, dado quando a locação acabou.
--
-- `ended_on` nulo ou depois do fim do ciclo é semana cheia: o caso comum, e o
-- único que existia antes desta migration. O `greatest` é contra o
-- `charges_amount_positive`: um valor semanal de centavos rateado por um dia
-- arredondaria para zero e derrubaria o encerramento com erro de check.
create function public.cycle_amount(weekly numeric, cycle_start date, ended_on date)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when ended_on is null or ended_on >= cycle_start + 6 then weekly
    else greatest(round(weekly / 7 * (ended_on - cycle_start + 1), 2), 0.01)
  end
$$;

comment on function public.cycle_amount(numeric, date, date) is
  'O valor de um ciclo: semana cheia, ou rateada por dia quando a locação acabou no meio dela (issue #46).';

-- O gerador, agora ciente de que a última semana pode ser parcial.
--
-- `least` ignora nulo no Postgres: locação em pé continua ganhando o ciclo
-- inteiro, de sete dias, sem um `case` a mais para dizer isso.
--
-- O resto é o de sempre e continua valendo: idempotente pelo índice único,
-- `security invoker` de propósito (cron gera para todas as locadoras, gestor
-- logado só para a dele), e só ciclos que já começaram.
create or replace function public.generate_charges()
returns integer
language sql
volatile
set search_path = ''
as $$
  with novas as (
    insert into public.charges
      (tenant_id, rental_id, cycle_start, cycle_end, due_on, amount)
    select
      r.tenant_id,
      r.id,
      inicio::date,
      least(inicio::date + 6, r.ended_on),
      least(inicio::date + 6, r.ended_on),
      public.cycle_amount(r.weekly_price, inicio::date, r.ended_on)
    from public.rentals r
    cross join lateral generate_series(
      r.started_on::timestamp,
      coalesce(r.ended_on, public.today_br())::timestamp,
      interval '7 days'
    ) as inicio
    on conflict (rental_id, cycle_start) do nothing
    returning 1
  )
  select count(*)::integer from novas;
$$;

-- Rateia o ciclo que estava em curso quando a moto voltou.
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
-- Devolve o novo valor, ou nulo quando não havia o que ratear — a locação
-- acabou no fim de um ciclo, o ciclo estava pago, ou ela é de outra locadora
-- (`security invoker`: a RLS decide isso, não um `where tenant_id`).
create function public.settle_last_cycle(p_rental_id uuid)
returns numeric
language sql
volatile
set search_path = ''
as $$
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
      select 1 from public.payments p
      where p.charge_id = c.id and p.reversed_at is null
    )
  returning c.amount;
$$;

comment on function public.settle_last_cycle(uuid) is
  'Rateia por dia o ciclo em curso no encerramento. Nulo quando não havia o que ratear.';

grant execute on function public.cycle_amount(numeric, date, date) to authenticated, service_role;
grant execute on function public.settle_last_cycle(uuid) to authenticated, service_role;
