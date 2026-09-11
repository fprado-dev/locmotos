import { redirect } from "next/navigation";

/**
 * A raiz não tem tela própria.
 *
 * Quem tem sessão vai para a frota; quem não tem é mandado ao login pelo
 * proxy, antes de chegar aqui.
 */
export default function Home() {
  redirect("/fleet");
}
