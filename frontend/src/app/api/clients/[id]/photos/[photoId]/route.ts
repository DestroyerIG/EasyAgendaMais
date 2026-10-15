import { proxyRequest } from '@/lib/server/proxy';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await params;
  return proxyRequest(request, `/clients/${id}/photos/${photoId}`, 'DELETE');
}
