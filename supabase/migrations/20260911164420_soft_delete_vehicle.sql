-- Baixa de veículo é soft delete.
--
-- Uma moto vendida some da lista, mas a linha fica: Locações e Finanças vão
-- referenciar esse veículo depois, e apagar a linha levaria o histórico junto.
alter table public.vehicles add column deleted_at timestamptz;

-- A placa volta a ficar livre quando a moto sai da frota.
--
-- O índice único de antes valia para a tabela inteira, o que impediria
-- recadastrar uma moto que foi dada como baixa por engano. A unicidade é entre
-- veículos ativos da locadora, não entre tudo que já passou por ela.
drop index public.vehicles_tenant_plate_key;

create unique index vehicles_tenant_plate_key
  on public.vehicles (tenant_id, upper(btrim(plate)))
  where deleted_at is null;
