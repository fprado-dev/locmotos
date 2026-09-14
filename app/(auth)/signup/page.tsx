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
import { signUp } from "../actions";

/** O que deu errado, em português — o mesmo mapa que o login tem. */
const ERROS: Record<string, string> = {
  envio:
    "Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.",
};

export default async function SignUpPage({
  searchParams,
}: PageProps<"/signup">) {
  const { enviado, erro } = await searchParams;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Cadastrar locadora</CardTitle>
        <CardDescription>
          A locadora nasce junto com o seu acesso. Os dados dela ficam
          invisíveis para qualquer outra.
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
          <form action={signUp} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tenantName">Nome da locadora</Label>
              <Input
                id="tenantName"
                name="tenantName"
                placeholder="Fast Motos"
                required
              />
            </div>
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
              Criar minha locadora
            </Button>
          </form>
        )}

        <Link
          href="/login"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Já tenho cadastro
        </Link>
      </CardContent>
    </Card>
  );
}
