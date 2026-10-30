import { proxyArquivo } from '@/lib/server/proxy';

// Pasta com ponto no nome: o Next serve /api/admin/tenants/export.csv aqui, antes de [id].
export async function GET(request: Request) {
  return proxyArquivo(request, '/admin/tenants/export.csv');
}
