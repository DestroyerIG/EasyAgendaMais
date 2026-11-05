// Escritas que continuam liberadas durante a carência: tocar o atendimento do dia,
// o caixa, a conversa com a cliente e as notificações. Todo o resto vira leitura.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const regra = (metodos: string[], caminho: string): { metodos: Set<string>; padrao: RegExp } => ({
  metodos: new Set(metodos),
  padrao: new RegExp(`^/api/v1${caminho.replaceAll(':id', UUID)}/?$`, 'i'),
});

const ESCRITAS_NA_CARENCIA = [
  regra(['PUT'], '/appointments/:id/status'),
  regra(['POST'], '/appointments/:id/comanda'),
  regra(['PUT'], '/comandas/:id'),
  regra(['POST'], '/comandas/:id/close'),
  regra(['POST'], '/comandas/:id/receipt'),
  regra(['POST'], '/cash/open'),
  regra(['POST'], '/cash/movements'),
  regra(['POST'], '/cash/close'),
  regra(['POST'], '/whatsapp/conversations/:id/messages'),
  regra(['POST'], '/whatsapp/conversations/lidas'),
  regra(['POST'], '/whatsapp/conversations/:id/assumir'),
  regra(['POST'], '/whatsapp/conversations/:id/devolver'),
  regra(['POST'], '/bancada/agendamentos/:id/iniciar'),
  regra(['PUT'], '/bancada/comandas/:id'),
  regra(['POST'], '/bancada/comandas/:id/enviar'),
  regra(['POST'], '/bancada/comandas/:id/fechar'),
  // As rotas de notificação só marcam como lida. Hoje usam PUT; PATCH e POST ficam por compatibilidade.
  regra(['PUT', 'PATCH', 'POST'], '/notifications/read-all'),
  regra(['PUT', 'PATCH', 'POST'], '/notifications/:id/read'),
  // A busca só lê: é POST para o termo não ir na URL.
  regra(['POST'], '/busca'),
];

/** `path` sem query string, com o prefixo /api/v1. */
export function escritaLiberadaNaCarencia(method: string, path: string): boolean {
  const metodo = method.toUpperCase();
  return ESCRITAS_NA_CARENCIA.some((r) => r.metodos.has(metodo) && r.padrao.test(path));
}
