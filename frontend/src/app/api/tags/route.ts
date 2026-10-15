import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request) {
  return proxyRequest(request, '/tags', 'GET');
}

export async function POST(request: Request) {
  return proxyRequest(request, '/tags', 'POST');
}
