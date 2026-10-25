import api from '@/lib/api';

// Web Push no aparelho (fase 5): o painel e o app da profissional usam o mesmo fluxo.
// Sem as chaves VAPID no servidor, /push/chave responde 404 e o botão não aparece.

export type EstadoPush = 'indisponivel' | 'ios_tela_inicial' | 'bloqueado' | 'desativado' | 'ativado';

const SW = '/sw.js';

const suportaPush = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhone/iPad fora da tela inicial: o Safari só libera push no app instalado (iOS 16.4+). */
export const precisaTelaInicial = () => {
  if (typeof window === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instalado = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !instalado;
};

const paraUint8 = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
};

async function chavePublica(): Promise<string | null> {
  try {
    return (await api.get<{ chavePublica: string }>('/push/chave')).data.chavePublica;
  } catch {
    return null;
  }
}

export const registrarServiceWorker = async () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW);
  } catch {
    return null;
  }
};

export async function estadoPush(): Promise<EstadoPush> {
  if (precisaTelaInicial()) return (await chavePublica()) ? 'ios_tela_inicial' : 'indisponivel';
  if (!suportaPush() || !(await chavePublica())) return 'indisponivel';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.getRegistration(SW);
  const inscricao = await reg?.pushManager.getSubscription();
  return inscricao ? 'ativado' : 'desativado';
}

export async function ativarPush(): Promise<EstadoPush> {
  const chave = await chavePublica();
  if (!chave || !suportaPush()) return 'indisponivel';
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueado' : 'desativado';
  const reg = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);
  const inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraUint8(chave) });
  const json = inscricao.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.post('/push/inscricoes', { endpoint: json.endpoint, keys: json.keys });
  return 'ativado';
}

export async function desativarPush(): Promise<EstadoPush> {
  const reg = await navigator.serviceWorker.getRegistration(SW);
  const inscricao = await reg?.pushManager.getSubscription();
  if (inscricao) {
    await api.delete('/push/inscricoes', { data: { endpoint: inscricao.endpoint } }).catch(() => undefined);
    await inscricao.unsubscribe();
  }
  return 'desativado';
}
