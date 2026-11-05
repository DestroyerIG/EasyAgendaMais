// Decide quais pedidos ficam fora do limitador global (apiLimiter) do server.ts.
// A busca geral tem limitador próprio por negócio (busca.routes.ts), então sai da cota global.
export function criarApiLimiterSkip(apiV1: string, webhookPaths: string[]) {
  const caminhoBusca = `${apiV1}/busca`;
  return (req: { method: string; originalUrl: string }): boolean =>
    req.method === 'OPTIONS' ||
    // Caminho exato: com query string ou outra rota, continua contando.
    (req.method === 'POST' && req.originalUrl === caminhoBusca) ||
    webhookPaths.some((p) => req.originalUrl.startsWith(p));
}
