-- `revision_interval_km` na view passa a ser o da **moto** — nulo quando ela
-- herda o da locadora —, e não mais o efetivo já resolvido.
--
-- O motivo é o formulário: a escrita devolve a linha da tabela, onde a coluna
-- é a exceção por moto. Se a view resolvesse o coalesce no mesmo nome, o
-- mesmo campo significaria "o que vale" na leitura e "o que foi digitado" na
-- escrita — e abrir a ficha de uma moto que herda, e salvar, gravaria o
-- padrão da locadora como exceção dela. O efetivo continua existindo onde
-- importa: dentro de `next_revision_km`.
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
