import { describe, it, expect } from 'vitest'
import { podeMostrarPopup, classificarEnvio, nomeSugerido } from '../modules/depoimentos/depoimentos.rules.js'

const DIA = 24 * 60 * 60 * 1000
const agora = new Date('2026-11-04T12:00:00Z')

const base = {
  role: 'tenant_admin',
  subscriptionStatus: 'active',
  negocioCriadoEm: new Date(agora.getTime() - 14 * DIA),
  concluidos: 10,
  pedido: null as { adiadoAte: Date | null; dispensadoEm: Date | null } | null,
  temEnvio: false,
  agora,
}

describe('podeMostrarPopup', () => {
  it('true no caso elegível', () => {
    expect(podeMostrarPopup(base)).toBe(true)
  })

  it.each([
    ['role professional', { role: 'professional' }],
    ['trialing', { subscriptionStatus: 'trialing' }],
    ['past_due', { subscriptionStatus: 'past_due' }],
    ['13 dias', { negocioCriadoEm: new Date(agora.getTime() - 13 * DIA) }],
    ['13 dias e 23h', { negocioCriadoEm: new Date(agora.getTime() - 13 * DIA - 23 * 3600 * 1000) }],
    ['9 concluídos', { concluidos: 9 }],
    ['adiado no futuro', { pedido: { adiadoAte: new Date(agora.getTime() + DIA), dispensadoEm: null } }],
    ['dispensado', { pedido: { adiadoAte: null, dispensadoEm: new Date(agora.getTime() - DIA) } }],
    ['já enviou', { temEnvio: true }],
  ])('false: %s', (_n, over) => {
    expect(podeMostrarPopup({ ...base, ...over })).toBe(false)
  })

  it('true quando adiadoAte já passou', () => {
    expect(
      podeMostrarPopup({ ...base, pedido: { adiadoAte: new Date(agora.getTime() - DIA), dispensadoEm: null } }),
    ).toBe(true)
  })
})

describe('classificarEnvio', () => {
  it('pendente / interno', () => {
    expect(classificarEnvio({ nota: 5, autorizou: true })).toBe('pendente')
    expect(classificarEnvio({ nota: 4, autorizou: false })).toBe('interno')
    expect(classificarEnvio({ nota: 3, autorizou: true })).toBe('interno')
  })
})

describe('nomeSugerido', () => {
  it('formata o nome', () => {
    expect(nomeSugerido('Diego Martins Souza')).toBe('Diego M.')
    expect(nomeSugerido('Ana')).toBe('Ana')
    expect(nomeSugerido('  maria   da silva ')).toBe('Maria S.')
    expect(nomeSugerido('   ')).toBe('')
  })
})
