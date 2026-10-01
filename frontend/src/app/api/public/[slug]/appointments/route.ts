import { proxyRequest } from '@/lib/server/proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return proxyRequest(request, `/public/${slug}/appointments`, 'POST');
}
