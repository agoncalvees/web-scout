# Prospector 

## Status

| Fase | O quê | Status |
|---|---|---|
| 0 | Scaffolding (Next 15 + Prisma + Postgres) | ✅ |
| 1 | Auth de usuário único (`APP_PASSWORD`) | ✅ |
| 2 | Modelo de dados + migration + seed fake | ✅ |
| 3 | Scout — Nominatim + Overpass | ✅ |
| 4 | Enrichment de site em lotes | ✅ |
| 5 | Match de CNPJ + tier de preço | ✅ |
| 6 | Kanban | ✅ |
| 7 | Disparo assistido via WhatsApp | ✅ |
| 8 | Export CSV/Excel | ✅ |
| 9 | Polish + preparação open-source | ✅ |

## Stack

- **Next.js 15** (App Router) + TypeScript — monolito, sem backend separado
- **Prisma 7** + Postgres (Neon)
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI)
- Deploy na **Vercel** (Hobby)

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha DATABASE_URL, APP_PASSWORD e AUTH_SECRET
npm run db:deploy         # aplica as migrations
npm run db:seed           # opcional: 5 leads fictícios para demo
npm run dev
```

Sem um Postgres à mão, o Prisma sobe um local:

```bash
npx prisma dev            # imprime a DATABASE_URL para colar no .env
npm run db:push           # o Postgres emulado não suporta `migrate`, use push
```

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres. Em produção use a connection string do **pooler** do Neon — o app roda em funções serverless. |
| `APP_PASSWORD` | Senha única de acesso. |
| `AUTH_SECRET` | Segredo que assina o cookie de sessão. |
| `OSM_USER_AGENT` | Identificação enviada ao Nominatim/Overpass. A política do OSM exige um UA com forma de contato. |
| `TAVILY_API_KEY` | Recomendado. Procura o site oficial na web; o plano gratuito oferece 1.000 créditos/mês sem cartão. |
| `TAVILY_MONTHLY_LIMIT` | Teto interno de buscas Tavily. Máximo aceito pelo app: 900/mês. |
| `GOOGLE_PLACES_API_KEY` | Alternativa opcional. Confirma empresas no Places API (New); fica somente no servidor. |
| `GOOGLE_PLACES_MONTHLY_LIMIT` | Teto interno de Place Details. Máximo aceito pelo app: 900/mês. |

## Como o pipeline funciona

### 1. Scout (`src/lib/scout.ts`)

O formulário carrega os 27 estados localmente e, depois da escolha da UF,
consulta a lista oficial de municípios pela **API de Localidades do IBGE**. A
cidade selecionada é geocodificada no **Nominatim** → o Scout monta uma query
**Overpass QL** com as tags OSM da categoria dentro do raio → grava os leads
crus.

O dicionário categoria → tags OSM está em [`src/lib/categorias.ts`](src/lib/categorias.ts).
Há 17 segmentos disponíveis. A opção **Todas as categorias** une, sem duplicar,
as tags de todos eles na mesma consulta. Expandir o catálogo é só adicionar uma
entrada, o respectivo fallback de preço e o template assistido de WhatsApp.

Os municípios são expostos ao componente cliente por
[`src/app/api/municipios/route.ts`](src/app/api/municipios/route.ts), que valida
a UF, simplifica a resposta do IBGE e mantém cache de 24 horas.

A descoberta está atrás da interface [`LeadSource`](src/lib/sources/types.ts), para
permitir plugar outra fonte (ex.: Google Places Text Search) sem tocar nas rotas
nem na UI.

### 2. Enrichment de site (`src/lib/enrichment/site.ts`)

Para cada lead:

- **tem `website` no OSM e não é rede social** → checa se responde (HEAD, com
  fallback para GET porque muito servidor pequeno devolve 405 a HEAD)
- **tem e-mail corporativo** → testa o domínio do e-mail antes de consumir API
- **sem `website`, ou só rede social** (Instagram, Facebook, Linktree…) → chuta
  domínios a partir do nome (`.com.br`, `.com`) e checa cada um
- **ainda incerto e Tavily configurada** → busca até cinco resultados, elimina
  redes sociais e diretórios e valida a identidade diretamente no site candidato
- **Google configurado como alternativa** → usa Text Search somente por ID, busca
  um Place Details e valida nome/distância/telefone antes de confiar no resultado

Resultado em `siteStatus`:

| Status | Significado |
|---|---|
| `sem_site_alta_confianca` | **O lead que interessa.** A busca web não encontrou um domínio oficial plausível. A interface mostra “Sem site provável” porque ausência em busca não é prova absoluta. |
| `site_fora_do_ar` | Tem domínio, mas não responde. Bom gancho de venda. |
| `tem_site_ativo` | Já tem site. Descartar. |
| `checar_manualmente` | A verificação não foi conclusiva; score limitado a 39. |

O chute de domínio é ordenado por **precisão decrescente**, e um acerto num nome
de palavra única cai em `checar_manualmente` em vez de `tem_site_ativo`. O motivo:
um acerto encerra a busca e tira o lead da lista, então um falso positivo custa
um lead bom — "Pesqueiro" acha `pesqueiro.com.br`, que é de outra empresa.

O app não persiste resultados brutos da Tavily nem nome, endereço, telefone ou
avaliações retornados pelo Google. Esses conteúdos são usados transitoriamente
para localizar e conferir o candidato; a URL só é salva depois de uma checagem
HTTP independente. No Google, apenas o `place_id` permitido e o resultado do
checker são mantidos. Contadores no Postgres limitam cada integração a no máximo
900 chamadas por mês.

### 3. Match de CNPJ (`src/lib/enrichment/cnpj.ts`)

**Leia isto antes de esperar muito desta etapa.** BrasilAPI e minhaReceita
resolvem apenas **CNPJ → dados**; nenhuma das duas faz busca reversa por nome ou
endereço (ambas devolvem `400` para `?q=nome`). Não existe API pública gratuita
que faça esse caminho.

Logo, a única origem automática de CNPJ é a tag do OSM (`ref:vatin` e variantes).
A cobertura medida:

| Amostra | POIs com nome | Com tag de CNPJ |
|---|---|---|
| São Paulo/SP, 6 km | 1545 | 16 (~1%) |
| Curitiba/PR, 6 km | 634 | 0 |

Quando o CNPJ existe, o fluxo é: valida os dígitos verificadores (evita gastar
chamada com tag preenchida errado) → consulta com cache obrigatório em
`CnpjCache` → mapeia o porte pelo código da Receita (`01` ME, `03` EPP, `05`
acima de EPP), com `opcao_pelo_mei` tendo precedência.

### 4. Tier de preço (`src/lib/pricing.ts`)

Porte confirmado na Receita define a faixa:

| Porte | Faixa |
|---|---|
| MEI | R$450–650 |
| ME | R$650–1200 |
| EPP e acima | R$1200+ |

Nos ~99% sem CNPJ, o preço vem do **fallback por categoria**, que é onde a
precificação realmente acontece. Ajustar é mexer só em `TIER_POR_CATEGORIA`:

| Categoria | Faixa |
|---|---|
| Advocacia, contabilidade, clínica médica, fisioterapia, imobiliária, odontologia, ótica, psicologia e veterinária | R$650–1200 |
| Academia, farmácia, massoterapia/estética, oficina mecânica, padaria, pet shop, restaurante e salão de beleza | R$450–650 |

Porte real sempre vence o fallback: um MEI em advocacia fica em R$450–650. E
quando a Receita devolve porte "não informado", o preço também cai no fallback,
em vez de chutar a faixa mais alta.

### 5. Kanban (`src/app/(app)/kanban`)

Board de 5 colunas (Novo → Contatado → Respondido → Fechado, mais Perdido fora
da linha principal), com filtros por busca, status de site e faixa de preço.

Lead sem registro em `KanbanStatus` conta como **Novo** — a linha só nasce quando
o lead é movido pela primeira vez, evitando escrita à toa para cada lead
descoberto. As contagens por coluna vêm de agregações separadas, então o total é
exato mesmo quando os cards estão truncados.

### 6. Processamento em lotes

O enrichment (site + CNPJ na mesma passada) roda em lotes de ~30 leads por
requisição, disparados **pelo cliente** em loop até a fila zerar, com barra de
progresso.

Isso não é preferência de arquitetura, é restrição de infra: Cron Job no plano
Hobby da Vercel dispara **1x/dia**, o que não serve para esvaziar uma fila. Cada
lote tem orçamento de tempo próprio (`ORCAMENTO_MS`) e para de iniciar novas
checagens antes do teto de 300s da função, devolvendo um lote parcial que a
próxima chamada continua.

### 7. Disparo assistido via WhatsApp

A tabela de uma busca e os cards do Kanban mostram o botão **WhatsApp** apenas
quando o lead tem telefone. O clique abre primeiro um editor com uma mensagem
sugerida para a categoria e o placeholder `{nome}` já preenchido.

Só depois da revisão o app abre
`https://wa.me/<telefone>?text=<mensagem>` em outra aba. Não há envio automático,
fila de mensagens ou disparo em massa: cada contato exige um clique individual.
Os templates ficam em [`src/lib/whatsapp.ts`](src/lib/whatsapp.ts).

### 8. Exportação CSV/Excel

A lista da busca e o Kanban exportam todos os campos do lead em **CSV** ou
**Excel (`.xlsx`)**. No Kanban, busca, status do site e faixa de preço são
repassados à exportação, então o arquivo contém exatamente o conjunto filtrado.

O SheetJS é usado exclusivamente para **gerar** os arquivos. A aplicação não
oferece upload nem faz parsing de planilhas de terceiros.

### 9. Polish e open-source

Os estados de carregamento, vazio, erro e página não encontrada estão em pt-BR.
O repositório mantém somente o seed fictício e o `.env.example` usa placeholders;
arquivos `.env` reais continuam ignorados pelo Git.

## Limites de terceiros respeitados

| Serviço | Limite | Onde é tratado |
|---|---|---|
| Nominatim | 1 req/s, UA customizado obrigatório | [`nominatim.ts`](src/lib/sources/nominatim.ts) serializa tudo por um rate limiter |
| Overpass | fair-use por IP, instável | [`overpass.ts`](src/lib/sources/overpass.ts) usa `timeout:25` e cai para o mirror `overpass.kumi.systems` |
| IBGE Localidades | catálogo público de municípios | rota interna valida a UF, aplica timeout e cacheia a resposta por 24h |
| BrasilAPI / minhaReceita | rate limit não documentado | [`cnpj.ts`](src/lib/enrichment/cnpj.ts) serializa as chamadas e cacheia em `CnpjCache` antes de reconsultar |
| Tavily Search | 1.000 créditos/mês no plano gratuito | busca básica + teto interno de 900/mês; resultados brutos não são persistidos |
| Google Places (opcional) | 1.000 eventos Enterprise gratuitos/mês na tabela atual | Text Search só por ID + teto interno de 900 Place Details/mês; chave restrita e server-side |
| Vercel Hobby | 300s por função | lotes com orçamento de tempo, sem Cron |
| Neon (serverless) | limite de conexões da conta | pool de 5 por instância em [`db.ts`](src/lib/db.ts); use a connection string do pooler |

## Scripts

| Comando | O quê |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | aplica migrations + `prisma generate` + build de produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:deploy` | aplica migrations (produção) |
| `npm run db:push` | sincroniza schema sem migration (protótipo) |
| `npm run db:seed` | popula 5 leads fictícios |
| `npm run db:studio` | Prisma Studio |

## Dados

Nenhum dado real de lead ou CNPJ está neste repositório. O seed
([`prisma/seed.ts`](prisma/seed.ts)) usa nomes inventados, telefones da faixa
`5511 9000000xx` e domínios `example.com`/`.invalid`, que nunca resolvem.

## Nota sobre `xlsx`

O `xlsx` (SheetJS) publicado no npm tem vulnerabilidades conhecidas de
**parsing**. Aqui ele é usado apenas para **gerar** arquivos (Fase 8), nunca para
ler planilha de terceiro, então o vetor não se aplica.

Em 29/07/2026, `npm audit --omit=dev` também reporta advisories altos em
`postcss` e `sharp`, ambos transitivos via Next 15. A correção automática
sugerida pelo npm seria um downgrade incompatível para Next 9.3.3, por isso não
foi aplicada. O projeto deve adotar uma correção compatível quando ela estiver
disponível no canal do Next 15.

## Estado das migrations

As migrations foram geradas por `prisma migrate diff` e verificadas sem drift,
mas ainda não foram aplicadas em um Postgres real. O `migrate deploy` contra o
Neon permanece pendente de validação. Em desenvolvimento, o Postgres local do
`prisma dev` usa `npm run db:push`, pois não suporta `prisma migrate`.
