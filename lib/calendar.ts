/**
 * Contas de dia de calendário.
 *
 * Todo prazo do produto — licenciamento, CNH, dias parada, atraso de cobrança —
 * é dia de calendário, não intervalo de 24 horas: "vence hoje" e "venceu
 * ontem" são respostas sobre a folhinha da parede. Fazer isso com `Date` sem
 * cuidado erra por fuso: no Brasil, meia-noite UTC é ontem às 21h.
 */

const MS_PER_DAY = 86_400_000;

/** O dia de um instante, como número, na hora local de quem lê a tela. */
export function calendarDay(moment: Date): number {
  return Math.floor(
    Date.UTC(moment.getFullYear(), moment.getMonth(), moment.getDate()) /
      MS_PER_DAY,
  );
}

/**
 * O dia de uma data do Postgres, que chega como "YYYY-MM-DD".
 *
 * É dia de calendário, não instante: passar isso por `new Date()` reintroduz o
 * fuso que `calendarDay` acabou de tirar.
 */
export function calendarDayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * Quantos dias se passaram desde a data. Zero é hoje.
 *
 * É `daysUntil` do avesso, e não `-daysUntil(...)`: negar zero em JavaScript dá
 * `-0`, que atravessa a tela como "0" mas quebra qualquer comparação estrita.
 */
export function daysSinceDay(date: string, today = new Date()): number {
  return calendarDay(today) - calendarDayOf(date);
}

/** Quantos dias faltam para a data. Negativo já passou. */
export function daysUntil(date: string, today = new Date()): number {
  return calendarDayOf(date) - calendarDay(today);
}

/**
 * Um dia de calendário no formato do Postgres, "YYYY-MM-DD".
 *
 * É o que leva um corte de prazo para dentro da consulta sem repetir a regra
 * em SQL: quem sabe o que é "vence em 60 dias" continua sendo o módulo.
 */
export function isoDay(from: Date, plusDays = 0): string {
  const dia = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  dia.setDate(dia.getDate() + plusDays);

  return [
    dia.getFullYear(),
    String(dia.getMonth() + 1).padStart(2, "0"),
    String(dia.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * A mesma data, N meses depois — "YYYY-MM-DD" entra, "YYYY-MM-DD" sai.
 *
 * É o que transforma fidelidade em meses numa data: 13/09/2026 mais 12 meses é
 * 13/09/2027, e é contra essa data que se pergunta se um encerramento foi
 * antecipado.
 *
 * O dia é cortado para o fim do mês quando não existe lá: 31 de janeiro mais
 * um mês é 28 de fevereiro, não 3 de março. Sem o corte, uma locação aberta
 * dia 31 teria a fidelidade terminando no mês seguinte ao combinado.
 */
export function isoMonthsAfter(date: string, months: number): string {
  const [ano, mês, dia] = date.split("-").map(Number);

  const alvo = new Date(ano, mês - 1 + months, 1);
  // Dia 0 do mês seguinte é o último dia deste.
  const último = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(dia, último));

  return isoDay(alvo);
}

/**
 * O que o gestor digitou num `<input type="datetime-local">`, como instante.
 *
 * "2026-09-14T14:30" não tem fuso dentro, e é justamente por isso que ele não
 * pode ir cru para `new Date()`: no servidor isso seria 14h30 **em UTC**, que
 * é 11h30 em Brasília. Três horas de diferença bastam para uma infração
 * atravessar a meia-noite e mudar de dono.
 *
 * O que está escrito na notificação é hora de Brasília, então é assim que se
 * lê o que foi digitado — e é o mesmo fuso que o banco usa para decidir de
 * quem era a moto naquele dia.
 *
 * ponytail: `-03:00` fixo. O Brasil não tem horário de verão desde 2019; uma
 * data anterior a isso cairia uma hora fora. Se um dia precisar valer para
 * 2018, trocar por `Intl.DateTimeFormat` com `timeZoneName: "longOffset"`.
 */
export function brasiliaMoment(local: string): string {
  // "2026-09-14T14:30" ou "2026-09-14T14:30:00" — o input varia com o browser.
  const completo = local.length === 16 ? `${local}:00` : local;
  const instante = new Date(`${completo}-03:00`);

  if (Number.isNaN(instante.getTime())) {
    throw new RangeError(`Instante inválido: ${local}`);
  }

  return instante.toISOString();
}
