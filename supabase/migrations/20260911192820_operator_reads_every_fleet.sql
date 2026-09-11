-- O operador do SaaS enxerga a frota de qualquer locadora, para investigar
-- quando um gestor relata problema.
--
-- É o terceiro escopo previsto no docs/adr/0001, e o único que atravessa a
-- fronteira entre locadoras. Por isso ele é de LEITURA e mais nada: as policies
-- de insert e update continuam exigindo a locadora do JWT, então nem o operador
-- escreve na frota alheia.

-- Quem é operador está escrito no JWT, como o tenant.
--
-- `app_metadata` porque `user_metadata` é editável pelo próprio usuário — um
-- gestor que pudesse se declarar operador leria a frota dos concorrentes.
-- Não há cadastro de operador pela aplicação: o claim é posto à mão, com a
-- service-role key, por quem opera o produto.
create or replace function public.is_operator()
returns boolean
language sql
stable
-- search_path vazio: função usada em policy não resolve nome por caminho que o
-- chamador controla.
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_operator')::boolean,
    false
  );
$$;

-- Policies de um mesmo comando se somam: esta abre a leitura para o operador
-- sem tocar na que restringe o gestor à locadora dele.
create policy vehicles_select_operator
  on public.vehicles
  for select
  to authenticated
  using ((select public.is_operator()));

-- Para a frota alheia fazer sentido na tela, o operador precisa saber de quem
-- ela é. Leitura, também.
create policy tenants_select_operator
  on public.tenants
  for select
  to authenticated
  using ((select public.is_operator()));
