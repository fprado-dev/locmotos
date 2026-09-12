import { describe, expect, it } from "vitest";
import {
  cnhAlert,
  CNH_WARNING_DAYS,
  daysUntilCnh,
  formatCpf,
  formatWhatsapp,
  isCpf,
  maskedCpf,
} from "./index";

// O aviso é derivado em leitura, então o teste controla o "hoje" em vez de
// esperar o calendário passar. Meio-dia de propósito: a hora não pode mudar a
// resposta.
const hoje = new Date("2026-09-11T12:00:00-03:00");

describe("aviso de CNH", () => {
  it("cala quando o vencimento está longe", () => {
    expect(cnhAlert("2026-12-31", hoje)).toBeNull();
  });

  it("cala quando não há CNH registrada", () => {
    expect(cnhAlert(null, hoje)).toBeNull();
  });

  it("avisa dentro da janela de 60 dias", () => {
    expect(cnhAlert("2026-10-15", hoje)).toBe("due-soon");
  });

  it("avisa no último dia da janela, e não no primeiro fora dela", () => {
    // O corte é onde um `<` no lugar de `<=` apareceria.
    const últimoDia = "2026-11-10"; // 60 dias depois de 11/09
    const primeiroForaDaJanela = "2026-11-11";

    expect(daysUntilCnh(últimoDia, hoje)).toBe(CNH_WARNING_DAYS);
    expect(cnhAlert(últimoDia, hoje)).toBe("due-soon");
    expect(cnhAlert(primeiroForaDaJanela, hoje)).toBeNull();
  });

  it("ainda avisa no dia do vencimento, sem chamar de vencida", () => {
    expect(cnhAlert("2026-09-11", hoje)).toBe("due-soon");
    expect(daysUntilCnh("2026-09-11", hoje)).toBe(0);
  });

  it("passa a vencida no dia seguinte, e conta há quantos dias", () => {
    expect(cnhAlert("2026-09-10", hoje)).toBe("overdue");
    expect(daysUntilCnh("2026-09-10", hoje)).toBe(-1);
  });

  it("não muda de resposta por causa do fuso", () => {
    // Meia-noite UTC é ontem às 21h no Brasil. Se a conta fosse por instante,
    // uma CNH que vence hoje apareceria como vencida para quem abre a tela de
    // manhã.
    const cedo = new Date("2026-09-11T07:00:00-03:00");
    const tarde = new Date("2026-09-11T22:00:00-03:00");

    expect(cnhAlert("2026-09-11", cedo)).toBe("due-soon");
    expect(cnhAlert("2026-09-11", tarde)).toBe("due-soon");
  });
});

describe("CPF", () => {
  it("aceita um CPF com os verificadores certos", () => {
    expect(isCpf("529.982.247-25")).toBe(true);
    expect(isCpf("11144477735")).toBe(true);
  });

  it("recusa um dígito trocado", () => {
    // É o erro que mais acontece: copiar do documento e errar um número.
    expect(isCpf("52998224726")).toBe(false);
  });

  it("recusa o que não tem onze dígitos", () => {
    expect(isCpf("5299822472")).toBe(false);
    expect(isCpf("")).toBe(false);
  });

  it("recusa onze dígitos iguais, que passam na conta e não são CPF", () => {
    expect(isCpf("11111111111")).toBe(false);
    expect(isCpf("00000000000")).toBe(false);
  });

  it("esconde só o começo na lista, por LGPD", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(maskedCpf("52998224725")).toBe("•••.982.247-25");
  });
});

describe("WhatsApp", () => {
  it("mostra o número como se disca, celular ou fixo", () => {
    expect(formatWhatsapp("11982310475")).toBe("(11) 98231-0475");
    expect(formatWhatsapp("1132310475")).toBe("(11) 3231-0475");
  });

  it("devolve o que veio quando não reconhece o formato", () => {
    expect(formatWhatsapp(null)).toBeNull();
    expect(formatWhatsapp("123")).toBe("123");
  });
});
