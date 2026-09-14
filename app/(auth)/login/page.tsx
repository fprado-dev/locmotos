import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "../actions";

/**
 * O que deu errado, em português.
 *
 * Um mapa e não um `if`: cada motivo que a Server Action sabe devolver precisa
 * ter frase, senão a pessoa fica olhando para uma tela que não explica nada.
 */
const ERROS: Record<string, string> = {
  link: "Esse link não vale mais. Peça outro abaixo.",
  "sem-conta":
    "Não há conta com esse e-mail. Cadastre a sua locadora para começar.",
  envio:
    "Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { enviado, erro } = await searchParams;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Entrar</CardTitle>
        <CardDescription>
          O acesso é por link no e-mail — não há senha para esquecer.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {typeof erro === "string" && ERROS[erro] && (
          <p role="alert" className="text-sm text-destructive">
            {ERROS[erro]}
          </p>
        )}

        {enviado ? (
          <p className="text-sm text-muted-foreground">
            Enviamos um link para o seu e-mail. Abra no mesmo navegador em que
            pediu.
          </p>
        ) : (
          <form action={signIn} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="seu@email.com"
                required
              />
            </div>
            <Button type="submit" size="lg">
              Receber link de acesso
            </Button>
          </form>
        )}

        <Link
          href="/signup"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Ainda não tenho locadora cadastrada
        </Link>
      </CardContent>
    </Card>
  );
}
