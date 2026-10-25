import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return proxyRequest(request, `/convites/${encodeURIComponent(token)}`, 'GET');
}
