import { proxyRequest } from '@/lib/server/proxy';

export async function POST(request: Request, { params }: { params: Promise<{ regra: string }> }) {
  const { regra } = await params;
  return proxyRequest(request, `/whatsapp/automacoes/${encodeURIComponent(regra)}/testar`, 'POST');
}
