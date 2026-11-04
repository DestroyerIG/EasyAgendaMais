import { prisma } from '../../config/prisma.js';

// SQL cru: as tabelas depoimentos e depoimento_pedidos não passam pelo cliente tipado.
// atualizado_em não tem gatilho: todo UPDATE precisa gravá-lo.

type Tx = Pick<typeof prisma, '$executeRaw'>;

export interface NegocioLinha {
  subscription_status: string;
  created_at: Date;
  owner_name: string;
  name: string;
  logo_url: string | null;
}
export interface AtualLinha {
  status: string;
  nota: number | bigint;
  texto: string;
  nome_exibido: string | null;
  cidade: string | null;
}
export interface PedidoLinha {
  adiado_ate: Date | null;
  dispensado_em: Date | null;
}
export interface NovoEnvio {
  businessId: string;
  negocioNome: string;
  logoUrl: string | null;
  nota: number;
  texto: string;
  nomeExibido: string | null;
  cidade: string | null;
  autorizou: boolean;
  autorizadoEm: Date | null;
  status: 'pendente' | 'interno';
}

export interface AdminLinha {
  id: string;
  negocio_nome: string;
  business_id: string | null;
  plano: string | null;
  nome_exibido: string | null;
  cidade: string | null;
  nota: number | bigint;
  texto: string;
  texto_original: string | null;
  autorizado_em: Date | null;
  criado_em: Date;
  status: string;
}
export interface Transicionada {
  id: string;
  business_id: string | null;
}

export const depoimentosRepository = {
  async negocio(businessId: string): Promise<NegocioLinha | null> {
    const r = await prisma.$queryRaw<NegocioLinha[]>`
      SELECT subscription_status, created_at, owner_name, name, logo_url
      FROM businesses WHERE id = ${businessId}::uuid`;
    return r[0] ?? null;
  },

  async concluidos(businessId: string): Promise<number> {
    const r = await prisma.$queryRaw<{ total: number | bigint }[]>`
      SELECT count(*)::int AS total FROM appointments
      WHERE business_id = ${businessId}::uuid AND status = 'concluido'`;
    return Number(r[0]?.total ?? 0);
  },

  async pedido(businessId: string): Promise<PedidoLinha | null> {
    const r = await prisma.$queryRaw<PedidoLinha[]>`
      SELECT adiado_ate, dispensado_em FROM depoimento_pedidos WHERE business_id = ${businessId}::uuid`;
    return r[0] ?? null;
  },

  async temEnvio(businessId: string): Promise<boolean> {
    const r = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM depoimentos WHERE business_id = ${businessId}::uuid LIMIT 1`;
    return r.length > 0;
  },

  /** Linha mais recente do negócio que não foi substituída. */
  async atual(businessId: string): Promise<AtualLinha | null> {
    const r = await prisma.$queryRaw<AtualLinha[]>`
      SELECT status, nota, texto, nome_exibido, cidade FROM depoimentos
      WHERE business_id = ${businessId}::uuid AND status <> 'substituido'
      ORDER BY criado_em DESC LIMIT 1`;
    return r[0] ?? null;
  },

  /** Marca as linhas anteriores como substituídas e insere a nova, numa transação só. */
  enviar(e: NovoEnvio): Promise<void> {
    return prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`
        UPDATE depoimentos SET status = 'substituido', atualizado_em = now()
        WHERE business_id = ${e.businessId}::uuid AND status <> 'substituido'`;
      await tx.$executeRaw`
        INSERT INTO depoimentos
          (business_id, negocio_nome, logo_url, nota, texto, texto_original, nome_exibido, cidade,
           autorizou, autorizado_em, status)
        VALUES
          (${e.businessId}::uuid, ${e.negocioNome}, ${e.logoUrl}, ${e.nota}::smallint, ${e.texto}, ${e.texto},
           ${e.nomeExibido}, ${e.cidade}, ${e.autorizou}, ${e.autorizadoEm}::timestamptz, ${e.status})`;
    });
  },

  async adiar(businessId: string, ate: Date): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO depoimento_pedidos (business_id, adiado_ate) VALUES (${businessId}::uuid, ${ate}::timestamptz)
      ON CONFLICT (business_id) DO UPDATE SET adiado_ate = EXCLUDED.adiado_ate`;
  },

  async dispensar(businessId: string, em: Date): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO depoimento_pedidos (business_id, dispensado_em) VALUES (${businessId}::uuid, ${em}::timestamptz)
      ON CONFLICT (business_id) DO UPDATE SET dispensado_em = EXCLUDED.dispensado_em`;
  },

  async retirar(businessId: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE depoimentos SET status = 'retirado', atualizado_em = now()
      WHERE business_id = ${businessId}::uuid AND status IN ('publicado', 'pendente')`;
  },

  // ---- SuperAdmin ----

  /** Fila de pendentes: mais antigo primeiro (FIFO). As demais abas: mais recente primeiro. */
  async listarAdmin(statuses: string[], maisAntigoPrimeiro: boolean): Promise<AdminLinha[]> {
    if (maisAntigoPrimeiro) {
      return prisma.$queryRaw<AdminLinha[]>`
        SELECT d.id, d.negocio_nome, d.business_id, b.plan AS plano, d.nome_exibido, d.cidade, d.nota, d.texto,
               d.texto_original, d.autorizado_em, d.criado_em, d.status
        FROM depoimentos d LEFT JOIN businesses b ON b.id = d.business_id
        WHERE d.status = ANY(${statuses}::text[]) ORDER BY d.criado_em ASC`;
    }
    return prisma.$queryRaw<AdminLinha[]>`
      SELECT d.id, d.negocio_nome, d.business_id, b.plan AS plano, d.nome_exibido, d.cidade, d.nota, d.texto,
             d.texto_original, d.autorizado_em, d.criado_em, d.status
      FROM depoimentos d LEFT JOIN businesses b ON b.id = d.business_id
      WHERE d.status = ANY(${statuses}::text[]) ORDER BY d.criado_em DESC`;
  },

  async contarPublicados(): Promise<number> {
    const r = await prisma.$queryRaw<{ total: number | bigint }[]>`
      SELECT count(*)::int AS total FROM depoimentos WHERE status = 'publicado'`;
    return Number(r[0]?.total ?? 0);
  },

  async publicar(id: string, adminId: string): Promise<Transicionada | null> {
    const r = await prisma.$queryRaw<Transicionada[]>`
      UPDATE depoimentos
      SET status = 'publicado', publicado_em = now(), publicado_por = ${adminId}::uuid, atualizado_em = now()
      WHERE id = ${id}::uuid AND status = 'pendente'
      RETURNING id, business_id`;
    return r[0] ?? null;
  },

  async recusar(id: string): Promise<Transicionada | null> {
    const r = await prisma.$queryRaw<Transicionada[]>`
      UPDATE depoimentos SET status = 'recusado', atualizado_em = now()
      WHERE id = ${id}::uuid AND status = 'pendente'
      RETURNING id, business_id`;
    return r[0] ?? null;
  },

  async corrigir(id: string, texto: string): Promise<Transicionada | null> {
    const r = await prisma.$queryRaw<Transicionada[]>`
      UPDATE depoimentos
      SET texto_original = COALESCE(texto_original, texto), texto = ${texto}, atualizado_em = now()
      WHERE id = ${id}::uuid AND status IN ('pendente', 'publicado')
      RETURNING id, business_id`;
    return r[0] ?? null;
  },

  async statusDe(id: string): Promise<string | null> {
    const r = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status FROM depoimentos WHERE id = ${id}::uuid`;
    return r[0]?.status ?? null;
  },
};
