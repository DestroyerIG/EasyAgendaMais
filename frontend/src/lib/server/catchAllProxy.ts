import { proxyRequest } from '@/lib/server/proxy';

type Ctx = { params: Promise<{ path?: string[] }> };

/**
 * Handlers de um proxy `[...path]` para um módulo inteiro do backend (fase 5: bancada, equipe,
 * push, avaliações). Cada segmento é codificado de novo para não abrir caminho para fora do módulo.
 */
export function catchAllProxy(modulo: string) {
  const handler = async (request: Request, { params }: Ctx) => {
    const { path = [] } = await params;
    const resto = path.map((p) => encodeURIComponent(p)).join('/');
    return proxyRequest(request, resto ? `/${modulo}/${resto}` : `/${modulo}`);
  };
  return { GET: handler, POST: handler, PUT: handler, DELETE: handler };
}
