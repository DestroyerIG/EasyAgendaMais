import { proxyRequest } from '@/lib/server/proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  return proxyRequest(request, `/public/${slug}/appointments/${id}/infinitepay`, 'POST');
}
