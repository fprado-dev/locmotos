/**
 * Erro já em forma de recado para quem está usando o sistema.
 *
 * Existe para separar o que pode ir para a tela do que não pode: erro do
 * Postgres tem nome de coluna e de constraint dentro, e o gestor não deve
 * receber isso — nem descobrir o schema por mensagem de erro.
 */
export class UserError extends Error {
  override name = "UserError";
}
