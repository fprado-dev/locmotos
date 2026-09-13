-- O encerramento de uma locação: o que ele precisa deixar registrado.
--
-- São colunas na própria locação e não uma tabela `terminations`: o
-- encerramento é 1 para 1 com a locação e acontece uma vez só. Uma tabela
-- custaria uma junção em toda leitura para guardar o que já é a última página
-- da mesma história.
--
-- `ended_on` já existia desde `create_rentals` — nula é locação ativa. O que
-- entra agora é o resto da conta.

alter table public.rentals
  -- Gravado, e não derivado de `started_on + commitment_months`: a fidelidade
  -- é corrigível, e corrigi-la não pode fazer um encerramento do ano passado
  -- deixar de ter sido antecipado. É o mesmo argumento de `docs/adr/0009`.
  add column ended_early boolean not null default false,
  -- Quantas semanas faltavam para o fim da fidelidade. É o dado que a
  -- penalidade vai precisar no dia em que a regra existir — a lacuna nº 2 do
  -- `CONTEXT.md`, que só o dono da locadora responde. Aqui não se calcula
  -- penalidade nenhuma.
  add column weeks_remaining smallint,
  -- Quanto o gestor cobrou pela rescisão, se cobrou. Opcional e digitado: é o
  -- mais longe que dá para ir sem inventar o número que ninguém decidiu.
  add column early_termination_fee numeric(10, 2),
  -- A conta da caução: o que foi descontado, por quê, e o que voltou.
  add column deposit_discount numeric(10, 2),
  add column deposit_discount_reason text,
  add column deposit_returned numeric(10, 2),
  -- Locação ativa não tem conta de encerramento. Sem isto, um update parcial
  -- deixaria uma locação de pé com caução já devolvida.
  add constraint rentals_closing_only_when_ended check (
    ended_on is not null or (
      ended_early = false
      and weeks_remaining is null
      and early_termination_fee is null
      and deposit_discount is null
      and deposit_discount_reason is null
      and deposit_returned is null
    )
  ),
  -- Antecipado sem saber de quanto não serve para a régua que vem depois.
  add constraint rentals_early_has_weeks
    check (ended_early = false or weeks_remaining is not null),
  -- Desconto sem motivo é dinheiro sumindo da caução sem explicação. É o mesmo
  -- que a restrição exige: quem aplica, registra por quê.
  add constraint rentals_discount_has_reason check (
    coalesce(deposit_discount, 0) = 0
    or btrim(coalesce(deposit_discount_reason, '')) <> ''
  ),
  add constraint rentals_weeks_remaining_not_negative
    check (weeks_remaining is null or weeks_remaining >= 0),
  add constraint rentals_early_fee_not_negative
    check (early_termination_fee is null or early_termination_fee >= 0),
  add constraint rentals_deposit_discount_not_negative
    check (deposit_discount is null or deposit_discount >= 0),
  add constraint rentals_deposit_returned_not_negative
    check (deposit_returned is null or deposit_returned >= 0);

-- A frota passa a saber desde quando cada moto está parada de verdade.
--
-- O `CONTEXT.md` já prometia isto, condicionado a este dia: "Passa a contar da
-- última devolução quando o encerramento de locação existir, e só o argumento
-- muda". Sem a troca, uma moto que voltou ontem apareceria parada desde o
-- cadastro — e "Parada há 400 d" é a mentira mais visível que a tela poderia
-- contar logo depois de alguém devolver a moto.
--
-- `greatest` ignora nulo: moto que nunca foi alugada continua contando do
-- cadastro, que era a regra anterior inteira.
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
    when r.id is null then v.status
    else 'reserved'::public.vehicle_status
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
left join lateral (
  select max(anterior.ended_on) as last_ended_on
  from public.rentals anterior
  where anterior.vehicle_id = v.id and anterior.ended_on is not null
) d on true;

grant select on public.fleet to authenticated, service_role;
