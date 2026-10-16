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

export async function enviarFoto(id: string, arquivo: File, extra: EnvioFotoExtra = {}) {
  if (arquivo.size > TAMANHO_MAX_FOTO) throw new Error('A foto deve ter no máximo 5 MB.');
  if (!TIPOS.includes(arquivo.type as TipoFoto)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  const imageBase64 = await lerBase64(arquivo);
  return (await api.post<FotoCliente>(`/clients/${id}/photos`, { imageBase64, contentType: arquivo.type, ...extra })).data;
}

export const removerFoto = async (id: string, fotoId: string) => { await api.delete(`/clients/${id}/photos/${fotoId}`); };
