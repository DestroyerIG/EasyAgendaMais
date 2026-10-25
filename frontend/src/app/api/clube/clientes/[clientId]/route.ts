import { proxyRequest } from '@/lib/server/proxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  return proxyRequest(request, `/clube/clientes/${clientId}`, 'GET');
}
