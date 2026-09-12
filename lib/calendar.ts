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

/** Quantos dias faltam para a data. Negativo já passou. */
export function daysUntil(date: string, today = new Date()): number {
  return calendarDayOf(date) - calendarDay(today);
}

/** Quantos dias se passaram desde o instante. */
export function daysSince(moment: string, today = new Date()): number {
  return calendarDay(today) - calendarDay(new Date(moment));
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
