/**
 * A casca de quem ainda não entrou.
 *
 * Aqui não há sidebar — não há módulo para navegar antes de existir sessão.
 * O cartão fica centralizado de propósito: é a única tela do sistema sem
 * tabela para comparar, e um formulário de dois campos esticado em 2560px
 * seria pior.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary font-mono text-[12px] text-primary-foreground">
          lm
        </span>
        <span className="text-[15px] font-semibold">locmotos</span>
      </div>
      {children}
    </div>
  );
}
