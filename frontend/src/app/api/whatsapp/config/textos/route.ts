import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request) {
  return proxyRequest(request, '/whatsapp/config/textos', 'GET');
}
export async function PUT(request: Request) {
  return proxyRequest(request, '/whatsapp/config/textos', 'PUT');
}
