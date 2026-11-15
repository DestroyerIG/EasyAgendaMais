import { prisma } from '../../config/prisma.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/index.js';
import logger from '../../utils/logger.js';

// Aviso por WhatsApp ao(s) administrador(es) da plataforma quando um negócio novo é criado.
// Nunca derruba o cadastro: qualquer falha só vira log.

export interface NovoCadastro {
  businessId: string;
  nome: string;
  dono: string;
  plano: string;
  whatsapp?: string | null;
}

const ROTULO_PLANO: Record<string, string> = { basico: 'Solo', profissional: 'Equipe', premium: 'Salão' };

export function montarMensagem(c: NovoCadastro): string {
  const linhas = [
    '🎉 *Novo cadastro no EasyAgenda+*',
    '',
    `*Negócio:* ${c.nome}`,
    `*Dono:* ${c.dono}`,
    `*Plano escolhido:* ${ROTULO_PLANO[c.plano] ?? c.plano}`,
  ];
  if (c.whatsapp) linhas.push(`*WhatsApp:* ${c.whatsapp}`);
  return linhas.join('\n');
}

/**
 * Destinos: ADMIN_NOVO_CADASTRO_WHATSAPP (números separados por vírgula) e, se vazio, o WhatsApp
 * do negócio de cada platform_admin.
 */
export async function destinosDoAviso(): Promise<string[]> {
  const env = (process.env.ADMIN_NOVO_CADASTRO_WHATSAPP ?? '').split(',').map((n) => n.trim()).filter(Boolean);
  if (env.length > 0) return [...new Set(env)];
  const rows = await prisma.$queryRaw<Array<{ whatsapp: string | null }>>`
    SELECT DISTINCT b.whatsapp
    FROM businesses b
    JOIN users u ON u.business_id = b.id AND u.role = 'platform_admin'
    WHERE b.whatsapp IS NOT NULL AND b.whatsapp <> ''
  `;
  return rows.map((r) => String(r.whatsapp));
}

export async function avisarNovoCadastro(c: NovoCadastro): Promise<void> {
  try {
    const destinos = await destinosDoAviso();
    if (destinos.length === 0) {
      logger.warn({ businessId: c.businessId }, 'Aviso de novo cadastro sem destino (defina ADMIN_NOVO_CADASTRO_WHATSAPP)');
      return;
    }
    const texto = montarMensagem(c);
    for (const numero of destinos) {
      const ok = await sendWhatsAppMessage(numero, texto, { origin: 'sistema', eventName: 'novo_cadastro' });
      if (!ok) logger.warn({ businessId: c.businessId }, 'Aviso de novo cadastro não enviado pelo WhatsApp');
    }
  } catch (error) {
    logger.error({ err: error, businessId: c.businessId }, 'Falha ao avisar novo cadastro');
  }
}
