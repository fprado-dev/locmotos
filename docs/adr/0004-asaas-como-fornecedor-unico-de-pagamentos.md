# Asaas como fornecedor único de pagamentos

Quando a cobrança for automatizada (v2), o **Asaas** atende as duas frentes: a cobrança semanal que a locadora faz do locatário, e a assinatura que a locadora paga ao locmotos.

## Considered Options

**Stripe** tem DX incomparavelmente melhor: SDK TypeScript oficial, webhooks assinados, test mode, CLI. Foi rejeitado por dois motivos: **não emite NFS-e nem ajuda a emitir** — e um SaaS B2B brasileiro emite nota para cada locadora todo mês; e o PIX só é liberado por convite. Iugu não publica preço e exige PJ. Vindi cobra piso de R$ 299/mês. Pagar.me omite taxa de boleto e saque na própria página de preços.

O Asaas resolve num fornecedor só: zero mensalidade, PIX e boleto a R$ 1,99, **NFS-e nativa a R$ 0,49**, split nativo, e sandbox com cadastro aceito até como CPF.

## Consequências

**Não existe SDK JavaScript/TypeScript oficial** — a documentação do próprio Asaas manda usar REST direto. A integração será um cliente HTTP escrito à mão, com tipos e tratamento de erro por nossa conta. Esse é o preço aceito da decisão; SDKs de comunidade não devem ser adotados sem avaliar manutenção.
