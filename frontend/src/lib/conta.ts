import axios from 'axios';
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

// Com responseType 'blob' o corpo de erro (JSON) também chega como Blob: abre para a mensagem aparecer.
export async function abrirErroEmBlob(error: unknown): Promise<void> {
  if (!axios.isAxiosError(error) || !error.response) return;
  const dados: unknown = error.response.data;
  if (!(dados instanceof Blob)) return;
  try {
    const corpo = JSON.parse(await dados.text()) as { error?: unknown };
    if (corpo && typeof corpo === 'object') {
      // Mesmo formato que o interceptor do api.ts deixa: error vira a mensagem em texto.
      if (corpo.error && typeof corpo.error === 'object' && typeof (corpo.error as { message?: unknown }).message === 'string') {
        corpo.error = (corpo.error as { message: string }).message;
      }
      error.response.data = corpo;
    }
  } catch {
    /* corpo que não é JSON: fica o texto genérico */
  }
}

export const contaApi = {
  async estado(): Promise<EstadoConta> {
    const res = await api.get<EstadoConta>('/conta/estado');
    return res.data;
  },

  async baixarBackup(): Promise<void> {
    let res;
    try {
      res = await api.get<Blob>('/conta/backup', { responseType: 'blob' });
    } catch (error) {
      await abrirErroEmBlob(error);
      throw error;
    }
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
