-- A locação com a moto e o locatário resolvidos.
--
-- Mesmo motivo da view `fleet`: a tela de Locações não só mostra a placa e o
-- nome — ela **busca** pelos dois na mesma caixa, ordena por eles e pagina o
-- resultado. Uma condição `or` entre colunas de duas tabelas embutidas não é
-- expressável no PostgREST, e ordenar a lista por uma coluna de embutida
-- tampouco: sem a junção resolvida aqui, a busca teria que ser duas consultas
-- costuradas no aplicativo, e a paginação em cima delas seria chute.
--
-- `security_invoker` para a view enxergar exatamente o que quem consulta
-- enxerga: as policies de `rentals`, `vehicles` e `renters` continuam valendo,
-- e o operador do SaaS continua lendo o que já lia.
--
-- A junção é interna nas duas pontas porque `vehicle_id` e `renter_id` são
-- `not null` e a baixa é soft delete: moto vendida e locatário fora da
-- carteira continuam com linha, e a locação deles continua sendo história.
create view public.rental_details
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
  p.name as renter_name
from public.rentals r
join public.vehicles v on v.id = r.vehicle_id
join public.renters p on p.id = r.renter_id;

grant select on public.rental_details to authenticated, service_role;
