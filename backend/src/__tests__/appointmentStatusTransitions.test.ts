import { describe, it, expect } from 'vitest';
import { VALID_STATUS_TRANSITIONS } from '../modules/appointments/appointments.types.js';

describe('VALID_STATUS_TRANSITIONS', () => {
  it('permite ir de aguardando_pagamento para confirmado ou cancelado', () => {
    expect(VALID_STATUS_TRANSITIONS['aguardando_pagamento']).toEqual([
      'confirmado',
      'cancelado',
    ]);
  });

  it('não permite transições a partir de aguardando_pagamento além das duas permitidas', () => {
    expect(VALID_STATUS_TRANSITIONS['aguardando_pagamento']).not.toContain('concluido');
  });
});
