-- A despesa: o dinheiro que sai do caixa da locadora.
--
-- Escopo decidido na issue #59. O verbete do `CONTEXT.md` é `Expense`, par de
-- `Income` — e o par não vira tabela: **entrada é pagamento**, que já está
-- gravado em `public.payments`. Uma tabela de recebimentos espelhando
-- pagamentos seria a armadilha de sempre, duas verdades que divergem no
-- primeiro estorno.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001).

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  -- Dia, e não instante: caixa é folhinha. Quando o dinheiro saiu, que não é
  -- quando o gestor digitou — ele lança na segunda o que pagou no sábado.
  spent_on date not null default public.today_br(),
  amount numeric(10, 2) not null,
  description text not null,
  -- Lista curta e fechada. Fechada porque é o que faz a soma por categoria
  -- significar alguma coisa; curta porque uma lista de vinte vira "outros" em
  -- toda linha. Texto com check e não enum, como o `moment` da vistoria: um
  -- valor novo num enum custa migration só para ser lido.
  category text not null,
  -- A despesa que é de uma moto aponta para ela; aluguel do galpão não aponta
  -- para nenhuma, e obrigar seria mentir. Sem `on delete cascade` de propósito
  -- — a baixa da moto é soft delete, então a linha dela continua existindo.
  vehicle_id uuid,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_description_not_blank check (btrim(description) <> ''),
  constraint expenses_created_by_not_blank check (btrim(created_by_name) <> ''),
  constraint expenses_category_known check (
    category in ('maintenance', 'licensing', 'insurance', 'fine', 'fuel', 'other')
  ),
  -- A locadora da despesa e a da moto são a mesma, garantido pelo banco.
  constraint expenses_vehicle_fkey
    foreign key (vehicle_id, tenant_id)
    references public.vehicles (id, tenant_id) on delete set null
);

-- A tela é sempre "o mês tal": filtro por locadora e faixa de dia.
create index expenses_tenant_spent_on_idx
  on public.expenses (tenant_id, spent_on desc);

-- A mesma pergunta do outro lado do extrato. `payments` já tem índice por
-- locadora, mas o recorte do mês é por data de recebimento.
create index payments_tenant_received_on_idx
  on public.payments (tenant_id, received_on desc);

alter table public.expenses enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy expenses_select_own_tenant
  on public.expenses for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy expenses_insert_own_tenant
  on public.expenses for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy expenses_update_own_tenant
  on public.expenses for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- Despesa tem apagar, como a infração e ao contrário de cobrança e pagamento:
-- a linha nasce de alguém digitando um número, e valor errado em caixa é lixo,
-- não história. Da própria locadora, nunca do operador.
create policy expenses_delete_own_tenant
  on public.expenses for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- O operador do SaaS lê as despesas de qualquer locadora, como já lê o resto,
-- e só lê.
create policy expenses_select_operator
  on public.expenses for select to authenticated
  using ((select public.is_operator()));

-- O extrato: o que entrou e o que saiu, numa lista só.
--
-- Entrada e saída não são duas tabelas lado a lado na tela — são um extrato,
-- em ordem de dia. Costurar as duas no aplicativo daria uma paginação que é
-- chute, que é o mesmo motivo de `fleet` e `rental_details` existirem.
--
-- `amount` é sempre **positivo**; quem diz a direção é `kind`. Sinal negativo
-- numa coluna de dinheiro é convite a somar errado uma vez e não perceber.
--
-- Pagamento estornado não aparece: desfazer é registrar o desfazimento, mas o
-- dinheiro não entrou. É a mesma regra que a coluna Financeiro das listas usa.
--
-- `security_invoker` como as outras views: as policies de `payments`,
-- `charges`, `rentals`, `vehicles`, `renters` e `expenses` continuam valendo.
create view public.cash_entries
with (security_invoker = on)
as
select
  'payment' as kind,
  p.id,
  p.tenant_id,
  p.received_on as happened_on,
  c.amount,
  -- Pagamento de locação é uma categoria só, e ela não existe em `expenses`:
  -- a lista de categorias de despesa não precisa de um valor que nunca será
  -- escolhido num formulário de saída.
  'rent' as category,
  null::text as description,
  c.cycle_start,
  c.cycle_end,
  v.id as vehicle_id,
  v.plate,
  r.id as renter_id,
  r.name as renter_name,
  p.created_by_name
from public.payments p
join public.charges c on c.id = p.charge_id
join public.rentals l on l.id = c.rental_id
join public.vehicles v on v.id = l.vehicle_id
join public.renters r on r.id = l.renter_id
where p.reversed_at is null

union all

select
  'expense',
  e.id,
  e.tenant_id,
  e.spent_on,
  e.amount,
  e.category,
  e.description,
  null::date,
  null::date,
  e.vehicle_id,
  v.plate,
  null::uuid,
  null::text,
  e.created_by_name
from public.expenses e
-- Externa: a despesa sem moto é a regra, não a exceção.
left join public.vehicles v on v.id = e.vehicle_id;

grant select on public.cash_entries to authenticated, service_role;

comment on view public.cash_entries is
  'O extrato do caixa: pagamentos recebidos e despesas lançadas, numa lista só. amount é sempre positivo; kind diz a direção.';
