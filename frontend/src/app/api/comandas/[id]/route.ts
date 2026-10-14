import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(request, `/comandas/${id}`, 'GET');
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(request, `/comandas/${id}`, 'PUT');
}
