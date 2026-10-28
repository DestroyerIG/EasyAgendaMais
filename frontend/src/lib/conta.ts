import api from '@/lib/api';

export type EstadoConta =
  | { tipo: 'ativa' }
  | { tipo: 'carencia'; desde: string; ate: string; diasRestantes: number }
  | { tipo: 'bloqueada'; motivo: 'cobranca' | 'teste' | 'cancelada' };

function nomeDoArquivo(disposition: unknown): string | null {
  if (typeof disposition !== 'string') return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* cai no filename simples */
    }
  }
  const simples = /filename="?([^";]+)"?/i.exec(disposition);
  return simples ? simples[1] : null;
}

export const contaApi = {
  async estado(): Promise<EstadoConta> {
    const res = await api.get<EstadoConta>('/conta/estado');
    return res.data;
  },

  async baixarBackup(): Promise<void> {
    const res = await api.get<Blob>('/conta/backup', { responseType: 'blob' });
    const nome = nomeDoArquivo(res.headers?.['content-disposition']) ?? 'backup-easyagenda.zip';
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
