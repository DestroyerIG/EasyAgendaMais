import { describe, it, expect, vi } from 'vitest';

const crm = vi.hoisted(() => ({ profile: vi.fn(), timeline: vi.fn(), saveTechnicalSheet: vi.fn(), setConsent: vi.fn() }));
const tags = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), setClientTags: vi.fn() }));
vi.mock('../modules/crm/crm.service.js', () => ({ crmService: crm }));
vi.mock('../modules/tags/tags.service.js', () => ({ tagsService: tags }));

const c = await import('../modules/crm/crm.controller.js');
const t = await import('../modules/tags/tags.controller.js');

const chamar = async (h: (...a: never[]) => Promise<void>, id: string, body: unknown = {}) => {
  const next = vi.fn();
  const req = { params: { id }, query: {}, body, user: { businessId: 'b1', userId: 'u1' } };
  await (h as unknown as (r: unknown, s: unknown, n: unknown) => Promise<void>)(req, {}, next);
  return next;
};

describe(':id que não é UUID responde 404 e não chega ao serviço', () => {
  it.each([
    ['getProfile', c.getProfile, 'Cliente não encontrado'],
    ['getTimeline', c.getTimeline, 'Cliente não encontrado'],
    ['putTechnicalSheet', c.putTechnicalSheet, 'Cliente não encontrado'],
    ['postConsent', c.postConsent, 'Cliente não encontrado'],
    ['putClientTags', t.putClientTags, 'Cliente não encontrado'],
    ['updateTag', t.updateTag, 'Etiqueta não encontrado'],
    ['deleteTag', t.deleteTag, 'Etiqueta não encontrado'],
  ])('%s', async (_n, h, msg) => {
    const next = await chamar(h as never, 'abc', { granted: true, tagIds: [], values: {} });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404, message: msg });
    for (const fn of [...Object.values(crm), ...Object.values(tags)]) expect(fn).not.toHaveBeenCalled();
  });
});
