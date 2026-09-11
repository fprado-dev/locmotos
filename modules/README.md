# modules

Código de domínio. Cada subpasta é um módulo com **índice público próprio**.

Regras, enforçadas por `dependency-cruiser` (`pnpm check:boundaries`):

- Um módulo só é importado pelo seu índice — nunca por um arquivo interno.
- O App Router (Server Components, Server Actions) é adaptador fino: chama o
  módulo e não contém regra de negócio.
- Toda função exportada que fala com o Supabase **recebe o client autenticado
  como argumento**. Nenhuma cria o próprio client nem lê de um singleton global.
  É isso que permite ao teste rodar a mesma função como usuários de tenants
  diferentes, e provar o isolamento por RLS (`docs/adr/0001`).
