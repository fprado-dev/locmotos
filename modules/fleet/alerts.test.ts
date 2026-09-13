import { describe, expect, it } from "vitest";
import {
  daysUntilLicensing,
  daysWithoutRental,
  licensingAlert,
  LICENSING_WARNING_DAYS,
} from "./index";

// Os dois valores são derivados em leitura, então o teste controla o "hoje" em
// vez de esperar o calendário passar. Meio-dia de propósito: a hora não pode
// mudar a resposta.
const hoje = new Date("2026-09-11T12:00:00-03:00");

describe("dias sem locação", () => {
  // O argumento é o `idleSince` da moto: a data da última devolução, ou a do
  // cadastro para quem nunca foi alugada. Quem escolhe entre as duas é a view
  // `fleet`; aqui só se prova a conta.
  it("conta a partir do dia em que a moto ficou parada", () => {
    expect(daysWithoutRental("2026-08-12", hoje)).toBe(30);
  });

  it("é zero no próprio dia", () => {
    expect(daysWithoutRental("2026-09-11", hoje)).toBe(0);
  });

  it("conta dia de calendário, não vinte e quatro horas", () => {
    // Devolvida ontem no fim do dia: são poucas horas, mas é um dia parada. E
    // a data não passa por `new Date()`, onde meia-noite UTC seria anteontem.
    expect(daysWithoutRental("2026-09-10", hoje)).toBe(1);
  });
});

describe("aviso de licenciamento", () => {
  it("cala quando o vencimento está longe", () => {
    expect(licensingAlert("2026-12-31", hoje)).toBeNull();
  });

  it("cala quando não há data registrada", () => {
    expect(licensingAlert(null, hoje)).toBeNull();
  });

  it("avisa dentro da janela de 60 dias", () => {
    expect(licensingAlert("2026-10-15", hoje)).toBe("due-soon");
  });

  it("avisa no último dia da janela, e não no primeiro fora dela", () => {
    // O corte é onde um `<` no lugar de `<=` apareceria.
    const ultimoDia = "2026-11-10"; // 60 dias depois de 11/09
    const primeiroForaDaJanela = "2026-11-11";

    expect(daysUntilLicensing(ultimoDia, hoje)).toBe(LICENSING_WARNING_DAYS);
    expect(licensingAlert(ultimoDia, hoje)).toBe("due-soon");
    expect(licensingAlert(primeiroForaDaJanela, hoje)).toBeNull();
  });

  it("ainda avisa no dia do vencimento, sem chamar de vencido", () => {
    expect(licensingAlert("2026-09-11", hoje)).toBe("due-soon");
    expect(daysUntilLicensing("2026-09-11", hoje)).toBe(0);
  });

  it("continua avisando depois de vencido", () => {
    // Multa não deixa de existir por o prazo ter passado.
    expect(licensingAlert("2026-09-10", hoje)).toBe("overdue");
    expect(licensingAlert("2025-01-01", hoje)).toBe("overdue");
  });
});
