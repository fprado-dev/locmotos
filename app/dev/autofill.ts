/**
 * Valores de mentira para preencher formulário em desenvolvimento.
 *
 * Não é gerador de dado realista: é o suficiente para o formulário passar pela
 * validação e o fluxo rodar. O que importa é o cadastro ser aceito no primeiro
 * envio, sem ninguém corrigir campo na mão.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CURRENT_YEAR = new Date().getFullYear();

function pick<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

function letters(count: number): string {
  return Array.from({ length: count }, () => pick([...LETTERS])).join("");
}

function digits(count: number): string {
  return Array.from({ length: count }, () =>
    Math.floor(Math.random() * 10),
  ).join("");
}

function between(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Data no formato que um `<input type="date">` aceita. */
function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return date.toISOString().slice(0, 10);
}

/**
 * Placa no padrão Mercosul, sorteada a cada chamada.
 *
 * O sorteio não é enfeite: a placa é única dentro da locadora, e um valor fixo
 * faria o segundo clique bater na constraint em vez de cadastrar.
 */
function plate(): string {
  return `${letters(3)}${digits(1)}${letters(1)}${digits(2)}`;
}

/** Campos que o gerador conhece pelo nome. O resto cai no tipo do input. */
const BY_NAME: Record<string, () => string> = {
  plate,
  brand: () => pick(["Honda", "Yamaha", "Suzuki", "Shineray"]),
  model: () => pick(["CG 160", "Factor 150", "Biz 125", "XRE 190"]),
  year: () => String(between(CURRENT_YEAR - 6, CURRENT_YEAR)),
  color: () => pick(["Vermelha", "Preta", "Branca", "Azul"]),
  mileage: () => String(between(500, 60_000)),
  // 17 caracteres, como um chassi de verdade — o formato importa mais que o valor.
  chassis: () => `9C2${letters(2)}${digits(12)}`,
  renavam: () => digits(11),
  licensingDueDate: () => daysFromToday(between(30, 300)),
  purchaseDate: () => daysFromToday(-between(30, 900)),
  weeklyPrice: () => String(between(180, 450)),
  fipeValue: () => String(between(8_000, 25_000)),
  purchaseValue: () => String(between(7_000, 22_000)),
  notes: () => pick(["Baú instalado.", "Revisão feita.", "Pneu novo atrás."]),
};

/** Os nomes de campo que ganham valor de domínio, e não do tipo do input. */
export const KNOWN_FIELDS = Object.keys(BY_NAME);

/** O que escrever num campo, pelo nome dele — ou, na falta, pelo tipo. */
export function fakeValue(name: string, type: string): string {
  const known = BY_NAME[name];
  if (known) return known();

  if (type === "number") return String(between(1, 100));
  if (type === "date") return daysFromToday(0);
  if (type === "email") return `teste-${digits(4)}@locmotos.test`;
  if (type === "tel") return `11${digits(9)}`;

  return `Teste ${digits(3)}`;
}
