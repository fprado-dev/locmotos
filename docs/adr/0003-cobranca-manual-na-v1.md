# Cobrança registrada à mão na v1

A v1 **não integra gateway de pagamento**. O gestor registra "recebi do Fulano" e o sistema calcula sozinho quem está em atraso, há quantos dias e quanto deve. A integração com o Asaas (ver ADR-0004) fica para a v2.

O levantamento pedia Asaas com webhooks, cobrança automática e conciliação já de saída. Foi adiado porque o cliente opera hoje **em caderno de papel**: a dor demonstrada é *saber quem não pagou*, não *emitir a cobrança*. Automatizar a emissão antes de haver evidência de que esse é o gargalo é construir a parte cara primeiro.

## Consequências

A régua de inadimplência é lógica própria do sistema desde o dia 1, não um reflexo do estado de um gateway. Quando o Asaas entrar, ele alimenta essa régua — não a substitui.
