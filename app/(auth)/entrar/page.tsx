import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { confirmAccess } from "./actions";

/**
 * O último passo do link de acesso: um botão.
 *
 * Esta tela existe para **não** gastar o link ao ser aberta. Abrir é o que
 * pré-visualizador de mensagem e prefetch de navegador fazem sozinhos, e o
 * link serve uma vez só: quem abrisse primeiro levava a sessão, e a pessoa
 * chegava num link morto.
 *
 * Aqui a página só mostra; quem gasta é o `POST` da Server Action. O custo é
 * um clique a mais, e ele compra o link chegar vivo em quem foi convidado.
 */
export default async function EntrarPage({
  searchParams,
}: PageProps<"/entrar">) {
  const { token_hash: tokenHash, type } = await searchParams;

  if (typeof tokenHash !== "string" || typeof type !== "string") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Link incompleto</CardTitle>
          <CardDescription>
            Falta a parte do endereço que identifica o acesso. Copie o link
            inteiro, ou peça outro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Ir para o login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Entrar no locmotos</CardTitle>
        <CardDescription>
          Confirme que é você quem está abrindo. O link vale uma vez só, e é
          este botão que o usa.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={confirmAccess} className="flex flex-col gap-3">
          <input type="hidden" name="tokenHash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <Button type="submit" size="lg">
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
