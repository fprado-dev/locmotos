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
 * A cor da moto virando cor na tela.
 *
 * A coluna é texto livre — quem digita é o gestor —, então o mapa cobre o que
 * a frota costuma ter e o resto vira um neutro. O nome digitado continua
 * aparecendo no `title` do ponto: a cor é reforço, não a informação.
 */
const VEHICLE_COLORS: Record<string, string> = {
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

  return (nome && VEHICLE_COLORS[nome]) || "var(--subtle)";
}

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Número inteiro em pt-BR: 30.000, não 30,000. */
export function formatInteger(value: number): string {
  return integer.format(value);
}
