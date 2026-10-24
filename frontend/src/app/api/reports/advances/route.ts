import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request) {
  return proxyRequest(request, '/reports/advances', 'GET');
}

export async function POST(request: Request) {
  return proxyRequest(request, '/reports/advances', 'POST');
}
