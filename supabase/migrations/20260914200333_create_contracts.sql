-- O contrato: o papel assinado que dá evidência jurídica a uma locação.
-- Escopo decidido nas issues #63 e #73.
--
-- Uma por locação, garantido por índice único. Trocar o arquivo **substitui**
-- o que existe: contrato reassinado por erro de cláusula precisa de conserto,
-- e dois contratos na mesma locação não teriam qual vale.
--
-- Versionar os anteriores ficou fora: guardar histórico de papel é decisão de
-- arquivo morto, e o produto ainda não tem essa pergunta.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001).

-- Bucket privado, como o dos documentos da moto: contrato não tem URL pública
-- nem por engano. O acesso é sempre por URL assinada de vida curta.
--
-- Bucket próprio e não o `vehicle-files`: o caminho lá começa por
-- `<locadora>/<moto>/`, e contrato é da locação. Um nome que mente sobre o que
-- guarda custa mais tarde do que as seis linhas que ele economiza hoje.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rental-files',
  'rental-files',
  false,
  10485760, -- 10 MB: contrato escaneado ou foto do papel cabem com folga
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- O caminho começa pela locadora — `<tenant_id>/<rental_id>/...` — e é essa
-- primeira pasta que a policy compara com o JWT. A garantia mora no banco, não
-- no código que monta o caminho.
create policy rental_files_select_own_tenant
  on storage.objects for select to authenticated
  using (
    bucket_id = 'rental-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy rental_files_insert_own_tenant
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rental-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy rental_files_update_own_tenant
  on storage.objects for update to authenticated
  using (
    bucket_id = 'rental-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy rental_files_delete_own_tenant
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'rental-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  rental_id uuid not null,
  -- Caminho no bucket privado, não URL: quem serve o arquivo é a URL assinada.
  file_path text not null,
  -- A data da assinatura, que **não** é a data do upload: o papel costuma ser
  -- digitalizado dias depois, e é a assinatura que vale numa discussão.
  signed_on date not null,
  -- Quem anexou esta versão, e quando. Substituir o arquivo troca os dois:
  -- quem substitui passa a assinar o registro.
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint contracts_file_path_not_blank check (btrim(file_path) <> ''),
  -- Assinar antes de a locação existir é data digitada errado.
  constraint contracts_rental_fkey
    foreign key (rental_id, tenant_id)
    references public.rentals (id, tenant_id) on delete cascade
);

-- Uma por locação. Garantia do banco, e não `if` na aplicação: é ela que faz
-- "o contrato desta locação" ser uma pergunta com resposta única.
create unique index contracts_rental_key on public.contracts (rental_id);

create index contracts_tenant_id_idx on public.contracts (tenant_id);

alter table public.contracts enable row level security;

create policy contracts_select_own_tenant
  on public.contracts for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy contracts_insert_own_tenant
  on public.contracts for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy contracts_update_own_tenant
  on public.contracts for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy contracts_delete_own_tenant
  on public.contracts for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy contracts_select_operator
  on public.contracts for select to authenticated
  using ((select public.is_operator()));

-- "Sem contrato" é a **ausência de linha**, e não uma coluna `has_contract`
-- que alguém esqueceria de atualizar — a mesma forma de "em aberto" para
-- cobrança. A data da assinatura entra na view para virar recorte da lista sem
-- uma segunda consulta por linha.
create or replace view public.rental_details
with (security_invoker = on)
as
 SELECT r.id,
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
    p.name AS renter_name,
    COALESCE(f.overdue_amount, 0::numeric) AS overdue_amount,
    f.overdue_since,
    r.ended_early,
    r.weeks_remaining,
    r.early_termination_fee,
    r.deposit_discount,
    r.deposit_discount_reason,
    r.deposit_returned,
    k.signed_on AS contract_signed_on
   FROM rentals r
     JOIN vehicles v ON v.id = r.vehicle_id
     JOIN renters p ON p.id = r.renter_id
     LEFT JOIN LATERAL ( SELECT sum(c.amount) AS overdue_amount,
            min(c.due_on) AS overdue_since
           FROM charges c
          WHERE c.rental_id = r.id AND c.due_on < today_br() AND NOT (EXISTS ( SELECT 1
                   FROM payments pg
                  WHERE pg.charge_id = c.id AND pg.reversed_at IS NULL))) f ON true
     LEFT JOIN contracts k ON k.rental_id = r.id;
