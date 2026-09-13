-- Ciclos e cobranças: a semana como unidade do negócio.
--
-- O ciclo é **gravado**, não derivado. O porquê e o preço estão em
-- `docs/adr/0009-ciclo-de-cobranca-gravado.md`; o que importa aqui é a
-- consequência: uma linha por semana de locação, imóvel depois de criada, e um
-- gerador idempotente que a cria.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001).

-- Alvo do FK composto de `charges`, abaixo — o mesmo que `vehicles` ganhou
-- quando `rentals` passou a apontar para ela.
alter table public.rentals
  add constraint rentals_id_tenant_key unique (id, tenant_id);

-- O dia de hoje na folhinha de quem opera a locadora.
--
-- O banco roda em UTC, e entre 21h e meia-noite de Brasília o `current_date` do
-- Postgres já é amanhã. Uma cobrança que vence hoje viraria "atrasada" às 21h,
-- na frente do gestor. É a mesma correção que `lib/calendar.ts` faz do lado do
-- aplicativo, aqui do lado do banco.
create function public.today_br()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

comment on function public.today_br() is
  'O dia de calendário em Brasília. O corte de "vencido" é dia de folhinha, não instante UTC.';

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  rental_id uuid not null,
  -- O ciclo: a semana que esta cobrança cobre. Gravado, e não calculado a
  -- partir da data de início, porque mexer no acordo não pode reescrever o
  -- histórico de quem já foi cobrado.
  cycle_start date not null,
  cycle_end date not null,
  -- Hoje o vencimento é o último dia do ciclo: o locatário usa a semana e paga
  -- por ela. Se a locadora passar a cobrar adiantado ou a dar prazo, quem muda
  -- é o gerador — e as cobranças já criadas continuam valendo com a regra que
  -- valia no dia. É para isso que a cobrança é gravada.
  due_on date not null,
  -- Cópia do valor semanal da locação no momento em que o ciclo nasceu.
  amount numeric(10, 2) not null,
  -- Nulo é cobrança em aberto. Quem escreve aqui é o registro de pagamento,
  -- que é a issue seguinte.
  paid_on date,
  created_at timestamptz not null default now(),
  constraint charges_amount_positive check (amount > 0),
  constraint charges_cycle_ordered check (cycle_end >= cycle_start),
  constraint charges_due_within_reach check (due_on >= cycle_start),
  -- A locadora da cobrança e a da locação são a mesma, garantido pelo banco.
  constraint charges_rental_fkey
    foreign key (rental_id, tenant_id)
    references public.rentals (id, tenant_id) on delete cascade
);

-- A garantia de que rodar o gerador duas vezes não cobra duas vezes. É índice
-- e não `if` no gerador: duas execuções simultâneas não viram duas cobranças.
create unique index charges_cycle_key on public.charges (rental_id, cycle_start);

-- Toda query passa pelo filtro de tenant_id; sem índice, todo select vira seq scan.
create index charges_tenant_id_idx on public.charges (tenant_id);

-- "Quanto esta locação deve" é a pergunta de toda linha das duas listas.
create index charges_overdue_idx
  on public.charges (rental_id, due_on)
  where paid_on is null;

alter table public.charges enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy charges_select_own_tenant
  on public.charges for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy charges_insert_own_tenant
  on public.charges for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy charges_update_own_tenant
  on public.charges for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- O operador do SaaS lê as cobranças de qualquer locadora, como já lê o resto,
-- e só lê.
create policy charges_select_operator
  on public.charges for select to authenticated
  using ((select public.is_operator()));

-- O gerador de ciclos.
--
-- Idempotente pelo índice único: `on conflict do nothing` faz a segunda
-- execução do dia não cobrar de novo. Devolve quantas cobranças nasceram, que
-- é o que um teste e um log precisam saber.
--
-- **Security invoker de propósito.** Chamado pelo agendamento, roda como dono
-- das tabelas e gera para todas as locadoras; chamado por um gestor logado, a
-- RLS o prende à locadora dele. Os dois comportamentos certos, sem
-- `security definer` e sem o buraco que ele abriria.
--
-- Só ciclos que já começaram: `generate_series` para em hoje (ou no
-- encerramento). Locação aberta hoje ganha um ciclo, que vence daqui a seis
-- dias — ela não nasce devendo.
--
-- ponytail: a última semana de uma locação encerrada no meio do ciclo é
-- cobrada inteira. Rateio é assunto da rescisão, na issue de encerrar.
create function public.generate_charges()
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
      inicio::date + 6,
      inicio::date + 6,
      r.weekly_price
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

comment on function public.generate_charges() is
  'Cria as cobranças dos ciclos que já começaram. Idempotente: rodar de novo não duplica.';

grant execute on function public.generate_charges() to authenticated, service_role;

-- A locação com o que ela deve, junto do resto.
--
-- As duas colunas novas no fim são o que a coluna "Financeiro" das duas listas
-- lê, o que o chip de inadimplência filtra e o que o card "Inadimplentes"
-- soma. Ficam aqui, e não numa conta no aplicativo, porque a lista **filtra**
-- e **conta** por elas: fora do banco, "inadimplentes" precisaria excluir os
-- adimplentes depois de paginar, e a paginação passaria a mentir.
--
-- `overdue_since` é a cobrança vencida mais antiga: é dela que saem os dias de
-- atraso, contados no aplicativo por `lib/calendar.ts`, onde a regra de dia de
-- calendário já vive. A view diz *desde quando*; quem conta os dias é quem já
-- conta os da CNH e os do licenciamento.
create or replace view public.rental_details
with (security_invoker = on)
as
select
  r.id,
  r.tenant_id,
  r.vehicle_id,
  r.renter_id,
  r.weekly_price,
  r.started_on,
  r.commitment_months,
  r.deposit,
  r.ended_on,
  r.created_at,
  v.plate,
  v.brand,
  v.model,
  p.name as renter_name,
  coalesce(f.overdue_amount, 0) as overdue_amount,
  f.overdue_since
from public.rentals r
join public.vehicles v on v.id = r.vehicle_id
join public.renters p on p.id = r.renter_id
left join lateral (
  select sum(c.amount) as overdue_amount, min(c.due_on) as overdue_since
  from public.charges c
  where c.rental_id = r.id
    and c.paid_on is null
    and c.due_on < public.today_br()
) f on true;

grant select on public.rental_details to authenticated, service_role;
