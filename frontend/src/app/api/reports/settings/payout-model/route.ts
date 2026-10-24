import { proxyRequest } from '@/lib/server/proxy';

export async function PUT(request: Request) {
  return proxyRequest(request, '/reports/settings/payout-model', 'PUT');
}
