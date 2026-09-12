-- Locatários: a segunda vertical do produto, com o mesmo isolamento da frota.
--
-- A policy de RLS entra no MESMO migration da tabela (docs/adr/0001): não
-- existe janela em que a tabela exista sem isolamento. O molde é o de
-- `create_vehicles`.

create table public.renters (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido pelo banco, nunca pela aplicação: um bug no código não
  -- consegue cadastrar locatário na locadora errada.
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  name text not null,
  -- Só os onze dígitos. A pontuação é de tela, e guardar "123.456.789-01" ao
  -- lado de "12345678901" faria a mesma pessoa passar duas vezes pela
  -- unicidade — além de quebrar a busca por pedaço do CPF.
  cpf text not null,
  whatsapp text,
  cnh_category text,
  cnh_due_date date,
  notes text,
  created_at timestamptz not null default now(),
  -- Baixa é soft delete, como na frota: o cadastro sai da lista e a linha
  -- fica, porque Locações e Cobranças vão apontar para ela.
  deleted_at timestamptz,
  constraint renters_name_not_blank check (btrim(name) <> ''),
  constraint renters_cpf_digits check (cpf ~ '^[0-9]{11}$'),
  -- Alvo do FK composto de `restrictions`, abaixo. É o que impede uma
  -- restrição de apontar para locatário de outra locadora.
  constraint renters_id_tenant_key unique (id, tenant_id)
);

-- Toda query passa pelo filtro de tenant_id; sem índice, todo select vira seq scan.
create index renters_tenant_id_idx on public.renters (tenant_id);

-- O CPF é único DENTRO da locadora: a mesma pessoa pode alugar de duas
-- locadoras, e cada uma tem direito ao cadastro dela. E a unicidade é entre
-- cadastros ativos — dar baixa por engano não pode impedir o recadastro.
create unique index renters_tenant_cpf_key
  on public.renters (tenant_id, cpf)
  where deleted_at is null;

alter table public.renters enable row level security;

-- `(select ...)` faz o Postgres avaliar a função uma vez por query, não por linha.
create policy renters_select_own_tenant
  on public.renters for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy renters_insert_own_tenant
  on public.renters for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy renters_update_own_tenant
  on public.renters for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- O operador do SaaS lê os locatários de qualquer locadora, como já lê a
-- frota, e só lê: as policies de escrita continuam exigindo a locadora do JWT.
create policy renters_select_operator
  on public.renters for select to authenticated
  using ((select public.is_operator()));

-- A restrição é entidade própria, não um `boolean` no locatário.
--
-- O glossário exige motivo e responsável registrados: é o que a locadora tem
-- para mostrar quando alguém perguntar por que foi impedido de alugar. Um
-- campo ligado e desligado não guarda nada disso, e a segunda restrição
-- apagaria a primeira.
create table public.restrictions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants (id) on delete cascade,
  renter_id uuid not null,
  reason text not null,
  -- Quem aplicou, para auditoria. Sem FK para `auth.users` de propósito: o
  -- registro do que aconteceu não pode sumir porque a conta de quem fez foi
  -- apagada depois.
  created_by uuid not null default auth.uid(),
  -- O nome como estava na hora — a locadora pode ser renomeada, e o que ficou
  -- registrado foi o nome de então.
  created_by_name text not null,
  created_at timestamptz not null default now(),
  -- Levantada, não apagada: "impede nova locação até ser removida" é promessa
  -- de tela, e a remoção também é história.
  lifted_at timestamptz,
  constraint restrictions_reason_min check (length(btrim(reason)) >= 4),
  -- A locadora da restrição e a do locatário são a mesma, garantido pelo
  -- banco. Sem isto, um `renter_id` vindo do browser poderia prender alguém de
  -- outra locadora — a policy só olha o `tenant_id` da própria linha.
  constraint restrictions_renter_fkey
    foreign key (renter_id, tenant_id)
    references public.renters (id, tenant_id) on delete cascade
);

create index restrictions_renter_id_idx on public.restrictions (renter_id);

-- Uma restrição ativa por locatário. Dois cliques no lote não viram duas
-- linhas, e "está restrito?" tem uma resposta só.
create unique index restrictions_active_renter_key
  on public.restrictions (renter_id)
  where lifted_at is null;

alter table public.restrictions enable row level security;

create policy restrictions_select_own_tenant
  on public.restrictions for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy restrictions_insert_own_tenant
  on public.restrictions for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy restrictions_update_own_tenant
  on public.restrictions for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy restrictions_select_operator
  on public.restrictions for select to authenticated
  using ((select public.is_operator()));
