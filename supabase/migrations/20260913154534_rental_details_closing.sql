-- A conta do encerramento entra na view, para o painel poder mostrá-la.
--
-- Uma locação encerrada continua sendo consultada: "quanto devolvemos de
-- caução dela?" é pergunta de meses depois, e sem estas colunas o painel só
-- saberia dizer a data.
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
  f.overdue_since,
  r.ended_early,
  r.weeks_remaining,
  r.early_termination_fee,
  r.deposit_discount,
  r.deposit_discount_reason,
  r.deposit_returned
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
