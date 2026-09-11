# Testes rodam contra um projeto Supabase real, não contra instância local

Não há setup de Supabase local neste projeto. A aplicação e a suíte de testes apontam para um projeto Supabase hospedado, com as credenciais em `.env.local`.

A alternativa — `supabase start` com Postgres em container — é o caminho padrão e foi descartada por decisão do desenvolvedor: a máquina de desenvolvimento não tem runtime de container instalado, e manter um seria custo fixo para um projeto de um desenvolvedor só.

## Consequências

**Os testes escrevem num projeto de verdade.** O harness cria usuários via `auth.admin.createUser` e o teste de isolamento do módulo Frota cria duas locadoras com dados. Cada `pnpm test` deixa rastro.

Daí duas regras que não são opcionais:

1. **Nunca apontar a suíte para o projeto de produção.** Use um branch do Supabase, que é um projeto real com as mesmas migrations e dados descartáveis.
2. **O que o teste cria, o teste apaga.** Todo helper que cria entidade devolve um `cleanup`, e o teste é responsável por chamá-lo.

Os testes também ficam mais lentos e dependem de rede — `fileParallelism` está desligado no vitest porque os arquivos compartilham um único banco.

A `SUPABASE_SERVICE_ROLE_KEY` passa a ser necessária para rodar testes. Ela ignora RLS por construção, existe apenas em `.env.local`, não tem prefixo `NEXT_PUBLIC_` e nunca deve chegar ao browser.
