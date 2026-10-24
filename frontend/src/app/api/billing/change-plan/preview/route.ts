import { proxyRequest } from '@/lib/server/proxy';

export async function POST(request: Request) {
  return proxyRequest(request, '/billing/change-plan/preview', 'POST');
}
