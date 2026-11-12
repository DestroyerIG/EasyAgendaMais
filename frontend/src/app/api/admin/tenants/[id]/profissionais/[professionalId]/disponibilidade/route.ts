import { proxyRequest } from '@/lib/server/proxy';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; professionalId: string }> }) {
  const { id, professionalId } = await params;
  return proxyRequest(request, `/admin/tenants/${id}/profissionais/${professionalId}/disponibilidade`, 'PATCH');
}
