# Repo único com fronteiras enforçadas por ferramenta

O locmotos é **uma aplicação Next.js em repositório único**, organizada em `modules/`, com `dependency-cruiser` impedindo que um módulo importe as entranhas de outro.

Outro projeto da casa (`bugsniff`) é monorepo com pnpm workspaces, e seria o padrão óbvio a copiar. Foi rejeitado: lá existem pacotes com ciclo de vida e versionamento próprios, aqui há uma aplicação, um deploy e um desenvolvedor. O custo do workspace não se paga.

O que **é** copiado do bugsniff é a disciplina, não a estrutura: Prettier, husky + lint-staged, vitest e verificação de fronteiras entram no primeiro commit de código, não depois — padrão de código se enforça por ferramenta, não por documento.
