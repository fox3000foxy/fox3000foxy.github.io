---
title: Como este blog funciona?
description: "Os bastidores do blog: React, Vite, Markdown, o pipeline CI/CD
  e o fluxo de redação."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "6O1x1Neor8qLhJFWxwK5SDc5+YduFLWBulZZqwzI8gzSouxa+b5V2+XSgJAI5JWa6MtIt6bRrRxrhO5RZX/fyQ=="
---

# Como Este Blog Funciona?

Você já se perguntou como este blog funciona por baixo dos panos? Neste artigo, vou detalhar toda a arquitetura da aplicação, desde a stack técnica até o processo de redação de um artigo. E sim, vou até te mostrar como escrevo meus artigos diretamente do VS Code!

## A Stack Técnica

Este blog é construído com tecnologias web modernas:

- **React 19** -- para a interface do usuário
- **TypeScript** -- para um código tipado e mais confiável
- **Vite** -- como ferramenta de build ultra-rápida
- **React Router v7** -- para a navegação entre as páginas
- **react-markdown** -- para transformar Markdown em HTML
- **rehype-raw + rehype-sanitize** -- para permitir HTML bruto no Markdown com segurança

Tudo está hospedado no **GitHub Pages** diretamente do repositório `fox3000foxy.github.io`.

## Estrutura do Projeto

Aqui está como é a árvore do projeto:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Conteúdo da página inicial
│   ├── portfolio.md                ← Conteúdo do portfólio
│   └── articles/
│       ├── index.json              ← Lista de todos os artigos
│       ├── hello-world.md          ← Um artigo
│       ├── how-this-blog-works.md  ← Este artigo!
│       └── assets/                 ← Imagens dos artigos
├── src/
│   ├── main.tsx                    ← Ponto de entrada React
│   ├── App.tsx                     ← Roteador principal
│   ├── components/
│   │   ├── Header.tsx              ← Barra de navegação
│   │   └── Footer.tsx              ← Rodapé
│   └── pages/
│       ├── Home.tsx                ← Página inicial
│       ├── BlogList.tsx            ← Lista de artigos
│       ├── Article.tsx             ← Leitor de artigos
│       ├── Portfolio.tsx           ← Página de portfólio
│       └── NotFound.tsx            ← Página 404
└── vite.config.ts                  ← Configuração Vite
```

A ideia central é simples: **o conteúdo é separado do código**. As páginas são escritas em Markdown na pasta `public/`, e o código React em `src/` cuida de exibi-las.

## O Sistema de Roteamento

O arquivo `App.tsx` define todas as rotas da aplicação com React Router:

![](assets/20260308_153440_image.png)


| Rota          | Página     | Descrição                                 |
| --------------- | ----------- | ------------------------------------------- |
| `/`           | Home       | Página inicial, carrega `home.md`          |
| `/blog`       | BlogList   | Lista de todos os artigos                  |
| `/blog/:slug` | Article    | Um artigo, carrega `articles/{slug}.md`    |
| `/portfolio`  | Portfolio  | Página de portfólio, carrega `portfolio.md`|
| `*`           | NotFound   | Página 404 para URLs desconhecidas         |

Cada página tem um papel bem definido: ela busca um arquivo Markdown, transforma em HTML com `react-markdown`, e o exibe na tela.

## Como Funciona um Artigo?

Esta é a parte mais interessante! Aqui está o ciclo de vida de um artigo:

### 1. O Arquivo `index.json`

Todos os artigos são referenciados em `public/articles/index.json`. Cada entrada contém os metadados do artigo:

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "A sample post for Fox's Blog.",
    "date": "2026-03-08"
  }
]
```

- **slug** -- o identificador único, usado na URL (`/blog/hello-world`)
- **title** -- o título exibido na lista
- **description** -- um breve resumo
- **date** -- a data de publicação

### 2. O Arquivo Markdown

O conteúdo do artigo é um simples arquivo `.md` em `public/articles/`. O nome do arquivo corresponde ao `slug` definido em `index.json`.

![](assets/20260308_153509_image.png)

Você pode colocar o que quiser: títulos, listas, imagens, tabelas, e até HTML bruto graças ao `rehype-raw`!

### 3. A Renderização no React

Quando você visita `/blog/hello-world`, aqui está o que acontece:

1. React Router captura o parâmetro `slug` da URL
2. O componente `Article.tsx` carrega `/articles/hello-world.md`
3. O Markdown é transformado em HTML pelo `react-markdown`
4. Os links para `assets/` são automaticamente reescritos para `/articles/assets/`
5. Em paralelo, os metadados são carregados do `index.json` para exibir a data e a descrição

É simples assim!

## A Página Inicial e o Portfólio

As páginas Inicial e Portfólio funcionam exatamente da mesma forma: elas carregam um arquivo Markdown (`home.md` ou `portfolio.md`) e o renderizam em HTML.

A particularidade é que elas usam um esquema de sanitização personalizado que permite os atributos `class` e `style` em todos os elementos HTML. Isso me permite escrever HTML estilizado diretamente no Markdown, como galerias de imagens, por exemplo.

## O Header e o Footer

O Header está fixo no topo da página com `position: fixed`. Ele contém:

- Meu avatar do GitHub (carregado diretamente de `github.com/fox3000foxy.png`)
- O título do blog
- Os links de navegação: Início, Blog, Portfólio

O Footer é minimalista: apenas um copyright com o ano atual calculado dinamicamente.

## O Tema Escuro

O site está **sempre no modo escuro** -- sem alternância dia/noite. É uma escolha deliberada: `color-scheme: dark` está definido nos estilos globais, com fundo preto `#000` e texto branco `#fff`. Os links são azuis (`#64b5f6`) e ficam verdes ao passar o mouse (`#81c784`).

## Como Eu Escrevo um Artigo

Vamos à prática! Aqui está meu fluxo de trabalho para escrever um novo artigo:

### Etapa 1: Criar o Arquivo Markdown

Abro o VS Code e crio um novo arquivo `.md` em `public/articles/`:

### Etapa 2: Escrever o Conteúdo

Escrevo o conteúdo do artigo diretamente em Markdown. O VS Code tem uma excelente pré-visualização de Markdown integrada:

![](assets/20260308_153613_image.png)

Para as imagens, coloco-as em `public/articles/assets/` e as referencio com a sintaxe Markdown padrão:

```markdown
![descrição](assets/my-image.png)
```

O componente `Article.tsx` reescreve automaticamente o caminho `assets/` para `/articles/assets/` para que as imagens sejam exibidas corretamente.

### Etapa 3: Registrar o Artigo no index.json

Assim que o artigo estiver pronto, eu o adiciono em `public/articles/index.json` para que apareça na lista do blog:

![](assets/20260308_153629_image.png)

### Etapa 4: Testar Localmente

Inicio o servidor de desenvolvimento Vite:

```bash
pnpm dev
```

O Vite inicia em alguns milissegundos e eu posso ver meu artigo em tempo real em `localhost:5173`:

![](assets/20260308_153703_image.png)

### Etapa 5: Publicar

Um simples `git push` é suficiente! O pipeline CI/CD cuida do resto automaticamente.

## O Pipeline de Deploy CI/CD

Montei um pipeline **GitHub Actions** completo que automatiza o lint, o build e o deploy do site a cada push na `main`. Vamos ver isso em detalhes.

O workflow está em `.github/workflows/deploy.yml` e é dividido em dois jobs: **build** e **deploy**.

### Gatilhos

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

O pipeline é executado a cada **push** na `main` e a cada **pull request** visando `main`. As PRs são verificadas (lint + build) antes de serem mescladas, mas apenas pushes na `main` disparam um deploy.

### Job 1: Build

O job de build roda em `ubuntu-latest` e segue estas etapas:

1. **Checkout** -- Clona o repositório com todo o histórico (`fetch-depth: 0`)
2. **Setup pnpm** -- Instala a versão mais recente do pnpm com `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- Configura o Node com cache pnpm ativado para instalações mais rápidas
4. **Install dependencies** -- Executa `pnpm install --frozen-lockfile` para garantir builds reproduzíveis (nenhuma modificação do lockfile é permitida)
5. **Lint** -- Executa `pnpm run lint` (ESLint) para verificar a qualidade do código antes do build
6. **Build** -- Executa `pnpm run build`, que primeiro verifica os tipos TypeScript (`tsc -b`) e então empacota tudo com Vite
7. **Upload artifact** -- Envia a pasta `dist/` como artefato de build para o job de deploy

Se alguma etapa falhar -- um erro de lint, tipo ou build -- todo o pipeline para e nada é implantado. Isso protege o site em produção contra código quebrado.

### Job 2: Deploy

O job de deploy só é executado se:

- O job de build tiver sucesso (`needs: build`)
- O evento for um **push** (não uma PR)
- A branch for **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Ele então prossegue:

1. **Baixa o artefato de build** -- Recupera a pasta `dist/` produzida pelo job de build
2. **Configura GitHub Pages** -- Prepara o ambiente Pages
3. **Envia para Pages** -- Prepara a pasta `dist/` para o GitHub Pages
4. **Deploy** -- Publica o site com `actions/deploy-pages@v4`

### O Fluxo Completo

Aqui está o que acontece desde a escrita até o deploy:

```
Escrever o artigo no VS Code
         ↓
   git add & commit
         ↓
      git push
         ↓
  GitHub Actions é acionado
         ↓
  ┌─────────────────┐
  │   BUILD JOB     │
  │  1. Checkout    │
  │  2. Setup pnpm  │
  │  3. Setup Node  │
  │  4. Install     │
  │  5. Lint ✓      │
  │  6. Build ✓     │
  │  7. Upload dist │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │  DEPLOY JOB     │
  │  1. Download    │
  │  2. Configure   │
  │  3. Upload      │
  │  4. Deploy 🚀   │
  └─────────────────┘
           ↓
    Online no GitHub Pages!
```

O processo inteiro leva cerca de um minuto entre o push e a publicação. Sem deploy manual, sem FTP, sem SSH -- apenas `git push` e pronto.

## O Build de Produção

Por baixo dos panos, o comando `pnpm build` executa:

1. `tsc -b` -- Verifica os tipos TypeScript
2. `vite build` -- Empacota e otimiza todo o código

Vite produz arquivos minificados e otimizados com code-splitting automático. O resultado é um site estático ultra-rápido.

## Por Que Esta Arquitetura?

Eu poderia ter usado um CMS, um gerador de site estático como Hugo ou Jekyll, ou até Next.js. Mas aqui está por que escolhi esta abordagem:

- **Simplicidade** -- Escreva em Markdown, faça push no GitHub, está online
- **Controle total** -- Sem dependência de CMS ou banco de dados
- **Performance** -- Vite + React = carregamento rápido
- **Flexibilidade** -- Posso misturar Markdown e HTML como quiser
- **Aprendizado** -- É um ótimo projeto para dominar React e TypeScript
- **CI/CD** -- Verificações de qualidade e deploy automatizados com GitHub Actions

## Conclusão

Este blog é um projeto simples, mas bem pensado: Markdown para o conteúdo, React para a renderização, Vite para performance, GitHub Actions para CI/CD, e GitHub Pages para hospedagem. Sem banco de dados, sem servidor backend, apenas arquivos estáticos servidos eficientemente com um pipeline automatizado que garante a qualidade a cada push.

Se você quiser criar seu próprio blog com uma arquitetura similar, não hesite em dar uma olhada no [código fonte no GitHub](https://github.com/fox3000foxy/fox3000foxy.github.io)!

Obrigado por ler, e até o próximo artigo! 🦊
