-- Frota: veículos com isolamento por locadora.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001): não
-- existe janela em que a tabela exista sem isolamento. Este arquivo é o molde
-- que os próximos migrations do módulo copiam.

-- A locadora do usuário logado, lida do JWT.
--
-- `tenant_id` vive em `app_metadata` porque `user_metadata` é editável pelo
-- próprio usuário — usá-lo para autorização seria deixar cada gestor escolher
-- de que locadora quer ver os dados.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
-- search_path vazio: uma função usada em policy não pode resolver nomes por
-- um search_path que o chamador controla.
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
$$;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação: um bug no código não
  -- consegue gravar veículo na locadora errada.
  tenant_id uuid not null default public.current_tenant_id(),
  plate text not null,
  brand text not null,
  model text not null,
  year smallint not null,
  created_at timestamptz not null default now()
);

-- Toda query passa pelo filtro de tenant_id; sem índice, todo select vira seq scan.
create index vehicles_tenant_id_idx on public.vehicles (tenant_id);

alter table public.vehicles enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy vehicles_select_own_tenant
  on public.vehicles
  for select
  to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy vehicles_insert_own_tenant
  on public.vehicles
  for insert
  to authenticated
  with check (tenant_id = (select public.current_tenant_id()));
