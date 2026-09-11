import Link from "next/link";
import { buttonClass, fieldClass } from "@/app/ui";
import { signIn } from "../actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { enviado, erro } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Entrar</h1>

      {erro && (
        <p className="text-red-600">
          Esse link não vale mais. Peça outro abaixo.
        </p>
      )}

      {enviado ? (
        <p>
          Enviamos um link para o seu e-mail. Abra no mesmo navegador em que
          pediu.
        </p>
      ) : (
        <form action={signIn} className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            placeholder="seu@email.com"
            className={fieldClass}
            required
          />
          <button type="submit" className={buttonClass}>
            Receber link de acesso
          </button>
        </form>
      )}

      <Link href="/signup" className="text-zinc-500 underline">
        Ainda não tenho locadora cadastrada
      </Link>
    </main>
  );
}
