/**
 * Erro já em forma de recado para quem está usando o sistema.
 *
 * Existe para separar o que pode ir para a tela do que não pode: erro do
 * Postgres tem nome de coluna e de constraint dentro, e o gestor não deve
 * receber isso — nem descobrir o schema por mensagem de erro.
 *
 * `field` é o campo do formulário que o recado acusa, quando há um. Com ele a
 * mensagem encosta no campo errado em vez de ficar solta no topo: num painel
 * de treze campos, "valor inválido" no topo não diz qual.
 */
export class UserError extends Error {
  override name = "UserError";

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}
