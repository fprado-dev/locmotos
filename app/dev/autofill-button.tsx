"use client";

import { Button } from "@/components/ui/button";
import { fakeValue } from "./autofill";

/**
 * Botão que preenche o formulário da tela, para não digitar catorze campos a
 * cada teste.
 *
 * Ele mora no rodapé do próprio formulário, e não flutuando num canto: fixo na
 * tela ele cobria ora o "Sair" da sidebar, ora o toast do cadastro que acabou
 * de ser salvo — e quem precisa dele já está olhando para o formulário.
 *
 * Só formulário com `data-autofill` é preenchido. Sem essa marca o botão
 * escreveria na barra de filtros e no formulário de sair junto — um atributo
 * por formulário é mais barato que uma heurística que erra.
 *
 * Em produção o componente sai na primeira linha, e o empacotador elimina o
 * resto como código morto — um botão que injeta dado falso não pode chegar
 * perto de um gestor de verdade. O guarda mora aqui, e não em quem monta, para
 * valer em qualquer tela que venha a usá-lo.
 *
 * Escrever em `input.value` basta porque os formulários daqui são
 * não-controlados (`defaultValue`). Se algum passar a ser controlado por
 * `useState`, o React não fica sabendo da escrita: aí é preciso o setter
 * nativo do protótipo mais um `input` event.
 */
export function AutofillButton() {
  if (process.env.NODE_ENV === "production") return null;

  function fill() {
    const form = document.querySelector<HTMLFormElement>("form[data-autofill]");
    if (!form) return;

    for (const field of form.elements) {
      const fillable =
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement;
      if (!fillable || !field.name || field.disabled) continue;
      // `hidden` carrega escolha da própria tela (a categoria do veículo, por
      // exemplo); sobrescrever seria preencher errado. E campo de arquivo o
      // navegador não deixa preencher de jeito nenhum — escrever nele lança, e
      // a exceção derrubava o preenchimento dos campos seguintes junto.
      if (
        field.type === "hidden" ||
        field.type === "submit" ||
        field.type === "file"
      ) {
        continue;
      }

      // Campo que a pessoa não alcança, o botão também não preenche.
      //
      // O Select do Base UI submete por um `<input>` de texto comum, escondido
      // só por CSS, com `aria-hidden` e `tabIndex -1`. Sem esta guarda o botão
      // escrevia um nome falso onde devia haver uma situação, e o cadastro
      // morria em "Situação inválida" — e só quando o botão era usado, que é o
      // que fazia o erro parecer vir de outro lugar. A regra vale para todo
      // componente da biblioteca que submete assim, não só para este.
      if (field.getAttribute("aria-hidden") === "true" || field.tabIndex < 0) {
        continue;
      }

      if (field instanceof HTMLSelectElement) {
        const option = [...field.options].find((each) => each.value);
        if (option) field.value = option.value;
        continue;
      }

      field.value = fakeValue(field.name, field.type);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={fill}
      aria-label="Preencher o formulário com dados de teste"
      title="Preencher o formulário com dados de teste"
      variant="ghost"
      className="mr-auto text-soon-fg hover:text-soon-fg"
    >
      Preencher
    </Button>
  );
}
