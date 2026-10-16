export const soDigitos = (s: string) => s.replace(/\D/g, '');

/** null quando não há telefone utilizável (menos de 10 dígitos). */
export function linkWhatsapp(telefone: string | null | undefined, mensagem: string): string | null {
  let d = soDigitos(telefone ?? '');
  if (d.length < 10) return null;
  if (!(d.startsWith('55') && d.length >= 12)) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(mensagem)}`;
}

export type TipoMensagem = 'retorno_vencido' | 'pos_atendimento' | 'mimo' | 'resgate' | 'resposta_avaliacao' | 'oferta_vaga';

export const MENSAGENS: Record<TipoMensagem, string> = {
  retorno_vencido: 'Oi, {nome}! Já está na hora de renovar o seu {servico} aqui no {negocio}. Quer que eu veja um horário para você?',
  pos_atendimento: 'Oi, {nome}! Obrigada por vir ao {negocio}. Como ficou o seu {servico}? Qualquer coisa, estou por aqui.',
  mimo: 'Oi, {nome}! Você é especial para o {negocio} e preparamos um mimo para a sua próxima visita. Quer agendar?',
  resgate: 'Oi, {nome}! Sentimos sua falta no {negocio}. Que tal marcar o seu {servico} esta semana?',
  resposta_avaliacao: 'Oi, {nome}! Vi sua avaliação sobre o {negocio} e quero entender melhor o que aconteceu. Pode me contar?',
  oferta_vaga: 'Olá, {nome}! Abriu um horário para {servico} no {negocio}: {data} às {hora}. Quer que eu reserve para você?',
};

type Marcador = 'nome' | 'servico' | 'negocio' | 'data' | 'hora';

/** Marcador sem dado some junto com o espaço que vinha antes dele. */
export function preencherMensagem(modelo: string, dados: Partial<Record<Marcador, string>>): string {
  return modelo.replace(/(\s?)\{(\w+)\}/g, (_m, espaco: string, chave: string) => {
    const valor = dados[chave as Marcador];
    return valor ? `${espaco}${valor}` : '';
  });
}
