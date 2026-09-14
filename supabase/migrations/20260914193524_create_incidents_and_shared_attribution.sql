-- O sinistro: o fato externo que tira a moto de operação e que não é
-- manutenção. Escopo decidido nas issues #62 e #71.
--
-- Manutenção é intervenção planejada ou conserto de desgaste; sinistro é
-- batida, queda, furto, roubo ou perda total — com data, boletim de ocorrência
-- e, muitas vezes, seguradora. Misturar os dois faria o histórico de uma moto
-- contar duas histórias com o mesmo vocabulário.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001).

-- De quem era a moto num instante, numa função só.
--
-- Esta consulta já existia dentro de `traffic_violation_details`, e o sinistro
-- precisa exatamente dela: a segunda cópia sairia idêntica à primeira, e duas
-- cópias de uma regra de borda divergem no dia em que alguém corrigir uma
-- delas. A issue #71 previu isso e mandou decidir lendo o código — está aqui.
--
-- `stable` e não `security definer`: quem chama é uma view `security_invoker`,
-- e as policies de `rentals` e `renters` continuam valendo para quem perguntou.
--
-- `at time zone 'America/Sao_Paulo'` porque o banco roda em UTC e as datas de
-- locação são dia de folhinha: um evento às 22h de Brasília é 01h do dia
-- seguinte em UTC, e o dia errado troca o dono.
--
-- `matches` existe por causa da borda que não pode mentir: data de locação tem
-- granularidade de **dia**, então moto devolvida de manhã e alugada de novo à
-- tarde gera duas locações que contêm o mesmo dia. Com mais de uma, a função
-- **não escolhe** — devolve os nomes nulos e o contador maior que um, e a tela
-- avisa. Nomear a pessoa errada com cara de certeza é pior que não nomear.
create function public.rental_at(
  p_vehicle_id uuid,
  p_tenant_id uuid,
  p_moment timestamptz
)
returns table (
  matches bigint,
  rental_id uuid,
  renter_id uuid,
  renter_name text
)
language sql
stable
set search_path = ''
as $$
  select
    count(*) as matches,
    -- `array_agg` e não `min` porque em Postgres não existe `min(uuid)`.
    case when count(*) = 1 then (array_agg(r.id))[1] end,
    case when count(*) = 1 then (array_agg(r.renter_id))[1] end,
    case when count(*) = 1 then (array_agg(p.name))[1] end
  from public.rentals r
  join public.renters p on p.id = r.renter_id
  where r.vehicle_id = p_vehicle_id
    and r.tenant_id = p_tenant_id
    and (p_moment at time zone 'America/Sao_Paulo')::date
        between r.started_on and coalesce(r.ended_on, 'infinity'::date);
$$;

comment on function public.rental_at(uuid, uuid, timestamptz) is
  'De quem era a moto neste instante, em dia de Brasília. matches = 0: era da locadora; > 1: duas locações contêm o dia e a função não escolhe.';

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  vehicle_id uuid not null,
  -- Furto e roubo separados porque a locadora e a seguradora os tratam
  -- diferente: um é sem violência, o outro é com, e a apólice sabe a diferença.
  kind text not null,
  -- Instante, e não dia: a hora é o que decide a borda, como na infração. Uma
  -- batida às 23h50 do dia da devolução é de quem estava com a moto.
  occurred_at timestamptz not null,
  description text not null,
  -- O número do B.O., para casar a linha com o papel. Opcional: nem todo
  -- sinistro vira ocorrência, e o número chega dias depois quando vira.
  police_report text,
  -- Texto livre: a lista de seguradoras do Brasil não é nossa para manter.
  insurer text,
  insurer_notified_on date,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint incidents_kind_valid
    check (kind in ('damage', 'theft', 'robbery', 'total_loss')),
  constraint incidents_description_not_blank
    check (btrim(description) <> ''),
  constraint incidents_police_report_not_blank
    check (police_report is null or btrim(police_report) <> ''),
  constraint incidents_insurer_not_blank
    check (insurer is null or btrim(insurer) <> ''),
  -- Aviso à seguradora não acontece antes do sinistro.
  constraint incidents_notified_after_occurred
    check (
      insurer_notified_on is null
      or insurer_notified_on
         >= (occurred_at at time zone 'America/Sao_Paulo')::date
    ),
  -- A locadora do sinistro e a da moto são a mesma, garantido pelo banco.
  constraint incidents_vehicle_fkey
    foreign key (vehicle_id, tenant_id)
    references public.vehicles (id, tenant_id) on delete cascade
);

create index incidents_tenant_id_idx on public.incidents (tenant_id);

-- A lista da ficha da moto é por veículo e em ordem de quando aconteceu.
create index incidents_vehicle_idx
  on public.incidents (vehicle_id, occurred_at desc);

alter table public.incidents enable row level security;

create policy incidents_select_own_tenant
  on public.incidents for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy incidents_insert_own_tenant
  on public.incidents for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy incidents_update_own_tenant
  on public.incidents for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- Como na infração: a linha nasce de alguém digitando, e sinistro na placa
-- errada é lixo, não história.
create policy incidents_delete_own_tenant
  on public.incidents for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy incidents_select_operator
  on public.incidents for select to authenticated
  using ((select public.is_operator()));

-- O sinistro com a moto e com quem estava com ela.
create view public.incident_details
with (security_invoker = on)
as
select
  s.id,
  s.tenant_id,
  s.vehicle_id,
  s.kind,
  s.occurred_at,
  s.description,
  s.police_report,
  s.insurer,
  s.insurer_notified_on,
  s.created_by_name,
  s.created_at,
  v.plate,
  v.brand,
  v.model,
  a.matches as rental_matches,
  a.rental_id,
  a.renter_id,
  a.renter_name
from public.incidents s
join public.vehicles v on v.id = s.vehicle_id
left join lateral public.rental_at(s.vehicle_id, s.tenant_id, s.occurred_at) a
  on true;

grant select on public.incident_details to authenticated, service_role;

comment on view public.incident_details is
  'O sinistro com a moto e com quem estava com ela no dia, em hora de Brasília. rental_matches = 0: a moto estava no pátio; > 1: duas locações contêm o dia e a view não escolhe.';

-- A infração passa a usar a mesma função, em vez da cópia da consulta.
create or replace view public.traffic_violation_details
with (security_invoker = on)
as
select
  t.id,
  t.tenant_id,
  t.vehicle_id,
  t.notice_number,
  t.occurred_at,
  t.description,
  t.amount,
  t.due_on,
  t.created_at,
  v.plate,
  v.brand,
  v.model,
  a.matches as rental_matches,
  a.rental_id,
  a.renter_id,
  a.renter_name
from public.traffic_violations t
join public.vehicles v on v.id = t.vehicle_id
left join lateral public.rental_at(t.vehicle_id, t.tenant_id, t.occurred_at) a
  on true;
