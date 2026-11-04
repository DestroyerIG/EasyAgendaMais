// Escolha do teste feita no cadastro (7 dias sem cartão ou 14 com cartão). Fica no navegador até o
// onboarding: quem escolheu o cartão vê o convite no topo. Sem armazenamento, o convite do painel cobre.
export type EscolhaTeste = 'sem_cartao' | 'com_cartao';

const CHAVE = 'easyagenda:escolhaTeste';

export function guardarEscolhaTeste(escolha: EscolhaTeste): void {
  try {
    window.localStorage.setItem(CHAVE, escolha);
  } catch {
    // navegador sem armazenamento: o convite do painel continua valendo
  }
}

export function lerEscolhaTeste(): EscolhaTeste | null {
  try {
    const valor = window.localStorage.getItem(CHAVE);
    return valor === 'sem_cartao' || valor === 'com_cartao' ? valor : null;
  } catch {
    return null;
  }
}
