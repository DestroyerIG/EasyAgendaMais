import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request) {
  return proxyRequest(request, '/whatsapp/config/instagram', 'GET');
}
export async function PUT(request: Request) {
  return proxyRequest(request, '/whatsapp/config/instagram', 'PUT');
}
