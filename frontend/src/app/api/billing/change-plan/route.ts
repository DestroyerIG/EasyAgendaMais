import { proxyRequest } from '@/lib/server/proxy';

export async function POST(request: Request) {
  return proxyRequest(request, '/billing/change-plan', 'POST');
}

export async function DELETE(request: Request) {
  return proxyRequest(request, '/billing/change-plan', 'DELETE');
}
