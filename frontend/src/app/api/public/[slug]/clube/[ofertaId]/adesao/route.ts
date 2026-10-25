import { proxyRequest } from '@/lib/server/proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; ofertaId: string }> }
) {
  const { slug, ofertaId } = await params;
  return proxyRequest(request, `/public/${slug}/clube/${ofertaId}/adesao`, 'POST');
}
