---
name: prospector-lead-scoring
description: Define e aplica o critério de qualificação de leads (Quente/Morno/Frio) do Prospector. Use ao implementar ou revisar scoring, filtros, priorização, funil comercial e novas fontes de dados.
---

# Critério de Qualificação de Leads — Score v2

## Contexto

O Prospector é um app pessoal que encontra empresas locais para oferta de sites
feitos com IA. O score ordena oportunidades observáveis; ele não afirma que uma
empresa certamente comprará.

**Versão vigente no código:** `v2-hibrido-2026-07`.

Os pesos são uma estimativa inicial. Devem ser recalibrados depois de 30–50
contatos reais, comparando sinais dos leads que fecharam com os que recusaram.

## 1. Elegibilidade antes da pontuação

- Sem `name`: eliminar durante a coleta.
- `tem_site_ativo`: não é oportunidade; score 0 e fica fora do Kanban padrão.
- `sem_site_alta_confianca`: elegível.
- `site_fora_do_ar`: elegível e recebe esse motivo na explicação.
- `checar_manualmente`: permanece elegível, com indicação de revisão.
- `brand` ou `operator`: permanece elegível, mas nunca pode ser Quente. O score
  final fica limitado a 69 porque a decisão de compra tende a ser centralizada.

O filtro usa o resultado do enrichment, não apenas a presença bruta de
`website`. Isso preserva redes sociais colocadas no campo de site e sites
declarados que estão fora do ar.

## 2. Pontuação normalizada — máximo 100

| Sinal | Pontos | Fonte |
|---|---:|---|
| Telefone/WhatsApp | 20 | `phone`, `contact:phone`, `contact:whatsapp` |
| Instagram ou Facebook | 20 | tags sociais do OSM |
| E-mail | 5 | `email`, `contact:email` |
| Necessidade da categoria | 0–20 | tabela versionada em `src/lib/scoring.ts` |
| Cadastro completo | 10 | endereço 5 + `opening_hours` 5 |
| Capacidade comercial | 0–10 | porte confirmado por CNPJ: MEI 3, ME 7, EPP/DEMAIS 10 |
| Gap competitivo local | 0–15 | proporção de concorrentes com site ativo em até 1 km |

O gap competitivo só é considerado quando existem pelo menos três concorrentes
analisados da mesma categoria no raio. Amostras menores valem zero.

Faturamento estimado não entra enquanto não houver fonte confiável. O porte
confirmado por CNPJ é o proxy atual e vale no máximo 10 pontos.

## 3. Prioridades

- **Quente:** score ≥ 70, desde que não seja rede/franquia.
- **Morno:** score 40–69.
- **Frio:** score < 40.
- **Rede/franquia:** no máximo Morno, independentemente da soma bruta.

Cada enrichment persiste:

- `opportunityScore`
- `opportunityReasons`
- `opportunityBreakdown`
- `scoreVersion`

Isso permite explicar o resultado e recalcular pesos no futuro sem confundir
scores gerados por versões diferentes.

## 4. Funil e aprendizado com conversão

O Kanban registra:

`Novo` → `Contatado · sem resposta` → `Respondido` → `Negociando` →
`Fechado` ou `Perdido`

Depois de 30–50 contatos:

1. Comparar taxa de resposta, negociação e fechamento por sinal.
2. Verificar se os cortes 40/70 separam bem os grupos.
3. Ajustar os pesos no código e nesta skill.
4. Incrementar `SCORE_VERSION` para forçar o recálculo dos leads.

## 5. Regras de manutenção

- O total máximo dos sinais deve continuar em 100.
- Nunca pontuar site ativo como oportunidade.
- O teto de franquia sempre sobrepõe a soma.
- Toda nova fonte precisa declarar peso, origem e tratamento de ausência.
- Ausência de dado vale zero; não deve virar evidência negativa por si só.
- Todo peso recalibrado deve atualizar esta skill e `src/lib/scoring.ts`.
