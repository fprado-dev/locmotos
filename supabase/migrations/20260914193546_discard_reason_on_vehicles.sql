-- A baixa passa a ter motivo, e o sinistro é um deles. Issue #72.
--
-- Hoje a moto some da lista e não diz por quê: registrar o sinistro e dar
-- baixa eram dois atos desconectados. Daqui a um ano, "cadê a ABC1D23" não
-- tem resposta.
--
-- O motivo mora na moto e não no sinistro porque nem toda baixa vem de
-- sinistro: vender a moto é o caso mais comum, e não há nada para apontar.
alter table public.vehicles
  add column discard_reason text
    constraint vehicles_discard_reason_valid
    check (discard_reason in ('sold', 'total_loss', 'stolen', 'other')),
  -- O sinistro que originou a baixa, quando houve um. `on delete set null`:
  -- apagar um sinistro digitado na placa errada não pode ressuscitar a moto
  -- nem derrubar a linha dela — a baixa continua, sem o link.
  add column discard_incident_id uuid
    references public.incidents (id) on delete set null,
  -- Motivo sem baixa é lixo de formulário; baixa sem motivo é o que já existe
  -- no banco hoje e continua válido — a coluna nasce nula nas antigas.
  add constraint vehicles_discard_reason_needs_discard
    check (discard_reason is null or deleted_at is not null);

comment on column public.vehicles.discard_reason is
  'Por que a moto saiu da frota. Nulo nas baixas anteriores a esta coluna.';

-- A ficha de uma moto com baixa precisa dizer o motivo, então as duas colunas
-- entram na view. `create or replace` não reordena nem apaga colunas: as novas
-- vão para o fim.
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
  v.revision_interval_km,
  greatest(
    coalesce(v.mileage, 0),
    coalesce(i.last_odometer, 0),
    coalesce(k.last_odometer, 0)
  ) as current_km,
  coalesce(k.preventive_odometer, v.mileage, 0)
    + coalesce(v.revision_interval_km, t.revision_interval_km)
    as next_revision_km,
  v.discard_reason,
  v.discard_incident_id
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
