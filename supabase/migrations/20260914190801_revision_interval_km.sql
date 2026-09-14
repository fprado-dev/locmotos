-- Revisão preventiva é por quilômetro, e o sistema já tem os quilômetros:
-- o cadastro guarda um, a vistoria de devolução anota outro a cada locação e
-- a ordem de serviço anota o da entrada. Faltava cruzar os três.
--
-- O intervalo é da locadora, com exceção por moto: a frota inteira costuma
-- seguir um número só, e a moto que foge dele é a exceção que se digita.
alter table public.tenants
  add column revision_interval_km integer not null default 5000
    constraint tenants_revision_interval_positive
    check (revision_interval_km > 0);

alter table public.vehicles
  add column revision_interval_km integer
    constraint vehicles_revision_interval_positive
    check (revision_interval_km is null or revision_interval_km > 0);

comment on column public.vehicles.revision_interval_km is
  'Nulo herda o intervalo da locadora. Não existe coluna "próxima revisão": ela é derivada na view fleet.';

-- O gestor edita o padrão da própria locadora, e só o nome e o intervalo —
-- a linha não tem mais nada que ele possa mexer.
create policy tenants_update_own on public.tenants
  for update to authenticated
  using (id = (select public.current_tenant_id()))
  with check (id = (select public.current_tenant_id()));

create or replace view public.fleet with (security_invoker = on) as
select v.id, v.tenant_id, v.plate, v.brand, v.model, v.year, v.category,
  case
    when r.id is not null then 'reserved'::public.vehicle_status
    when m.id is not null then 'maintenance'::public.vehicle_status
    else v.status
  end as status,
  v.chassis, v.renavam, v.color, v.mileage, v.licensing_due_date,
  v.fipe_value, v.weekly_price, v.purchase_value, v.purchase_date,
  v.notes, v.photo_path, v.crlv_path, v.crv_path, v.created_at, v.deleted_at,
  greatest(v.created_at::date, d.last_ended_on) as idle_since,
  -- O intervalo que vale para esta moto: o dela, ou o da locadora.
  coalesce(v.revision_interval_km, t.revision_interval_km)
    as revision_interval_km,
  -- A quilometragem de hoje é a maior leitura que alguém anotou: o cadastro,
  -- a última vistoria ou a última passagem pela oficina. `greatest` e não a
  -- mais recente porque odômetro não anda para trás, e a leitura mais alta é
  -- a que está certa mesmo quando alguém digitou a data errada.
  greatest(
    coalesce(v.mileage, 0),
    coalesce(i.last_odometer, 0),
    coalesce(k.last_odometer, 0)
  ) as current_km,
  -- Quilômetro da próxima revisão. Derivado, nunca coluna: guardá-lo criaria
  -- um número que envelhece sozinho e que ninguém recalcula quando o
  -- intervalo muda. Sem preventiva registrada, a conta parte do cadastro —
  -- a moto entrou na frota com X km e a primeira revisão é X + intervalo.
  coalesce(k.preventive_odometer, v.mileage, 0)
    + coalesce(v.revision_interval_km, t.revision_interval_km)
    as next_revision_km
from public.vehicles v
join public.tenants t on t.id = v.tenant_id
left join public.rentals r on r.vehicle_id = v.id and r.ended_on is null
left join public.maintenances m on m.vehicle_id = v.id and m.left_on is null
left join lateral (
  select max(anterior.ended_on) as last_ended_on
  from public.rentals anterior
  where anterior.vehicle_id = v.id and anterior.ended_on is not null
) d on true
left join lateral (
  select max(vistoria.odometer) as last_odometer
  from public.inspections vistoria
  join public.rentals locação on locação.id = vistoria.rental_id
  where locação.vehicle_id = v.id
) i on true
left join lateral (
  select max(ordem.odometer) as last_odometer,
         max(ordem.odometer) filter (where ordem.kind = 'preventive')
           as preventive_odometer
  from public.maintenances ordem
  where ordem.vehicle_id = v.id
) k on true;
