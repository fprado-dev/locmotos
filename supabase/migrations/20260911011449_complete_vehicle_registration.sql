-- O cadastro completo do veículo, além dos quatro campos do tracer bullet.
--
-- Tudo aqui é opcional: o gestor cadastra a moto com o que tem à mão e
-- completa depois. Só placa, marca, modelo e ano são exigidos.
alter table public.vehicles
  add column vin text,                      -- chassi
  add column renavam text,
  add column color text,
  add column mileage integer,               -- quilometragem
  add column licensing_due_on date,         -- vencimento do licenciamento
  add column fipe_value numeric(10, 2),
  add column weekly_rate numeric(10, 2),    -- valor semanal da locação
  add column purchase_value numeric(10, 2),
  add column purchased_on date,
  add column notes text,
  -- A v1 só oferece motos, mas o modelo não presume isso: a interface fixa o
  -- valor, a coluna não.
  add column category text not null default 'motorcycle';

-- Cadastro sem placa não é cadastro. `not null` não basta: string vazia passa.
alter table public.vehicles
  add constraint vehicles_plate_not_blank check (btrim(plate) <> '');

-- Placa é única DENTRO da locadora, não globalmente: a mesma moto pode ser
-- vendida de uma locadora para outra, e as duas têm direito ao histórico dela.
--
-- `upper()` porque a placa é a mesma escrita em qualquer caixa — e assim a
-- garantia vale mesmo para quem escreve no banco sem passar pela aplicação.
create unique index vehicles_tenant_plate_key
  on public.vehicles (tenant_id, upper(plate));

-- Redundante agora: o índice único acima já começa por tenant_id, e é ele que
-- a RLS usa em toda query.
drop index public.vehicles_tenant_id_idx;
