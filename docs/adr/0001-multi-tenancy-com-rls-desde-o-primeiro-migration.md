# Multi-tenancy com RLS desde o primeiro migration

O locmotos tem hoje **uma única locadora cliente**, que financiou o desenvolvimento sem reter a propriedade do código — ou seja, o produto será vendido a outras locadoras. Toda tabela nasce com `tenant_id` e política de Row Level Security no Supabase já no migration `0001`, e o sistema tem três escopos de acesso (operador do SaaS → todas as locadoras; gestor → a sua; locatário → sua locação), mesmo que só o segundo tenha usuário real hoje.

A alternativa era construir monousuário e generalizar depois. Rejeitada porque, com Supabase, isolar por tenant custa uma coluna e uma policy agora, contra uma reescrita de banco e uma auditoria de vazamento de dados depois.

## Consequências

Toda query passa pela policy de RLS: um `select` que esquece o contexto do tenant retorna vazio, não retorna dados de outra locadora. Isso é intencional e deve ser preservado — qualquer uso de service-role key que contorne RLS precisa ser justificado explicitamente.

Uma locadora **não tem filiais**. Se isso mudar, o isolamento deixa de ser `tenant_id` e passa a `tenant_id` + `unit_id`, o que afeta todas as policies.
