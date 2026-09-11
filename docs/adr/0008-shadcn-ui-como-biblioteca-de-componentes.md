# shadcn/ui como biblioteca de componentes, e nada escrito cru

Todo componente de interface vem do shadcn/ui. O que ele não tiver é **composto a partir dos primitivos dele**, nunca escrito do zero: um `<button>` com classe solta, um `<select>` nativo estilizado à mão, um diálogo feito de `<div>` com `position: fixed` — nenhum dos três volta a existir neste repo.

A alternativa era continuar como estava: Tailwind cru com duas constantes de classe em `app/ui.ts`. Foi descartada porque o custo dela não aparece no primeiro componente, aparece no quinto. Clientes e Locações vão pedir diálogo, combobox, seletor de data e toast, e cada um deles é uma armadilha de acessibilidade — foco preso, `aria-` correto, tecla Esc, leitura por leitor de tela — que já está resolvida nos primitivos.

O shadcn não é dependência que atualiza sozinha: o código dos componentes entra em `components/ui/` e passa a ser nosso. Isso é o que o torna compatível com o `docs/adr/0005` — a fronteira continua sendo enforçada por ferramenta, e não há caixa-preta para auditar.

## Consequências

**A base é Base UI, não Radix.** É o que o CLI instala hoje no estilo `base-nova`. A diferença aparece na API: componentes recebem `render={<Link />}` onde o Radix usava `asChild`, e o `Select` não é um `<select>` nativo — ele renderiza um input escondido para o formulário funcionar.

**O `Select` do shadcn depende de JavaScript.** A barra de filtros da frota é um formulário GET que funcionava sem JS; com o seletor de situação vindo da biblioteca, ela deixa de funcionar. É aceitável numa ferramenta interna atrás de login, e está escrito aqui para ninguém descobrir por acaso.

**O tema é a classe `.dark`, não `data-theme`.** O handoff de design pedia `data-theme`, mas toda variante `dark:` dos componentes do shadcn espera a classe. Inverter a convenção da biblioteca custaria mais que ajustar o documento.

**Os tokens do produto convivem com os do shadcn.** As cores que carregam significado — verde disponível, vermelho vencido, âmbar vencendo, cinza fora de operação — são variáveis próprias em `globals.css`, expostas ao Tailwind pelo `@theme inline`. A laranja de identidade mora em `--primary` e nunca significa estado.
