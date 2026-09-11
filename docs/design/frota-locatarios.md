> Entregue pelo Claude Design em 11/09/2026 e guardado aqui sem edição, salvo
> esta nota e a lista de arquivos no fim. É **base, não contrato**: onde o
> desenho brigar com o que o sistema já faz, com o vocabulário do `CONTEXT.md`
> ou com quem usa, ajuste e diga no PR o que mudou. Isolamento por locadora,
> significado das cores e acessibilidade não se ajustam sem conversa.
>
> Implementado pelas issues #23 a #27.

# Handoff: locmotos — Frota e Locatários

## Overview

Duas telas desktop do sistema de gestão **locmotos** (locadoras de motos): **Frota** (lista de veículos) e **Locatários** (lista de pessoas que alugam). O visual delas é o padrão para os módulos seguintes (Locações, Financeiro). Público: o gestor da locadora, uma pessoa operando de uma mesa, comparando linhas o dia inteiro.

Repositório alvo: `fprado-dev/locmotos` (Next.js App Router + Tailwind v4 + Supabase, fontes Geist/Geist Mono via `next/font`). A rota atual `app/fleet/page.tsx` renderiza uma lista simples; esta entrega a substitui. Não existe módulo de locatários no repo ainda (`Renter` no glossário do `CONTEXT.md`).

## About the Design Files

Os arquivos `.dc.html` deste pacote são **referências de design em HTML** — protótipos que mostram aparência e comportamento. Não são código de produção. A tarefa é **recriar essas telas no ambiente do repositório** (React Server Components + Tailwind), usando os padrões já existentes: `app/ui.ts` (`fieldClass`, `buttonClass`, `STATUS_LABELS`), `modules/fleet` (`daysWithoutRental`, `licensingAlert`, `daysUntilLicensing`, `listVehicles`, `VEHICLES_PER_PAGE`), filtros via query string (GET form), `StatusSelect` e `VehicleForm`.

Vocabulário: siga o `CONTEXT.md`. **"Cliente" é proibido** — a tela se chama **Locatários**. Use _Situação_ (não status/estado), _Dias sem locação_ ("Parada há" na UI), _Restrição_ (não blacklist), _Inadimplência_, _Cobrança_, _Ciclo_.

## Fidelity

**Alta fidelidade.** Cores, tipografia, espaçamentos, raios e estados são finais. Recriar pixel a pixel com Tailwind (valores arbitrários quando a escala não bater). Os dados da Frota são reais (exportados da base); os de Locatários são fictícios.

## Design Tokens

### Tipografia

- Sans: **Geist** 400/500/600 (já em `app/layout.tsx` como `--font-geist-sans`).
- Mono: **Geist Mono** 400/500 — placas, CPF, categoria CNH, campo de busca de placa.
- Números sempre com `font-variant-numeric: tabular-nums` e alinhados à direita.
- Escala: 11px (rótulos de coluna de dados no painel), 12px (cabeçalho de tabela, rótulos de card, notas), 12.5px (chips, rodapé, CPF/placa em tabela), 13px (corpo, inputs, botões), 13.5px (nav da sidebar, parágrafos de modal), 14px (contador da barra de lote), 15px (logo, título de modal/painel), 16px (h2), 20px (h1, `letter-spacing:-0.02em`), 26px (valor dos cards, weight 500, `letter-spacing:-0.02em`, `line-height:1`).

### Cores — tema escuro (padrão)

```
--bg            #0e0e0f   fundo da página
--surface       #151517   sidebar, cards, card da tabela, modais
--surface2      #1b1b1e   cabeçalho/rodapé da tabela, bloco da locadora
--border        #242428   divisórias, bordas de card
--border-strong #34343a   bordas de input/botão secundário, chip ativo
--text          #ececed
--muted         #9a9aa1   texto secundário, cabeçalhos de coluna, nav inativa
--subtle        #5d5d64   placeholder, traço "—", contadores de chip
--hover         #1e1e22   linha sob o cursor, hover de nav/botão ghost
--sel           rgba(226,83,26,.12)   linha selecionada, fundo da barra de lote
--chip          #26262b   nav ativa, chip ativo, avatar, destaque "Parada há"
--green         #3ccb72   disponível / em dia / com locação
--gray          #7c7c84   indisponível / em manutenção / restrição
--red           #d63a31   licenciamento vencido, CNH vencida, atraso (texto #fff)
--red-bg        rgba(214,58,49,.16)
--amber-bg      rgba(245,158,11,.17)  vence em ≤60 d (fundo)
--amber-fg      #f6b63c               vence em ≤60 d (texto)
--accent        #d9501a   botão primário (identidade)
--accent-hover  #e85f27
--accent-active #b8420f
--accent-text   #f07a4a   ícone da nav ativa, links, "Limpar filtros"
--input-bg      #101012
--focus         rgba(233,105,54,.45)  anel de foco (box-shadow 0 0 0 3px)
--scrim         rgba(0,0,0,.6)
--shadow        0 1px 2px rgba(0,0,0,.4)
```

### Cores — tema claro

```
--bg #f3f3f4  --surface #ffffff  --surface2 #fafafa  --border #e5e5e8  --border-strong #cfcfd4
--text #17171a  --muted #67676e  --subtle #a1a1a8  --hover #f4f4f5  --sel rgba(194,65,12,.08)
--chip #ececee  --green #178a45  --gray #8a8a90  --red #cf2a21  --red-bg #fde3e1
--amber-bg #fdebc4  --amber-fg #7a3e00  --accent #c2410c  --accent-hover #a83709
--accent-active #8f2f07  --accent-text #b23a0a  --input-bg #ffffff  --focus rgba(194,65,12,.28)
--scrim rgba(20,20,22,.45)  --shadow 0 1px 2px rgba(16,16,20,.06), 0 0 0 1px rgba(16,16,20,.03)
```

Implementar como variáveis CSS em `globals.css` (`:root` = escuro, `[data-theme="light"]` = claro) e mapear no `@theme inline` do Tailwind v4. O tema é escolhido pelo usuário (botão na sidebar) e deve persistir (cookie ou `localStorage`), não seguir só `prefers-color-scheme`.

### Vocabulário semântico de cor

| Cor              | Frota                                                         | Locatários                      |
| ---------------- | ------------------------------------------------------------- | ------------------------------- |
| vermelho         | licenciamento vencido                                         | CNH vencida · cobrança atrasada |
| âmbar            | licenciamento vence em ≤60 d                                  | CNH vence em ≤60 d              |
| verde            | disponível (ponto cheio) / reservada (anel)                   | em dia · com locação ativa      |
| cinza            | indisponível (ponto cheio) / em manutenção (anel)             | com restrição                   |
| laranja (accent) | **nunca** carrega significado — só identidade e ação primária | idem                            |

Situações são distinguíveis em escala de cinza: **cheio vs. anel** + texto ao lado. Linhas _Indisponível_ (Frota) e _Com restrição_ (Locatários) têm o texto inteiro em `--muted`.

### Espaçamento e forma

- Raios: 6px (badges, avatar-ícone do logo), 8px (inputs, botões, chips, nav, blocos), 10px (cards, card da tabela), 12px (modais), 999px (chips de situação na Frota).
- Alturas: nav 36px · input/botão/chip 34px (36px no painel e nos modais) · cabeçalho da tabela 40px · **linha da tabela 44px** · rodapé da tabela 48px · header da página 64px · sidebar header 64px.
- Padding do conteúdo: `0 32px 24px`. Cards: `16px 18px`. Toolbar da tabela: `14px 16px`. Células: `0 12px` (primeira `0 0 0 18px`, última `0 18px 0 12px`).
- Gaps: cards 12px; grid de cards `repeat(4, minmax(0,1fr))`; margem dos cards `4px 0 16px`.

## Screens / Views

### 1. Frota (`Frota.dc.html`) — 1440×900, fluida até 2560

**Layout:** `display:flex; height:100vh`. Sidebar 232px fixa. `<main>` flex:1, coluna: header → cards → card da tabela (flex:1, `overflow:hidden`, tabela rola dentro).

**Sidebar** (`--surface`, borda direita `--border`):

- Logo: quadrado 24px `--accent` raio 6 com "lm" mono 12px branco + "locmotos" 15px/600.
- Nav (padding `8px 12px`, gap 2): Frota, Locatários, Locações, Financeiro. Item 36px, padding `0 12px`, raio 8, ícone 18px stroke 1.5. Inativo: `--muted`; hover `--hover` + `--text`. Ativo: fundo `--chip`, texto `--text` 500, ícone em `--accent-text`.
- Rodapé (`margin-top:auto; padding:12px`): bloco da locadora (borda `--border`, fundo `--surface2`, raio 8, avatar 28px "FM" em `--chip`, "Fast Motos" 500 + "Locadora" 11px muted); botão **Tema claro/Tema escuro** (ícone: círculo 13px — anel no escuro, cheio no claro); **Sair**. Ambos 34px ghost, hover `--hover`.

**Header (64px):** h1 "Frota" 20px/600 + "20 veículos" muted, alinhados por baseline gap 10. Direita: botão primário **"+ Cadastrar veículo"** 36px, padding `0 16px`, `--accent`, texto #fff 500, raio 8, sombra `--shadow`. Hover `--accent-hover`; pressionado `--accent-active` + `translateY(1px)`.

**Cards (4):** fundo `--surface`, borda `--border`, raio 10, sombra. Rótulo 12px muted → valor 26px → nota 12px muted (margin-top 8 cada).

1. Total de motos — 20 — "13 nesta página"
2. Disponíveis — ponto verde 10px + 9 — "1 reservada · 2 em manutenção"
3. Licenciamento em 60 d — ponto âmbar + 2 — ponto vermelho 8px + "1 vencido"
4. Receita semanal potencial — "R$" 15px muted + 2.921 — "Só motos disponíveis" (soma do R$/semana das disponíveis)

**Toolbar de filtros** (2 linhas, gap 12, borda inferior):

- Linha 1: busca de placa 220px (ícone lupa 14px à esquerda, mono, `text-transform:uppercase`, placeholder "Buscar placa"); selects Marca (130px: Honda, Yamaha), Modelo (150px: Biz 125, CG 160, CG 160 Start, Factor 150, XRE 190), Ano (96px: 2026…2020). Select sem valor mostra o rótulo em `--muted`; com valor, `--text`. Quando há filtro: link-botão "Limpar filtros" em `--accent-text`.
- Linha 2: chips de Situação (pill 30px, borda `--border`, 12.5px, gap 6): **Todas 13** · ●Disponível 9 · ○Reservada 1 · ○Em manutenção 2 · ●Indisponível 1. Ponto 8px (cheio ou anel 2px). Ativo: fundo `--chip`, borda `--border-strong`, texto `--text` 500. Contador em `--subtle` tabular.
- Filtros vão para a URL (`?plate=&brand=&model=&year=&status=`) como já faz `page.tsx`; chips e selects podem submeter no change.

**Barra de lote** (substitui a toolbar quando ≥1 linha marcada; mesma altura 98px; fundo `--sel`): "N motos selecionadas" 14px/500 · divisor 1×22 · "Mudar situação" + select (Escolher…/Disponível/Reservada/Em manutenção/Indisponível — aplica ao mudar) · botão **Excluir** secundário (hover: borda e texto `--red`) · "Limpar seleção" ghost à direita.

**Tabela** (`table-layout:fixed; min-width:1100px; width:100%`; abaixo disso rola horizontal):

| Col           | Largura | Alinh. | Conteúdo                                                                                                                                                                    |
| ------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ☐             | 48      | —      | checkbox 15px `accent-color: --accent`                                                                                                                                      |
| Placa         | 118     | esq    | Geist Mono 13px, `letter-spacing:.02em`                                                                                                                                     |
| Veículo       | auto    | esq    | círculo 12px na cor da moto (borda `--border-strong`, `title` = nome da cor) + marca em `--muted` + modelo 500; `text-overflow:ellipsis`                                    |
| Ano           | 72      | dir    | muted, tabular                                                                                                                                                              |
| Km            | 104     | dir    | pt-BR "30.000"                                                                                                                                                              |
| R$/semana     | 116     | dir    | inteiro                                                                                                                                                                     |
| Situação      | 164     | esq    | ponto 9px (cheio/anel) + rótulo                                                                                                                                             |
| Parada há     | 112     | dir    | "34 d". **> 30 d** (limiar tweakável): weight 600, fundo `--chip`, padding `3px 8px`, raio 6. ≤ 30: `--muted`                                                               |
| Licenciamento | 190     | esq    | vencido: badge `--red`/#fff 600 12px "Vencido há 218 d"; ≤60 d: badge `--amber-bg`/`--amber-fg` 500 "Vence em 31 d"; sem data: "—" em `--subtle`. Padding `4px 9px`, raio 6 |

Cabeçalho: sticky, fundo `--surface2`, 40px, 12px/500 `--muted`; toda coluna é botão de ordenação (ativa: texto `--text` + seta ↑/↓ em um span de 10px; hover `--text`). Ordem inicial: **Parada há ↓**. Clique alterna desc→asc.
Linha: 44px, borda inferior `--border`, `cursor:pointer`. Hover `--hover`; selecionada `--sel`. Célula do checkbox não propaga o clique. Clique na linha → `/fleet/[id]`.
Cores das motos: Vinho #6b1e2e · Preta #1c1c1e · Vermelha #d12b2b · Azul #2457c5 · Branca #f2f2f2.

**Rodapé (48px, `--surface2`):** "1–13 de 20" à esquerda; direita ‹ (desabilitado, `--subtle`) "Página 1 de 2" › (30px, borda `--border-strong`, fundo `--surface`).

**Painel "Cadastrar veículo"** (overlay `--scrim`, aside 440px à direita, `--surface`, sombra `-24px 0 60px rgba(0,0,0,.35)`): header 64px com título 16px/600 e ×; grid 2 colunas gap `16px 12px`, padding 24: Placa (largura total, mono, uppercase), Marca, Modelo, Ano, Cor, Km (dir), R$/semana (dir), Situação (select), Vencimento do licenciamento (dd/mm/aaaa), Documentos (CRLV) — dropzone 84px tracejada (hover borda `--accent`). Rodapé: Cancelar (secundário) + **Salvar veículo** (primário). Mapear para `VehicleForm` + `createVehicle`/`attachVehicleFile`.

**Modal "Excluir N motos?"** (420px, raio 12, padding 24): texto "As motos saem da frota, mas o histórico de locações fica guardado. Dá para restaurar depois." Cancelar + **Excluir** (`--red`, #fff). Soft delete (`removeVehicle`).

### 2. Locatários (`Locatarios.dc.html`)

Mesma casca (sidebar, header, cards, card da tabela, rodapé). Diferenças:

**Header:** "Locatários" + "20 pessoas"; primário "+ Cadastrar locatário".

**Cards:** Total de locatários 20 ("13 nesta página") · ●verde Com locação ativa 9 ("4 sem locação") · ●vermelho Inadimplentes 4 ("R$ X em aberto" = Σ ciclos atrasados × R$/semana) · ●cinza Com restrição 2 ("Impedidos de abrir nova locação").

**Toolbar (1 linha, 63px):** busca 280px "Buscar por nome ou CPF" (busca por nome ou dígitos do CPF) · divisor · chips 34px raio 8: Todos 13 · Com locação 9 · Sem locação 4 · "Limpar" quando filtrando.

**Barra de lote:** "N locatários selecionados" · **Aplicar restrição** · **Exportar** · **Excluir** (hover vermelho) · "Limpar seleção".

**Tabela** (`min-width:1140px`):

| Col                                                                                       | Largura  | Conteúdo                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ☐                                                                                         | 48       |                                                                                                                                                       |
| Nome                                                                                      | auto     | avatar 26px `--chip` com iniciais (10.5px/600 muted) + nome 500, ellipsis. Ordenável; **ordem inicial A–Z**                                           |
| CPF                                                                                       | 128      | mono 12.5px muted, **parcial** "•••.218.904-31" (LGPD)                                                                                                |
| WhatsApp                                                                                  | 160      | "(11) 98231-0475" tabular + botão 22px com ícone balão (borda `--border`, hover borda/ícone `--accent`) abrindo `wa.me` — não propaga clique da linha |
| CNH                                                                                       | 150      | categoria mono ("A"/"AB") + badge: vencida → vermelho "Vencida há 37 d"; ≤60 d → âmbar "Vence em 22 d"; senão nada. Ordenável por dias                |
| Locação atual                                                                             | 118      | placa mono 12.5px ou "—" `--subtle`. Ordenável                                                                                                        |
| Financeiro                                                                                | 132      | sem locação "—"; em dia: ponto verde 9px + "Em dia"; atraso: badge vermelho "Atrasado 23 d". Ordenável por dias                                       |
| Restrição                                                                                 | 98       | badge `--chip` + borda `--border-strong` "Restrito", ou "—". Ordenável                                                                                |
| Desde                                                                                     | 100, dir | "mar 2025" muted. Ordenável                                                                                                                           |
| Linha com restrição: texto inteiro em `--muted`. Linha aberta no painel: fundo `--hover`. |

**Painel de detalhe** (clique na linha; aside 460px): header com avatar 36px, nome 16px/600, "Locatário desde 10 de março de 2025", ×. Corpo (gap 22, padding `20px 24px 24px`):

1. Bloco de restrição (se houver): fundo `--surface2`, borda `--border-strong`, ponto cinza + "Com restrição — não pode abrir nova locação" 600, motivo em muted, "Gestor · Fast Motos · 12/08/2026" em `--subtle`.
2. **Dados pessoais e CNH** (h3 12px/500 uppercase `.05em` muted): grid 2 col — CPF (mono), WhatsApp, Categoria CNH (mono), Validade CNH (data + badge).
3. **Locação atual**: cartão com header `--surface2` (placa mono 500 + veículo muted · à direita o sinal financeiro) e grid 3 col: Semana "R$ 340", Início, Fidelidade "12 meses". Sem locação: caixa tracejada "Sem locação no momento."
4. **Cobranças em aberto** (só se atraso > 0): uma linha por ciclo semanal vencido — "Ciclo dd/mm – dd/mm", "venceu dd/mm/aaaa", badge vermelho "23 d", valor 500; rodapé "Total em aberto" 600.
5. **Histórico de locações**: grid `96px 1fr auto` — placa mono, período muted, "21 sem."
   Rodapé: **Editar cadastro** (secundário) · **Nova locação** (primário; desabilitar quando há restrição).

**Modal "Aplicar restrição a N locatários"** (460px): texto "Impede nova locação até ser removida. Motivo e responsável ficam registrados." · textarea Motivo (3 linhas, placeholder "Ex.: inadimplência acima de 30 dias") · input Responsável readonly "Gestor · Fast Motos" (fundo `--surface2`, texto muted) · Cancelar + **Aplicar restrição** (primário; desabilitado com `opacity:.5` até o motivo ter ≥4 caracteres).

**Modal "Excluir N locatários?"**: "O cadastro sai da lista, mas as locações e cobranças ligadas a ele ficam guardadas."

## Interactions & Behavior

- **Estados interativos** (todos desenhados): linha hover `--hover`; selecionada `--sel`; input focus borda `--accent` + `box-shadow 0 0 0 3px --focus` (sem outline); primário hover/active como acima; secundário hover `--hover`; Excluir hover vira vermelho; chip hover borda `--border-strong` + texto `--text`; nav hover `--hover`.
- Sem animações além das transições de hover padrão do navegador. Overlays aparecem sem transição.
- Checkbox do cabeçalho seleciona/desmarca todas as linhas **visíveis** (pós-filtro).
- Chips e selects filtram no change; contadores dos chips refletem os outros filtros já aplicados.
- Selecionar ≥1 linha troca a toolbar pela barra de lote (mesma altura — nada pula).
- Tema: botão alterna `data-theme` na raiz; padrão escuro; persistir.
- Responsivo: sidebar fixa; conteúdo ocupa toda a largura restante; tabela `width:100%` com `min-width` → rola horizontalmente só abaixo de ~1360px de viewport. Coluna auto (Veículo / Nome) absorve o excedente em 2560px.
- Textos de erro/vazio: reaproveitar os de `page.tsx` ("Nenhum veículo encontrado com esse filtro." / "Nenhum veículo cadastrado.").

## State Management

Frota: `filters {plate, brand, model, year, status}` (URL) · `sort {key, dir}` (URL, default `idle desc`) · `selected: Set<id>` (cliente) · `panelOpen` · `modalOpen` · `theme`.
Locatários: `filters {q, rental: ''|'with'|'without'}` · `sort` (default `name asc`) · `selected` · `openId` (painel) · `restrictOpen` + `restrictReason` · `modalOpen` · `theme`.
Derivados na leitura, nunca gravados: dias sem locação, dias até licenciamento/CNH, dias de atraso, totais dos cards.
Ações servidor (Frota): `setVehicleStatus` em lote, `removeVehicle` em lote (soft delete), `createVehicle`. Locatários: criar entidade `Renter` + `Restriction {reason, createdBy, createdAt}` conforme glossário; exportar CSV.

## Dados de referência (Frota — reais)

ABC1D23 Honda CG 160 Start 2022 Vinho 30.000 km R$320 Em manutenção · 34 d · Vencido há 218 d
OAS2D81 Yamaha Factor 150 2024 Preta 21.661 R$208 Disponível · 47 d · Vence em 31 d
BVB0A96 Honda Biz 125 2021 Vermelha 41.317 R$312 Disponível · 63 d · Vence em 50 d
IQQ8O38 Honda Biz 125 2022 Preta 38.283 R$182 Indisponível · 92 d
LDH4T02 Honda CG 160 2024 Azul 46.532 R$389 Reservada · 1 d
XQH4Y94 Yamaha Factor 150 2023 Preta 5.836 R$180 Em manutenção · 12 d
FGU0H10 Honda XRE 190 2023 Branca 687 R$248 Disponível · 3 d
VAV7Z87 Honda XRE 190 2025 Preta 34.708 R$196 Disponível · 8 d
PPQ4P08 Honda Biz 125 2024 Vermelha 34.527 R$386 Disponível · 2 d
ALX2E94 Yamaha Factor 150 2020 Azul 49.686 R$438 Disponível · 26 d
UPP3I17 Honda CG 160 2020 Vermelha 29.412 R$382 Disponível · 5 d
FEZ7U07 Honda CG 160 2024 Preta 22.422 R$360 Disponível · 19 d
EJB1X24 Honda XRE 190 2026 Azul 47.874 R$391 Disponível · 0 d
Rodapé: 1–13 de 20. Os 13 locatários em `Locatarios.dc.html` (array `DATA` no script) são fictícios.

## Assets

Sem imagens. Ícones são SVGs geométricos inline (16×16 viewBox, stroke 1.5–1.6, `currentColor`): frota (duas rodas + linha), locatários (cabeça + ombros), locações (retângulo com linha), financeiro (círculo com traço), sair (porta + seta), lupa, balão do WhatsApp. Substituir por um set consistente (ex.: Lucide `bike`, `users`, `file-text`, `circle-dollar-sign`, `log-out`, `search`, `message-circle`) mantendo 18px na nav e 14px nos inputs.

## Files

- `frota.dc.html` — tela de Frota (template + lógica de filtro/ordenação/seleção; tweaks: tema inicial, mostrar cards, limiar de "Parada há").
- `locatarios.dc.html` — tela de Locatários (painel de detalhe, restrição em lote).
- `support.js` — runtime dos protótipos. Não é código do produto; existe para os dois arquivos acima abrirem no navegador.

Abrir um protótipo: `open docs/design/frota.dc.html`.

A versão descartada (`Frota v1.dc.html`) ficou de fora.
