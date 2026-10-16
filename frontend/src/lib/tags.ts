import api from '@/lib/api';

export const CORES_ETIQUETA = ['brand', 'success', 'warning', 'danger', 'tertiary', 'muted'] as const;
export type CorEtiqueta = (typeof CORES_ETIQUETA)[number];

export interface Etiqueta { id: string; name: string; color: string }
export interface EtiquetaComContagem extends Etiqueta { clientes: number }

export const listarEtiquetas = async () => (await api.get<EtiquetaComContagem[]>('/tags')).data;
export const criarEtiqueta = async (d: { name: string; color?: CorEtiqueta }) => (await api.post<Etiqueta>('/tags', d)).data;
export const atualizarEtiqueta = async (id: string, d: { name?: string; color?: CorEtiqueta }) =>
  (await api.put<Etiqueta>(`/tags/${id}`, d)).data;
export const removerEtiqueta = async (id: string) => { await api.delete(`/tags/${id}`); };
export const definirEtiquetasCliente = async (id: string, tagIds: string[]) =>
  (await api.put<Etiqueta[]>(`/clients/${id}/tags`, { tagIds })).data;
