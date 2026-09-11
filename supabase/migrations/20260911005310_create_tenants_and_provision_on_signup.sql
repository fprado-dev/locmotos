-- Locadora: a fronteira de isolamento de dados do sistema.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

create policy tenants_select_own
  on public.tenants
  for select
  to authenticated
  using (id = (select public.current_tenant_id()));

-- Veículo órfão de locadora não existe: some junto com ela.
alter table public.vehicles
  add constraint vehicles_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

-- No cadastro, a Locadora nasce junto com o gestor.
--
-- Isto vive no banco, e não numa Server Action, porque gravar em `app_metadata`
-- exige privilégio que a aplicação não tem — e não deve ter (docs/adr/0001): se
-- a aplicação pudesse escolher o `tenant_id` de alguém, o isolamento entre
-- locadoras seria convenção, não garantia.
create function public.provision_tenant_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant_name text := trim(new.raw_user_meta_data ->> 'tenant_name');
  provisioned_tenant_id uuid;
begin
  -- Usuário criado por outro caminho (harness de teste, convite no futuro) já
  -- chega com a locadora dele decidida; aqui não se mexe.
  if tenant_name is null
     or tenant_name = ''
     or coalesce(new.raw_app_meta_data, '{}'::jsonb) ? 'tenant_id' then
    return new;
  end if;

  insert into public.tenants (name)
  values (tenant_name)
  returning id into provisioned_tenant_id;

  -- `app_metadata`, nunca `user_metadata`: o segundo é editável pelo próprio
  -- usuário, e este claim decide o que ele enxerga.
  update auth.users
     set raw_app_meta_data =
           coalesce(raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('tenant_id', provisioned_tenant_id)
   where id = new.id;

  return new;
end;
$$;

-- Função de trigger não é endpoint: roda como definer, e ninguém deve poder
-- chamá-la via /rest/v1/rpc.
revoke execute on function public.provision_tenant_for_new_user() from public, anon, authenticated;

create trigger provision_tenant_on_signup
  after insert on auth.users
  for each row
  execute function public.provision_tenant_for_new_user();
