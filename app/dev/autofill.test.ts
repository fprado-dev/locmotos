import { describe, expect, it } from "vitest";
import { MAX_AMOUNT, optionalNumber, requiredField } from "@/lib/form";
import { fakeValue, KNOWN_FIELDS } from "./autofill";

const CURRENT_YEAR = new Date().getFullYear();

/** O formulário como ele chega da tela: um FormData com tudo preenchido. */
function filledForm(): FormData {
  const form = new FormData();
  for (const name of KNOWN_FIELDS) form.set(name, fakeValue(name, "text"));

  return form;
}

describe("preenchimento de formulário em desenvolvimento", () => {
  it("gera valor que a validação de lib/form aceita", () => {
    const form = filledForm();

    // `optionalNumber` lança em valor fora da faixa da coluna: as chamadas
    // abaixo são a validação de verdade, com os mesmos tetos que a Server
    // Action do cadastro usa.
    expect(
      optionalNumber(form, "mileage", "Quilometragem", {
        max: 9_999_999,
        integer: true,
      }),
    ).toBeGreaterThan(0);
    for (const money of ["weeklyPrice", "fipeValue", "purchaseValue"]) {
      expect(
        optionalNumber(form, money, money, { max: MAX_AMOUNT }),
      ).toBeGreaterThan(0);
    }

    expect(requiredField(form, "plate", "Placa")).toMatch(
      /^[A-Z]{3}\d[A-Z]\d{2}$/,
    );
    expect(requiredField(form, "chassis", "Chassi")).toHaveLength(17);
    expect(requiredField(form, "renavam", "Renavam")).toMatch(/^\d{11}$/);

    const year = Number(requiredField(form, "year", "Ano"));
    expect(year).toBeGreaterThanOrEqual(1900);
    expect(year).toBeLessThanOrEqual(CURRENT_YEAR + 1);

    for (const date of ["licensingDueDate", "purchaseDate"]) {
      expect(requiredField(form, date, date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gera uma placa diferente a cada clique", () => {
    // Placa é única dentro da locadora: repetir o valor faria o segundo
    // cadastro ser recusado em vez de testar o que se queria testar.
    const plates = new Set(
      Array.from({ length: 20 }, () => fakeValue("plate", "text")),
    );

    expect(plates.size).toBeGreaterThan(18);
  });

  it("cai no tipo do input quando não conhece o campo", () => {
    expect(Number(fakeValue("qualquerCoisa", "number"))).toBeGreaterThan(0);
    expect(fakeValue("qualquerCoisa", "date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fakeValue("qualquerCoisa", "email")).toMatch(/^[^@]+@[^@]+$/);
    expect(fakeValue("qualquerCoisa", "text")).not.toBe("");
  });
});
