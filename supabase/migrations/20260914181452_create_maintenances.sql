-- A manutenção: o que foi feito na moto, quando, e quanto custou.
--
-- Escopo decidido nas issues #61 e #68. O verbete do `CONTEXT.md` é
-- `Maintenance` — "manutenção", nunca "revisão" ou "ordem de serviço".
--
-- A situação **Em manutenção** existe na frota desde o começo e era uma
-- palavra sem nada atrás: o gestor trocava um select e ninguém sabia o quê,
-- desde quando, em que oficina, nem quanto custou. Com esta tabela o fato
-- passa a existir — e a situação deixa de ser digitada.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001).

create table public.maintenances (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  vehicle_id uuid not null,
  -- Preventiva ou corretiva, e não há terceira. Texto com check e não enum,
  -- como o `moment` da vistoria: um valor novo num enum custa migration só
  -- para ser lido, e esta lista não vai crescer.
  kind text not null,
  entered_on date not null default public.today_br(),
  -- Vazio **é** o estado: a moto está na oficina agora. É daqui que sai "há
  -- quantos dias parada", derivado na leitura como todo prazo deste sistema.
  left_on date,
  -- O que foi feito. Texto livre: peça, serviço e diagnóstico numa locadora de
  -- moto cabem numa frase, e a lista de itens é o que triplicaria a issue.
  description text not null,
  -- Onde. Texto livre e não cadastro de fornecedor — isso é outro problema, e
  -- ninguém pediu.
  workshop text,
  -- A quilometragem na entrada, que é o que dá sentido a "revisão dos 10.000".
  odometer integer,
  -- A nota chega depois do serviço, então o custo nasce vazio e é preenchido
  -- quando ela chega.
  cost numeric(10, 2),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint maintenances_kind_known
    check (kind in ('preventive', 'corrective')),
  constraint maintenances_description_not_blank
    check (btrim(description) <> ''),
  constraint maintenances_workshop_not_blank
    check (workshop is null or btrim(workshop) <> ''),
  constraint maintenances_created_by_not_blank
    check (btrim(created_by_name) <> ''),
  constraint maintenances_cost_positive check (cost is null or cost > 0),
  constraint maintenances_odometer_sane
    check (odometer is null or (odometer >= 0 and odometer <= 999999)),
  -- Sair antes de entrar não é conserto, é digitação errada.
  constraint maintenances_left_after_entered
    check (left_on is null or left_on >= entered_on),
  -- A locadora da manutenção e a da moto são a mesma, garantido pelo banco.
  constraint maintenances_vehicle_fkey
    foreign key (vehicle_id, tenant_id)
    references public.vehicles (id, tenant_id) on delete cascade
);

-- Uma manutenção em aberto por moto. É índice único parcial e não um `if` na
-- aplicação, pelo mesmo motivo de sempre: dois cliques simultâneos atravessam
-- o `if`, e duas manutenções abertas na mesma moto não teriam qual vale — nem
-- qual fechar para devolvê-la à frota.
create unique index maintenances_open_vehicle_key
  on public.maintenances (vehicle_id)
  where left_on is null;

-- Toda query passa pelo filtro de tenant_id; sem índice, todo select vira seq scan.
create index maintenances_tenant_id_idx on public.maintenances (tenant_id);

-- A lista da ficha da moto é por veículo e em ordem de entrada.
create index maintenances_vehicle_idx
  on public.maintenances (vehicle_id, entered_on desc);

alter table public.maintenances enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy maintenances_select_own_tenant
  on public.maintenances for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy maintenances_insert_own_tenant
  on public.maintenances for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy maintenances_update_own_tenant
  on public.maintenances for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- Apagar existe, como na infração e na despesa: a linha nasce de alguém
-- digitando, e manutenção lançada na moto errada é lixo, não história.
create policy maintenances_delete_own_tenant
  on public.maintenances for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- O operador do SaaS lê as manutenções de qualquer locadora, e só lê.
create policy maintenances_select_operator
  on public.maintenances for select to authenticated
  using ((select public.is_operator()));

-- A situação "em manutenção" passa a ser derivada, como "reservada" já era.
--
-- Era a última das quatro que ainda se digitava sem nenhum fato atrás. Agora
-- ela significa exatamente uma coisa: **existe manutenção em aberto nesta
-- moto**. Abrir a ordem de serviço tira a moto da frota; fechá-la a devolve.
--
-- A ordem do `case` importa: locação ganha de manutenção. As duas não deveriam
-- coexistir — o módulo recusa abrir manutenção de moto alugada —, mas se um
-- dia coexistirem, a moto que está na rua com o locatário é o fato mais
-- verdadeiro dos dois.
--
-- Moto que já estava com `status = 'maintenance'` gravado e nenhuma linha de
-- manutenção continua aparecendo em manutenção, pelo `else v.status`. O
-- migration não inventa uma ordem de serviço para ela: inventar um motivo e
-- uma data seria pior que a lacuna, e o primeiro registro regulariza.
create or replace view public.fleet
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
    when r.id is not null then 'reserved'::public.vehicle_status
    when m.id is not null then 'maintenance'::public.vehicle_status
    else v.status
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
  v.deleted_at,
  greatest(v.created_at::date, d.last_ended_on) as idle_since
from public.vehicles v
left join public.rentals r
  on r.vehicle_id = v.id and r.ended_on is null
-- No máximo uma, garantido pelo índice único parcial: a junção não multiplica
-- linha de moto.
left join public.maintenances m
  on m.vehicle_id = v.id and m.left_on is null
left join lateral (
  select max(anterior.ended_on) as last_ended_on
  from public.rentals anterior
  where anterior.vehicle_id = v.id and anterior.ended_on is not null
) d on true;
