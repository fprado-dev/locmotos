-- A vistoria: o estado da moto na entrega e na devolução.
--
-- Escopo decidido na issue #47, e o que ela **não** é importa tanto quanto o
-- que ela é: sem foto, não obrigatória para abrir locação, e avaria em texto
-- livre. A comparação item a item entre as duas pontas — retrovisor,
-- carenagem, farol, pneu — é o que triplicaria a issue, e ninguém pediu ainda.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001).

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  rental_id uuid not null,
  -- As duas pontas da locação, e não há terceira: `handover` na entrega,
  -- `return` na devolução. Texto com check em vez de enum porque um enum novo
  -- custa migration para ser lido, e esta lista não vai crescer.
  moment text not null,
  -- Os três dados do verbete, todos opcionais: o gestor anota o que conferiu.
  -- Uma vistoria sem nenhum dos três não é vistoria — é o check lá embaixo.
  odometer integer,
  -- O ponteiro do tanque em quartos, de 0 (vazio) a 4 (cheio). É o que o
  -- gestor lê no painel da moto; litro exigiria bomba, e texto livre viraria
  -- "metade", "1/2" e "meio tanque" na mesma locadora.
  fuel_quarters smallint,
  damages text,
  -- Quem vistoriou, como a restrição e o pagamento guardam quem agiu.
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint inspections_moment_known check (moment in ('handover', 'return')),
  constraint inspections_odometer_sane
    check (odometer is null or (odometer >= 0 and odometer <= 999999)),
  constraint inspections_fuel_range
    check (fuel_quarters is null or fuel_quarters between 0 and 4),
  constraint inspections_damages_not_blank
    check (damages is null or btrim(damages) <> ''),
  constraint inspections_created_by_not_blank check (btrim(created_by_name) <> ''),
  -- Vistoria vazia não é fato nenhum: sem isto, confirmar o formulário em
  -- branco criaria uma linha dizendo que se conferiu a moto e não se viu nada.
  constraint inspections_says_something check (
    odometer is not null or fuel_quarters is not null or damages is not null
  ),
  -- A locadora da vistoria e a da locação são a mesma, garantido pelo banco.
  constraint inspections_rental_fkey
    foreign key (rental_id, tenant_id)
    references public.rentals (id, tenant_id) on delete cascade
);

-- Uma vistoria por ponta. Registrar de novo **corrige** a que existe, e é por
-- isso que é índice único e não um `if` na aplicação: quilometragem digitada
-- errada tem que ter conserto, e duas linhas de entrega não teriam qual vale.
create unique index inspections_rental_moment_key
  on public.inspections (rental_id, moment);

-- Toda query passa pelo filtro de tenant_id; sem índice, todo select vira seq scan.
create index inspections_tenant_id_idx on public.inspections (tenant_id);

alter table public.inspections enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy inspections_select_own_tenant
  on public.inspections for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy inspections_insert_own_tenant
  on public.inspections for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy inspections_update_own_tenant
  on public.inspections for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- O operador do SaaS lê as vistorias de qualquer locadora, como já lê o resto,
-- e só lê. Não há policy de delete, como não há em cobrança e pagamento:
-- vistoria é fato registrado, e corrigir é reescrever a linha, não sumir com ela.
create policy inspections_select_operator
  on public.inspections for select to authenticated
  using ((select public.is_operator()));
