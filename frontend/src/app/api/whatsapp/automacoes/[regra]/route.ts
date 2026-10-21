import { proxyRequest } from '@/lib/server/proxy';

export async function PATCH(request: Request, { params }: { params: Promise<{ regra: string }> }) {
  const { regra } = await params;
  return proxyRequest(request, `/whatsapp/automacoes/${encodeURIComponent(regra)}`, 'PATCH');
}
