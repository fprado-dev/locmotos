import { describe, expect, it } from "vitest";
import {
  formatDay,
  formatInteger,
  formatMoney,
  formatMonthYear,
  initials,
} from "./ui";

describe("datas na tela", () => {
  it("mostra o dia que está no banco, sem o fuso mexer nele", () => {
    // `new Date("2026-07-15")` é meia-noite UTC, que no Brasil é 14/07 às 21h:
    // uma validade de CNH apareceria um dia antes do que está registrado.
    expect(formatDay("2026-07-15")).toBe("15/07/2026");
    expect(formatDay("2026-01-01")).toBe("01/01/2026");
  });

  it("resume um instante em mês e ano, sem o 'de' do pt-BR", () => {
    expect(formatMonthYear("2025-03-10T14:00:00-03:00")).toBe("mar 2025");
  });
});

describe("iniciais", () => {
  it("pega as duas primeiras palavras", () => {
    expect(initials("Ana Ribeiro Souza")).toBe("AR");
    expect(initials("Ana")).toBe("A");
  });

  it("aguenta espaço sobrando sem virar traço", () => {
    expect(initials("  Bruno   Salles ")).toBe("BS");
  });
});

describe("números", () => {
  it("escreve inteiro em pt-BR", () => {
    expect(formatInteger(30_000)).toBe("30.000");
  });

  it("dinheiro não perde centavo", () => {
    // O rateio da última semana criou centavos que o negócio não tinha:
    // arredondar aqui faria a tela discordar do banco.
    expect(formatMoney(128.57)).toBe("128,57");
    expect(formatMoney(1_128.57)).toBe("1.128,57");
  });

  it("dinheiro não inventa centavo: ou zero casas ou duas, nunca uma", () => {
    expect(formatMoney(300)).toBe("300");
    expect(formatMoney(128.5)).toBe("128,50");
  });

  it("a sobra de ponto flutuante de uma soma não vira casa a mais", () => {
    expect(formatMoney(0.1 + 0.2)).toBe("0,30");
    expect(formatMoney(128.57 + 257.14)).toBe("385,71");
  });
});
