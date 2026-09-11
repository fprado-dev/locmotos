import type { VehicleStatus } from "@/modules/fleet";

export const fieldClass =
  "rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700";

export const buttonClass =
  "rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black";

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
