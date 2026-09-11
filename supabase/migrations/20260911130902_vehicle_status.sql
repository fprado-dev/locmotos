-- Em que situação cada veículo está.
--
-- Nesta fatia quem define é o gestor, na mão. Quando o módulo de Locações
-- existir, `reserved` passa a ser derivado de locação ativa — a transição é
-- prevista, e manter a situação numa coluna isolada é o que a torna barata.
create type public.vehicle_status as enum (
  'available',
  'reserved',
  'maintenance',
  'unavailable'
);

-- Veículo recém-cadastrado está disponível: é o estado em que a moto entra na
-- frota, e poupa o gestor de marcar o óbvio em cada cadastro.
alter table public.vehicles
  add column status public.vehicle_status not null default 'available';

-- Até aqui a tabela só aceitava insert e select. Alterar a situação é o
-- primeiro update do módulo, e ele vale para a locadora de quem está logado —
-- `using` escolhe as linhas que a pessoa enxerga, `with check` impede que o
-- update empurre a linha para outra locadora.
create policy vehicles_update_own_tenant
  on public.vehicles
  for update
  to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
