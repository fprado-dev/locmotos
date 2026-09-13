-- Pagamento: o registro de que uma cobrança foi quitada.
--
-- É tabela e não uma coluna `paid_on` na cobrança — que foi o lugar-tenente
-- que a issue anterior deixou — porque o glossário pede o mesmo que a
-- restrição pede: **quando** e **quem**. Um `date` não guarda responsável, e
-- desfazer um lançamento errado apagaria a linha em vez de registrar o
-- desfazimento. Pago passa a ser consulta; o pagamento é o fato.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001).

-- Alvo do FK composto de `payments`.
alter table public.charges
  add constraint charges_id_tenant_key unique (id, tenant_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  charge_id uuid not null,
  -- Quando o dinheiro entrou, que não é quando o gestor digitou: ele lança na
  -- segunda o que recebeu no sábado. Default é hoje, em dia de Brasília.
  received_on date not null default public.today_br(),
  -- Quem registrou, como estava escrito na hora — o mesmo que a restrição
  -- guarda, e pela mesma razão: é o que a locadora tem para mostrar depois.
  created_by_name text not null,
  created_at timestamptz not null default now(),
  -- O desfazimento de um lançamento errado. A linha não é apagada: ter
  -- registrado e ter desfeito são dois fatos, e o segundo não apaga o primeiro.
  reversed_at timestamptz,
  reversed_by_name text,
  constraint payments_created_by_not_blank
    check (btrim(created_by_name) <> ''),
  -- Desfazimento pela metade não é desfazimento: ou tem data e responsável, ou
  -- não tem nenhum dos dois.
  constraint payments_reversal_complete
    check ((reversed_at is null) = (reversed_by_name is null)),
  -- A locadora do pagamento e a da cobrança são a mesma, garantido pelo banco.
  constraint payments_charge_fkey
    foreign key (charge_id, tenant_id)
    references public.charges (id, tenant_id) on delete cascade
);

-- Uma cobrança não é paga duas vezes. É índice parcial e não `if` na
-- aplicação: dois cliques simultâneos não viram dois pagamentos, e desfazer
-- libera a cobrança para ser paga de novo — que é o ponto de desfazer.
create unique index payments_active_charge_key
  on public.payments (charge_id)
  where reversed_at is null;

-- Toda query passa pelo filtro de tenant_id; sem índice, todo select vira seq scan.
create index payments_tenant_id_idx on public.payments (tenant_id);

alter table public.payments enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy payments_select_own_tenant
  on public.payments for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy payments_insert_own_tenant
  on public.payments for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

-- O update existe para o desfazimento, e só.
create policy payments_update_own_tenant
  on public.payments for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- O operador do SaaS lê os pagamentos de qualquer locadora, como já lê o
-- resto, e só lê.
create policy payments_select_operator
  on public.payments for select to authenticated
  using ((select public.is_operator()));

-- "Em aberto" deixa de ser uma data na cobrança e passa a ser a ausência de
-- pagamento em pé. É a mesma troca que a restrição fez: o fato é o registro, e
-- o estado é o que se lê dele.
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
    and c.due_on < public.today_br()
    and not exists (
      select 1
      from public.payments pg
      where pg.charge_id = c.id and pg.reversed_at is null
    )
) f on true;

grant select on public.rental_details to authenticated, service_role;

-- Some o lugar-tenente. Quem sabe se uma cobrança foi paga é `payments`, e
-- duas fontes para a mesma verdade acabam discordando no pior dia.
--
-- Junto com a coluna cai o índice parcial `charges_overdue_idx`, que era
-- `(rental_id, due_on) where paid_on is null`. Não é recriado de propósito:
-- `charges_cycle_key` já é `(rental_id, cycle_start)` e responde ao filtro por
-- locação, e as cobranças de uma locação cabem em dezenas de linhas.
alter table public.charges drop column paid_on;
