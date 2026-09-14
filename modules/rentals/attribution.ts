/**
 * De quem era a moto quando aconteceu.
 *
 * A pergunta é a mesma para a infração e para o sinistro, e a resposta também:
 * a locação já diz de quando até quando, e gravar o nome junto do fato criaria
 * duas verdades que divergem no dia em que alguém corrigir a data de início de
 * uma locação. Quem resolve é o banco — `public.rental_at`, em dia de Brasília
 * —, e as views entregam as quatro colunas que este arquivo interpreta.
 *
 * Duas cópias de uma regra de borda divergem na primeira correção, e por isso
 * a função é uma só dos dois lados: no SQL e aqui.
 */

/** As quatro colunas que toda view de atribuição devolve. */
export type AttributionReading = {
  /** Quantas locações continham o dia do fato. */
  rentalMatches: number;
  rentalId: string | null;
  renterId: string | null;
  renterName: string | null;
};

/**
 * De quem é.
 *
 * Três respostas, e a terceira é o ponto: locação tem data com granularidade
 * de **dia**, então moto devolvida de manhã e alugada de novo à tarde deixa o
 * dia com dois donos possíveis. É raro, e é exatamente o caso em que nomear
 * alguém com cara de certeza é pior que dizer que não dá para saber.
 */
export type Attribution =
  | { kind: "renter"; rentalId: string; renterId: string; name: string }
  | { kind: "owner" }
  | { kind: "ambiguous"; matches: number };

export function whoHadIt(reading: AttributionReading): Attribution {
  const { rentalMatches, rentalId, renterId, renterName } = reading;

  if (rentalMatches === 0) return { kind: "owner" };

  // O banco só nomeia quando não há empate; o `if` acima e este são a mesma
  // decisão vista de dois lados, e o segundo é o que convence o TypeScript.
  if (rentalMatches > 1 || !rentalId || !renterId || !renterName) {
    return { kind: "ambiguous", matches: rentalMatches };
  }

  return { kind: "renter", rentalId, renterId, name: renterName };
}
