# CLAUDE.md — Prospector de Empresas sem Site

## O que é
App pessoal (uso interno, não é SaaS) para prospectar empresas locais sem site e gerar leads qualificados pra venda de sites feitos com IA (a partir de R$450). Vai ficar open-source (GitHub/LinkedIn).

## Stack
- Next.js 15 (App Router) + TypeScript — monolito, sem backend separado
- Prisma 7 + Postgres (Neon)
- Deploy: Vercel (Hobby)
- Tailwind CSS 4 + shadcn/ui (Radix UI)
- `xlsx` (SheetJS) para export CSV/Excel
- Basic Auth via variável de ambiente (`APP_PASSWORD`) — single user, sem Clerk/Auth0
- Sem Redis/BullMQ/Cron — enrichment processado em lotes disparado pelo cliente

## Restrições de infra (não ignorar)
- Vercel Hobby: função serverless roda até 300s. Cron Jobs no Hobby só disparam 1x/dia — **nunca usar Cron pra processar a fila de enrichment**, só processamento client-driven em lotes.
- Nominatim (geocoding): rate limit de 1 req/s, exige header `User-Agent` customizado — nunca paralelizar.
- Overpass API (overpass-api.de): fair-use por IP, usar `timeout:25` nas queries, ter mirror de fallback (overpass.kumi.systems).
- BrasilAPI/minhaReceita (CNPJ): rate limit — sempre cachear resultado no banco antes de rechamar.

## Pipeline (nessa ordem)
1. **Scout** — carrega estado e município pela API de Localidades do IBGE → geocodifica a cidade via Nominatim → Overpass QL com tags da categoria (dicionário abaixo) + `around:raioMetros,lat,lon` → grava leads crus em `Lead`. A opção `todas` une as tags de todas as categorias.
2. **Enrichment de site** (lotes de ~30 leads por chamada, com barra de progresso no front, dentro do limite de 300s):
   - `websiteRaw` existente e não é rede social (instagram.com/facebook.com/linktr.ee) → checar se está vivo (HTTP HEAD/GET).
   - `websiteRaw` ausente ou é rede social → heurística de domínio (slug do nome + `.com.br`/`.com`) + checagem HTTP.
   - Grava `siteStatus`: `sem_site_alta_confianca` | `site_fora_do_ar` | `tem_site_ativo` | `checar_manualmente`.
3. **Match CNPJ** (mesmo lote) — casar nome+endereço com CNPJ via BrasilAPI/minhaReceita. Achou → grava `porte` (MEI/ME/EPP), cacheado. Não achou (comum em profissional liberal/CPF) → `sem_cnpj`, cai no fallback por categoria.
4. **Tier de preço sugerido**:
   - Sem CNPJ / MEI → R$450–650
   - ME → R$650–1200
   - EPP → R$1200+
5. **Kanban** — Novo → Contatado → Respondido → Fechado/Perdido.
6. **Disparo assistido** — botão gera link `wa.me/<telefone>?text=<mensagem>` com mensagem editável por categoria. Sem automação de envio em massa.
7. **Export** — CSV/Excel via `xlsx`, todos os campos acima incluídos.

## Dicionário categoria → tags OSM (expandir sob demanda)
| Categoria | Tags OSM |
|---|---|
| Academia | `leisure=fitness_centre` |
| Escritório de contabilidade | `office=accountant` |
| Clínica médica | `amenity=clinic`, `healthcare=clinic`, `amenity=doctors` |
| Farmácia | `amenity=pharmacy`, `shop=chemist` |
| Fisioterapia | `healthcare=physiotherapist` |
| Imobiliária | `office=estate_agent` |
| Odontologia | `amenity=dentist`, `healthcare=dentist` |
| Oficina mecânica | `shop=car_repair` |
| Ótica | `shop=optician` |
| Padaria | `shop=bakery` |
| Pet shop | `shop=pet` |
| Psicologia | `healthcare=psychotherapist` |
| Massoterapia/estética | `shop=massage` |
| Escritório de advocacia | `office=lawyer` |
| Restaurante | `amenity=restaurant` |
| Salão de beleza | `shop=hairdresser`, `shop=beauty` |
| Clínica veterinária | `amenity=veterinary` |

## Modelo de dados (Prisma, resumo)
- `Search`: id, categoria, cidade, lat, lon, raioKm, createdAt
- `Lead`: id, searchId, name, category, address, phone, lat, lon, osmId, websiteRaw
- `Enrichment`: leadId, siteStatus, siteUrl, siteConfidence, cnpj, porte, pricingTier
- `KanbanStatus`: leadId, stage, updatedAt

## Fora de escopo por enquanto
- Fallback de descoberta via Google Places Text Search — desacoplar o Scout atrás de uma interface `LeadSource` pra permitir plugar depois, mas não implementar agora.
- Mapa (Leaflet/Mapbox) — fase 2.

## Convenções
- UI toda em pt-BR.
- `.env.example` sem chaves reais; nenhuma chave real commitada.
- Nenhum dado real de lead/CNPJ no repo — fixtures fake pra demo/README (projeto vai ser open-source).
