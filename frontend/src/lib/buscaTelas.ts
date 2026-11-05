import { NAV_ITEMS, NEW_APPOINTMENT_HREF, SETTINGS_TABS } from '@/lib/navigation';
import type { ItemBusca } from '@/lib/busca';

const SINONIMOS: Record<string, string[]> = {
  '/clientes': ['clientes'],
  '/financeiro': ['financeiro', 'dinheiro', 'pagamentos'],
  '/configuracoes': ['configurações', 'negócio'],
  '/agendamentos': ['calendário', 'horários'],
  '/relatorios': ['comissões'],
  '/planos': ['assinatura', 'cobrança'],
  '/servicos': ['serviços', 'equipe', 'preços'],
  '/minha-pagina': ['link', 'vitrine'],
};

const LIMITE = 4;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function todasAsTelas(rotuloClientes: string): ItemBusca[] {
  const telas: ItemBusca[] = NAV_ITEMS.map((n) => ({
    chave: `tela-${n.href}`,
    grupo: 'telas',
    titulo: n.href === '/clientes' ? rotuloClientes : n.label,
    icone: n.icon,
    href: n.href,
  }));
  // "Negócio" fica de fora: /configuracoes já é Ajustes.
  for (const tab of SETTINGS_TABS) {
    if (telas.some((t) => t.href === tab.href)) continue;
    telas.push({ chave: `tela-${tab.href}`, grupo: 'telas', titulo: tab.label, icone: 'settings', href: tab.href });
  }
  telas.push({ chave: 'tela-novo-agendamento', grupo: 'telas', titulo: 'Novo agendamento', icone: 'add', href: NEW_APPOINTMENT_HREF });
  return telas;
}

export function filtrarTelas(termo: string, rotuloClientes: string): ItemBusca[] {
  const t = semAcento(termo.trim());
  if (!t) return [];
  const achados: { item: ItemBusca; comeca: boolean }[] = [];
  for (const item of todasAsTelas(rotuloClientes)) {
    const nomes = [item.titulo, ...(SINONIMOS[item.href] ?? [])].map(semAcento);
    if (!nomes.some((n) => n.includes(t))) continue;
    achados.push({ item, comeca: nomes.some((n) => n.startsWith(t)) });
  }
  return [...achados.filter((a) => a.comeca), ...achados.filter((a) => !a.comeca)].slice(0, LIMITE).map((a) => a.item);
}
