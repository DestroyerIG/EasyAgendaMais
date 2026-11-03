import { proxyArquivo } from '@/lib/server/proxy';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyArquivo(request, `/admin/tenants/${id}/auditoria.csv`);
}
