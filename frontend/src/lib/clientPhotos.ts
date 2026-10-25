import api from '@/lib/api';

export const TAMANHO_MAX_FOTO = 5 * 1024 * 1024;
export type TipoFoto = 'image/jpeg' | 'image/png' | 'image/webp';
const TIPOS: TipoFoto[] = ['image/jpeg', 'image/png', 'image/webp'];

export interface FotoCliente { id: string; url: string | null; caption: string | null; serviceName: string | null; takenAt: string }
export interface EnvioFotoExtra { caption?: string; appointmentId?: string; takenAt?: string }

const lerBase64 = (arquivo: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''));
    r.readAsDataURL(arquivo);
  });

export const listarFotos = async (id: string) => (await api.get<FotoCliente[]>(`/clients/${id}/photos`)).data;

/** Confere tamanho e tipo e monta o corpo do envio (usado pelo painel e pelo app da profissional). */
export async function corpoDaFoto(arquivo: File, extra: EnvioFotoExtra = {}) {
  if (arquivo.size > TAMANHO_MAX_FOTO) throw new Error('A foto deve ter no máximo 5 MB.');
  if (!TIPOS.includes(arquivo.type as TipoFoto)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  return { imageBase64: await lerBase64(arquivo), contentType: arquivo.type, ...extra };
}

export async function enviarFoto(id: string, arquivo: File, extra: EnvioFotoExtra = {}) {
  return (await api.post<FotoCliente>(`/clients/${id}/photos`, await corpoDaFoto(arquivo, extra))).data;
}

export const removerFoto = async (id: string, fotoId: string) => { await api.delete(`/clients/${id}/photos/${fotoId}`); };
