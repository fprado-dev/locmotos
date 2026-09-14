import type { DiscardReason, VehicleStatus } from "@/modules/fleet";
import type { ExpenseCategory } from "@/modules/finance";
import type { IncidentKind } from "@/modules/rentals";

/**
 * O nome de cada situação na tela.
 *
 * Vocabulário de interface, não de banco — e um só, para a lista e o filtro
 * não divergirem.
 */
export const STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Disponível",
  reserved: "Reservada",
  maintenance: "Em manutenção",
  unavailable: "Indisponível",
};

/**
 * As cores que o cadastro oferece, na ordem em que as mostra.
 *
 * São as da frota de referência, e o nome é o que vai para o banco: a coluna é
 * texto livre, e escolher de uma lista é o que mantém "Preta" e "preto" de
 * virarem duas cores diferentes na lista.
 */
export const VEHICLE_COLORS = [
  { name: "Vinho", hex: "#6b1e2e" },
  { name: "Preta", hex: "#1c1c1e" },
  { name: "Vermelha", hex: "#d12b2b" },
  { name: "Azul", hex: "#2457c5" },
  { name: "Branca", hex: "#f2f2f2" },
] as const;

/**
 * A cor da moto virando cor na tela.
 *
 * A coluna é texto livre e já tem anos de digitação dentro: o mapa cobre as
 * duas formas de cada nome, e o que não estiver nele vira um neutro. O nome
 * guardado continua aparecendo no `title` do ponto — a cor é reforço, não a
 * informação.
 */
const HEX_BY_NAME: Record<string, string> = {
  vinho: "#6b1e2e",
  preta: "#1c1c1e",
  preto: "#1c1c1e",
  vermelha: "#d12b2b",
  vermelho: "#d12b2b",
  azul: "#2457c5",
  branca: "#f2f2f2",
  branco: "#f2f2f2",
};

export function vehicleColor(color: string | null): string {
  const nome = color
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  return (nome && HEX_BY_NAME[nome]) || "var(--subtle)";
}

/**
 * O nome de cada categoria de despesa na tela.
 *
 * Vocabulário de interface, não de banco — e um só, para o formulário e o
 * resumo por categoria não divergirem.
 */
export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  maintenance: "Manutenção",
  licensing: "Licenciamento",
  insurance: "Seguro",
  fine: "Multa",
  fuel: "Combustível",
  other: "Outros",
};

/**
 * O nome de cada tipo de sinistro na tela.
 *
 * Furto e roubo aparecem separados porque são coisas diferentes para a
 * seguradora — e porque o gestor que digita já sabe qual dos dois foi.
 */
export const INCIDENT_LABELS: Record<IncidentKind, string> = {
  damage: "Batida",
  theft: "Furto",
  robbery: "Roubo",
  total_loss: "Perda total",
};

/**
 * Por que a moto saiu da frota, em palavras.
 *
 * A ficha de uma moto baixada precisa dizer isso: sem o motivo, daqui a um ano
 * a linha só conta que ela sumiu.
 */
export const DISCARD_LABELS: Record<DiscardReason, string> = {
  sold: "Vendida",
  total_loss: "Perda total",
  stolen: "Roubada ou furtada",
  other: "Outro motivo",
};

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Número inteiro em pt-BR: 30.000, não 30,000. */
export function formatInteger(value: number): string {
  return integer.format(value);
}

const cents = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Valor em reais: sem perder centavo, e sem inventar zero onde não há.
 *
 * `formatInteger` não serve para dinheiro desde que a última semana de uma
 * locação passou a ser rateada: R$ 128,57 virava "R$ 129" na tela, e número de
 * dinheiro que não bate com o do banco é o tipo de erro que o gestor descobre
 * discutindo com o locatário.
 *
 * Ou zero casas ou duas, nunca uma: R$ 128,50 é "128,50" e não "128,5". Quem
 * decide é o valor — a maioria dos preços é redonda, e "R$ 300,00" em toda
 * linha da lista é ruído que não diz nada.
 */
export function formatMoney(value: number): string {
  return Number.isInteger(value) ? integer.format(value) : cents.format(value);
}

/** As iniciais de um nome, para o avatar que substitui a foto que não há. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palavra) => palavra[0] ?? "")
    .join("")
    .toUpperCase();
}

const monthYear = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
});

const fullDate = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * "mar 2025", de um instante do banco.
 *
 * O pt-BR escreve "mar. de 2025"; a coluna tem 110px e o "de" não informa
 * nada que o mês e o ano lado a lado já não digam.
 */
export function formatMonthYear(moment: string): string {
  return monthYear.format(new Date(moment)).replace(/\.?\s+de\s+/, " ");
}

const monthName = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

/** "setembro de 2026", de um mês escrito como "2026-09". */
export function formatMonth(month: string): string {
  const [ano, mês] = month.split("-").map(Number);
  return monthName.format(new Date(ano, mês - 1, 1));
}

/** "10 de março de 2025", de um instante do banco. */
export function formatFullDate(moment: string): string {
  return fullDate.format(new Date(moment));
}

/**
 * "15/07/2026", de uma data do Postgres — que chega como "YYYY-MM-DD".
 *
 * Montada dos pedaços e não por `new Date()`: a data é dia de calendário, e
 * `new Date("2026-07-15")` é meia-noite UTC, que no Brasil é 14/07 às 21h.
 * Uma validade de CNH não pode aparecer um dia antes por causa de fuso.
 */
export function formatDay(date: string): string {
  const [ano, mês, dia] = date.split("-");
  return `${dia}/${mês}/${ano}`;
}

const moment = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  // Brasília, e não o relógio de quem abre a tela. A atribuição de uma
  // infração é decidida no banco em dia de Brasília: mostrar a hora do fuso do
  // navegador faria a tela dizer um dia e o sistema usar outro, e é a data que
  // decide de quem é a multa.
  timeZone: "America/Sao_Paulo",
});

/** "14/09/2026 às 14:30", de um instante do banco, em hora de Brasília. */
export function formatMoment(instant: string): string {
  return moment.format(new Date(instant)).replace(", ", " às ");
}

/**
 * Como o responsável por uma restrição aparece na tela e fica registrado.
 *
 * Uma frase só, num lugar só: o modal mostra o que vai ser gravado, e quem
 * grava é a Server Action. Duas montagens da mesma frase acabariam divergindo,
 * e aí o campo readonly prometeria um nome e o banco guardaria outro.
 *
 * Não há cadastro de pessoas dentro da locadora ainda — quem opera é o gestor,
 * e o que distingue um registro do outro é a locadora.
 */
export function managerLabel(tenantName: string | null | undefined): string {
  return `Gestor · ${tenantName ?? "locadora"}`;
}

/**
 * O arquivo dá para mostrar na tela, ou só para baixar?
 *
 * Miniatura de PDF o browser não faz sozinho; imagem ele faz. Uma regra só
 * porque a ficha da moto e o contrato da locação fazem a mesma pergunta.
 */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif)$/i;

export function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.test(path);
}

/** A extensão do caminho, para o download sair com nome de arquivo. */
export function extension(path: string): string {
  const match = path.match(/\.[a-z0-9]+$/i);
  return match ? match[0] : "";
}

/**
 * Quanto vale uma URL assinada de arquivo.
 *
 * Cinco minutos: o tempo de olhar a miniatura, decidir e clicar em baixar.
 * Depois disso o endereço não serve para mais ninguém, que é o ponto de ser
 * assinada. Vale para documento de moto e para contrato de locação — é a mesma
 * decisão, e duas cópias dela divergiriam na primeira mudança.
 */
export const FILE_SECONDS = 300;
