import Link from "next/link";
import { buttonClass, fieldClass } from "@/app/ui";
import { signUp } from "../actions";

export default async function SignUpPage({
  searchParams,
}: PageProps<"/signup">) {
  const { enviado } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Cadastrar locadora</h1>

      {enviado ? (
        <p>
          Enviamos um link para o seu e-mail. Abra no mesmo navegador em que
          pediu.
        </p>
      ) : (
        <form action={signUp} className="flex flex-col gap-3">
          <input
            name="tenantName"
            placeholder="Nome da locadora"
            className={fieldClass}
            required
          />
          <input
            name="email"
            type="email"
            placeholder="seu@email.com"
            className={fieldClass}
            required
          />
          <button type="submit" className={buttonClass}>
            Criar minha locadora
          </button>
        </form>
      )}

      <Link href="/login" className="text-zinc-500 underline">
        Já tenho cadastro
      </Link>
    </main>
  );
}
