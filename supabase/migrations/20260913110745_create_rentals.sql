-- Locações: a terceira vertical, e a primeira que amarra duas outras.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001): não
-- existe janela em que a tabela exista sem isolamento. O molde é o de
-- `create_renters_and_restrictions`.

-- Alvo do FK composto de `rentals`, abaixo. `renters` já tem o dele; a frota
-- não tinha porque ninguém apontava para ela ainda.
alter table public.vehicles
  add constraint vehicles_id_tenant_key unique (id, tenant_id);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação: um bug no código não
  -- consegue abrir locação na locadora errada.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  vehicle_id uuid not null,
  renter_id uuid not null,
  -- Registrado, não calculado: é cópia do valor semanal da moto no momento da
  -- abertura, e daqui em diante vive na locação. Mexer na tabela de preços da
  -- frota não pode mexer no que já foi acordado com quem já está na rua.
  weekly_price numeric(10, 2) not null,
  started_on date not null default current_date,
  -- Fidelidade em meses. Opcional: quanto tempo o locatário se compromete é
  -- negociado caso a caso, e o `CONTEXT.md` proíbe inventar o número.
  commitment_months smallint,
  deposit numeric(10, 2),
  -- Nula é locação ativa. O encerramento é o fato — e a data dele é o que a
  -- issue de encerrar vai acrescentar, junto do resto da devolução. A linha
  -- nunca é apagada: ela é o histórico da moto e o do locatário.
  ended_on date,
  created_at timestamptz not null default now(),
  -- Locação sem valor semanal não é acordo comercial nenhum.
  constraint rentals_weekly_price_positive check (weekly_price > 0),
  constraint rentals_commitment_months_positive
    check (commitment_months is null or commitment_months > 0),
  constraint rentals_deposit_not_negative check (deposit is null or deposit >= 0),
  constraint rentals_ended_after_started
    check (ended_on is null or ended_on >= started_on),
  -- A locadora da locação, a da moto e a do locatário são a mesma, garantido
  -- pelo banco. Sem isto, ids vindos do browser abririam locação com a moto de
  -- uma locadora para o locatário de outra — a policy só olha o `tenant_id` da
  -- própria linha, e ele confere nos três casos.
  constraint rentals_vehicle_fkey
    foreign key (vehicle_id, tenant_id)
    references public.vehicles (id, tenant_id) on delete cascade,
  constraint rentals_renter_fkey
    foreign key (renter_id, tenant_id)
    references public.renters (id, tenant_id) on delete cascade
);

-- Toda query passa pelo filtro de tenant_id; sem índice, todo select vira seq scan.
create index rentals_tenant_id_idx on public.rentals (tenant_id);

-- "Qual a locação atual desta pessoa" é a pergunta do painel do locatário.
create index rentals_renter_id_idx on public.rentals (renter_id);

-- Uma moto em no máximo uma locação ativa por vez. É índice e não `if` na
-- aplicação: dois cliques simultâneos não viram duas locações, e "esta moto
-- está alugada?" tem uma resposta só. É também o índice que a view abaixo usa
-- para achar a locação ativa de cada veículo.
create unique index rentals_active_vehicle_key
  on public.rentals (vehicle_id)
  where ended_on is null;

alter table public.rentals enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy rentals_select_own_tenant
  on public.rentals for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy rentals_insert_own_tenant
  on public.rentals for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy rentals_update_own_tenant
  on public.rentals for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- O operador do SaaS lê as locações de qualquer locadora, como já lê a frota e
-- os locatários, e só lê.
create policy rentals_select_operator
  on public.rentals for select to authenticated
  using ((select public.is_operator()));

-- A frota com a situação já derivada.
--
-- `reserved` deixa de ser escolha do gestor e passa a significar "tem locação
-- ativa", como o comentário de `vehicle_status` prometia. A promessa é
-- cumprida aqui, e não numa coluna nova nem num gatilho que escreve em
-- `vehicles`: um contador materializado desincroniza e mente justamente no dia
-- em que o gestor confia nele. Encerrar a locação devolve a moto à frota sem
-- ninguém tocar no select.
--
-- É view e não derivação no aplicativo porque a tela filtra, ordena, pagina e
-- conta por situação: fora do banco, "disponíveis" precisaria excluir as
-- alugadas em cada uma dessas quatro consultas, e a ordenação por situação
-- ficaria mentindo.
--
-- `security_invoker` para a view enxergar exatamente o que quem consulta
-- enxerga: as policies de `vehicles`, `rentals` e `tenants` continuam valendo.
create view public.fleet
with (security_invoker = on)
as
select
  v.id,
  v.tenant_id,
  v.plate,
  v.brand,
  v.model,
  v.year,
  v.category,
  case
    when r.id is null then v.status
    else 'reserved'::public.vehicle_status
  end as status,
  v.chassis,
  v.renavam,
  v.color,
  v.mileage,
  v.licensing_due_date,
  v.fipe_value,
  v.weekly_price,
  v.purchase_value,
  v.purchase_date,
  v.notes,
  v.photo_path,
  v.crlv_path,
  v.crv_path,
  v.created_at,
  v.deleted_at
from public.vehicles v
left join public.rentals r
  on r.vehicle_id = v.id and r.ended_on is null;

grant select on public.fleet to authenticated, service_role;
