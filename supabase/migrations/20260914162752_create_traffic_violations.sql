-- A infração de trânsito: a multa que chega para a locadora com placa e hora.
--
-- Escopo decidido na issue #53. O verbete do `CONTEXT.md` é `TrafficViolation`
-- — "infração", nunca "multa", que no domínio já é a multa por atraso de
-- pagamento.
--
-- A linha é do **veículo**, e não da locação: a notificação chega com a placa,
-- e é só isso que a locadora tem na mão quando abre o envelope. De quem era a
-- moto naquele instante é consulta, não digitação — ver a view mais abaixo.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001).

create table public.traffic_violations (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  vehicle_id uuid not null,
  -- O número do auto: como o gestor casa o papel com a linha. Opcional porque
  -- nem toda notificação o traz legível, e único por locadora quando vem —
  -- registrar o mesmo auto duas vezes é erro de digitação, não dois fatos.
  notice_number text,
  -- Instante, e não dia: a hora é o que decide a borda. Uma multa às 23h50 do
  -- dia da devolução é de quem estava com a moto, e o dia sozinho não sabe.
  occurred_at timestamptz not null,
  -- O que foi. Texto livre de propósito: a tabela de códigos é do Detran, muda
  -- por resolução, e copiá-la para cá seria assumir manutenção que não é nossa.
  description text not null,
  -- Opcionais os dois: a notificação de autuação chega antes do valor
  -- definitivo, e o prazo de indicação do condutor vem na de penalidade.
  amount numeric(10, 2),
  due_on date,
  created_at timestamptz not null default now(),
  constraint traffic_violations_description_not_blank
    check (btrim(description) <> ''),
  constraint traffic_violations_notice_not_blank
    check (notice_number is null or btrim(notice_number) <> ''),
  constraint traffic_violations_amount_positive
    check (amount is null or amount > 0),
  -- A locadora da infração e a da moto são a mesma, garantido pelo banco.
  constraint traffic_violations_vehicle_fkey
    foreign key (vehicle_id, tenant_id)
    references public.vehicles (id, tenant_id) on delete cascade
);

-- Único quando preenchido, e por locadora: duas locadoras podem receber autos
-- de numeração parecida, e o índice parcial deixa vários sem número conviverem.
create unique index traffic_violations_notice_key
  on public.traffic_violations (tenant_id, notice_number)
  where notice_number is not null;

-- Toda query passa pelo filtro de tenant_id; sem índice, todo select vira seq scan.
create index traffic_violations_tenant_id_idx
  on public.traffic_violations (tenant_id);

-- A lista da ficha da moto é por veículo e em ordem de quando aconteceu.
create index traffic_violations_vehicle_idx
  on public.traffic_violations (vehicle_id, occurred_at desc);

alter table public.traffic_violations enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy traffic_violations_select_own_tenant
  on public.traffic_violations for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy traffic_violations_insert_own_tenant
  on public.traffic_violations for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy traffic_violations_update_own_tenant
  on public.traffic_violations for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- Digitar a placa errada e só perceber depois é o erro que esta tela convida a
-- cometer: a linha nasce de um papel, não de um ato do sistema. Por isso aqui
-- há delete, ao contrário de cobrança, pagamento e vistoria — e ele é da
-- própria locadora, nunca do operador.
create policy traffic_violations_delete_own_tenant
  on public.traffic_violations for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- O operador do SaaS lê as infrações de qualquer locadora, como já lê o resto,
-- e só lê.
create policy traffic_violations_select_operator
  on public.traffic_violations for select to authenticated
  using ((select public.is_operator()));

-- A infração com a moto e com quem estava com ela.
--
-- **A atribuição é derivada, e é o ponto inteiro da issue.** Gravar o nome do
-- locatário junto da infração criaria duas verdades que divergem no dia em que
-- alguém corrigir a data de início de uma locação; a locação já diz de quando
-- até quando, e a pergunta "de quem era a moto nesse instante" é uma consulta
-- em cima disso.
--
-- `at time zone 'America/Sao_Paulo'` porque o banco roda em UTC e as datas de
-- locação são dia de folhinha, como o `public.today_br()` já faz: uma multa às
-- 22h de Brasília é 01h do dia seguinte em UTC, e o dia errado troca o dono.
--
-- `rental_matches` existe por causa da borda que não pode mentir: data de
-- locação tem granularidade de **dia**, então moto devolvida de manhã e
-- alugada de novo à tarde gera duas locações que contêm o mesmo dia. Com mais
-- de uma, a view **não escolhe** — devolve o nome nulo e o contador maior que
-- um, e a tela avisa. Nomear a pessoa errada com cara de certeza é pior que
-- não nomear.
--
-- `security_invoker` como `fleet` e `rental_details`: as policies de
-- `traffic_violations`, `vehicles`, `rentals` e `renters` continuam valendo, e
-- o operador continua lendo o que já lia.
create view public.traffic_violation_details
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
  a.rental_matches,
  a.rental_id,
  a.renter_id,
  a.renter_name
from public.traffic_violations t
-- Interna: `vehicle_id` é `not null` e a baixa da moto é soft delete, então
-- moto vendida continua com linha e a infração dela continua sendo história.
join public.vehicles v on v.id = t.vehicle_id
-- `left join lateral` com agregação sempre devolve uma linha, inclusive quando
-- nenhuma locação casou: aí `rental_matches` é 0, que é "a multa é da
-- locadora" — e não um `null` que a tela leria como "não sei".
left join lateral (
  select
    count(*) as rental_matches,
    -- Só nomeia quando não há dúvida. Com duas locações no mesmo dia, escolher
    -- uma das duas seria sorteio disfarçado de resposta. `array_agg` e não
    -- `min` porque em Postgres não existe `min(uuid)`.
    case when count(*) = 1 then (array_agg(r.id))[1] end as rental_id,
    case when count(*) = 1 then (array_agg(r.renter_id))[1] end as renter_id,
    case when count(*) = 1 then (array_agg(p.name))[1] end as renter_name
  from public.rentals r
  join public.renters p on p.id = r.renter_id
  where r.vehicle_id = t.vehicle_id
    and r.tenant_id = t.tenant_id
    and (t.occurred_at at time zone 'America/Sao_Paulo')::date
        between r.started_on and coalesce(r.ended_on, 'infinity'::date)
) a on true;

grant select on public.traffic_violation_details to authenticated, service_role;

comment on view public.traffic_violation_details is
  'A infração com a moto e com quem estava com ela no dia, em hora de Brasília. rental_matches = 0: a multa é da locadora; > 1: duas locações contêm o dia e a view não escolhe.';
