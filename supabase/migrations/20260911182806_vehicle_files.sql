-- Foto e documentos do veículo.
--
-- Três anexos conhecidos, três colunas. Uma tabela de arquivos só se paga
-- quando a quantidade é aberta; aqui ela é foto, CRLV e CRV.
alter table public.vehicles
  add column photo_path text,
  add column crlv_path text,
  add column crv_path text;

-- Bucket privado: arquivo de veículo não tem URL pública, nem por engano.
-- O acesso é sempre por URL assinada de vida curta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-files',
  'vehicle-files',
  false,
  10485760, -- 10 MB: foto de celular e CRLV escaneado cabem com folga
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- O isolamento entre locadoras é o mesmo da tabela, e pela mesma razão: a
-- garantia mora no banco, não no código que monta o caminho.
--
-- O caminho do arquivo começa pela locadora — `<tenant_id>/<vehicle_id>/...` —
-- e é essa primeira pasta que a policy compara com o JWT.
create policy vehicle_files_select_own_tenant
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vehicle-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy vehicle_files_insert_own_tenant
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehicle-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy vehicle_files_update_own_tenant
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vehicle-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy vehicle_files_delete_own_tenant
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehicle-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );
