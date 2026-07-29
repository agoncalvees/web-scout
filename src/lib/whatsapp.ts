import {
  isCategoriaKey,
  type CategoriaKey,
} from "@/lib/categorias";

/**
 * Mensagens iniciais por categoria. Elas são sugestões: o contato continua
 * assistido e o texto sempre pode ser revisado antes de abrir o WhatsApp.
 */
export const TEMPLATE_WHATSAPP_POR_CATEGORIA: Record<CategoriaKey, string> = {
  academia:
    "Olá, {nome}! Tudo bem? Crio sites para academias e tenho uma ideia para apresentar planos, estrutura e modalidades de forma mais clara on-line. Posso te mostrar?",
  advocacia:
    "Olá, {nome}! Tudo bem? Desenvolvo sites profissionais para escritórios de advocacia e tenho uma sugestão para apresentar melhor as áreas de atuação de vocês. Posso te explicar brevemente?",
  contabilidade:
    "Olá, {nome}! Tudo bem? Crio sites profissionais para escritórios de contabilidade e pensei em uma forma clara de apresentar os serviços e facilitar novos contatos. Posso te contar?",
  clinica_medica:
    "Olá, {nome}! Tudo bem? Trabalho com sites profissionais para clínicas e gostaria de apresentar uma ideia para fortalecer a presença digital de vocês. Posso te contar em dois minutos?",
  farmacia:
    "Olá, {nome}! Tudo bem? Trabalho com sites para negócios locais e tenho uma ideia para deixar os serviços e canais de contato da farmácia mais fáceis de encontrar. Posso te mostrar?",
  fisioterapia:
    "Olá, {nome}! Tudo bem? Crio sites para clínicas de fisioterapia e pensei em uma forma profissional de apresentar tratamentos, equipe e contato. Posso te explicar rapidinho?",
  imobiliaria:
    "Olá, {nome}! Tudo bem? Desenvolvo sites para imobiliárias e tenho uma sugestão para organizar imóveis e captar novos contatos em um canal próprio. Posso te mostrar a ideia?",
  odontologia:
    "Olá, {nome}! Tudo bem? Crio sites profissionais para consultórios odontológicos e tenho uma sugestão para facilitar a apresentação dos serviços de vocês on-line. Posso te explicar rapidinho?",
  oficina_mecanica:
    "Olá, {nome}! Tudo bem? Crio sites para oficinas e pensei em uma forma simples de mostrar os serviços, a localização e facilitar pedidos de orçamento. Posso te mostrar?",
  otica:
    "Olá, {nome}! Tudo bem? Desenvolvo sites para óticas e tenho uma ideia para apresentar marcas, serviços e contato de forma mais profissional. Posso te contar?",
  padaria:
    "Olá, {nome}! Tudo bem? Crio sites para negócios locais e pensei em uma forma prática de mostrar produtos, horários e encomendas da padaria. Posso te apresentar?",
  pet_shop:
    "Olá, {nome}! Tudo bem? Trabalho com sites para pet shops e tenho uma ideia para reunir serviços, produtos e agendamentos em um canal próprio. Posso te mostrar?",
  psicologia:
    "Olá, {nome}! Tudo bem? Desenvolvo sites profissionais para psicólogos e tenho uma sugestão para apresentar o atendimento e facilitar o primeiro contato com cuidado e clareza. Posso te explicar?",
  massoterapia_estetica:
    "Olá, {nome}! Tudo bem? Crio sites para profissionais de massoterapia e estética e gostaria de compartilhar uma ideia para valorizar os serviços de vocês on-line. Posso te contar?",
  restaurante:
    "Olá, {nome}! Tudo bem? Crio sites para restaurantes e pensei em uma forma direta de reunir cardápio, localização e contato em uma presença digital própria. Posso te mostrar a ideia?",
  salao_de_beleza:
    "Olá, {nome}! Tudo bem? Trabalho com sites para salões de beleza e pensei em uma forma simples de destacar os serviços e facilitar novos contatos. Posso te mostrar a ideia?",
  veterinaria:
    "Olá, {nome}! Tudo bem? Crio sites para clínicas veterinárias e tenho uma ideia para apresentar especialidades, equipe e canais de atendimento de forma clara. Posso te mostrar?",
};

const TEMPLATE_PADRAO =
  "Olá, {nome}! Tudo bem? Trabalho com criação de sites profissionais e gostaria de apresentar uma ideia para fortalecer a presença digital de vocês. Posso te contar em dois minutos?";

export function mensagemInicialWhatsApp(
  categoria: string,
  nome: string,
): string {
  const template = isCategoriaKey(categoria)
    ? TEMPLATE_WHATSAPP_POR_CATEGORIA[categoria]
    : TEMPLATE_PADRAO;

  return template.replaceAll("{nome}", nome);
}

export function criarLinkWhatsApp(
  telefone: string,
  mensagem: string,
): string | null {
  const numero = telefone.replace(/\D/g, "");
  if (!numero) return null;

  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
