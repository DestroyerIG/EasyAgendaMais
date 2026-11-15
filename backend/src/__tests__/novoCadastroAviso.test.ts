import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, enviarMock } = vi.hoisted(() => ({
  prismaMock: { $queryRaw: vi.fn() },
  enviarMock: vi.fn(),
}));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: enviarMock }));

import { avisarNovoCadastro, montarMensagem, destinosDoAviso } from '../modules/admin/novoCadastro.aviso.js';

const cadastro = { businessId: 'b1', nome: 'Barbearia do Zé', dono: 'José', plano: 'profissional', whatsapp: '11999990000' };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_NOVO_CADASTRO_WHATSAPP;
  enviarMock.mockResolvedValue(true);
});

describe('aviso de novo cadastro', () => {
  it('a mensagem traz negócio, dono, plano pelo nome comercial e o WhatsApp', () => {
    const m = montarMensagem(cadastro);
    expect(m).toContain('Barbearia do Zé');
    expect(m).toContain('José');
    expect(m).toContain('Equipe');
    expect(m).toContain('11999990000');
    expect(montarMensagem({ ...cadastro, whatsapp: '' })).not.toContain('WhatsApp:');
  });

  it('usa os números da variável de ambiente, sem repetir', async () => {
    process.env.ADMIN_NOVO_CADASTRO_WHATSAPP = '5511911111111, 5511922222222,5511911111111';
    expect(await destinosDoAviso()).toEqual(['5511911111111', '5511922222222']);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('sem variável, usa o WhatsApp do negócio do platform_admin', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ whatsapp: '5511933333333' }]);
    await avisarNovoCadastro(cadastro);
    expect(enviarMock).toHaveBeenCalledTimes(1);
    expect(enviarMock.mock.calls[0][0]).toBe('5511933333333');
    expect(enviarMock.mock.calls[0][2]).toMatchObject({ origin: 'sistema' });
  });

  it('sem destino não envia e não lança', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await expect(avisarNovoCadastro(cadastro)).resolves.toBeUndefined();
    expect(enviarMock).not.toHaveBeenCalled();
  });

  it('falha no envio ou no banco nunca lança', async () => {
    process.env.ADMIN_NOVO_CADASTRO_WHATSAPP = '5511911111111';
    enviarMock.mockRejectedValue(new Error('evolution fora'));
    await expect(avisarNovoCadastro(cadastro)).resolves.toBeUndefined();
    delete process.env.ADMIN_NOVO_CADASTRO_WHATSAPP;
    prismaMock.$queryRaw.mockRejectedValue(new Error('db fora'));
    await expect(avisarNovoCadastro(cadastro)).resolves.toBeUndefined();
  });
});
