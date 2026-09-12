import type { VehicleStatus } from "@/modules/fleet";

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

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Número inteiro em pt-BR: 30.000, não 30,000. */
export function formatInteger(value: number): string {
  return integer.format(value);
}
