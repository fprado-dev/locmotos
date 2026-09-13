-- O gerador precisa rodar, e quem o roda é o banco.
--
-- Um ciclo nasce sozinho, todo dia, sem ninguém abrir o sistema: é o que
-- separa "cobrança gravada" de "cobrança que alguém lembrou de gerar". Fica no
-- `pg_cron` e não numa rota do aplicativo porque não depende de requisição
-- nenhuma — e uma locadora que ficou a semana inteira sem abrir a tela precisa
-- encontrar as cobranças da semana quando voltar.
create extension if not exists pg_cron with schema pg_cron;

-- 06:00 UTC é 03:00 em Brasília: o dia virou na folhinha de quem opera, e
-- ninguém está olhando a tela. Rodar de novo no mesmo dia não cobra duas
-- vezes — a idempotência é do índice único, não do horário.
select cron.schedule(
  'generate-charges',
  '0 6 * * *',
  $$select public.generate_charges()$$
);
