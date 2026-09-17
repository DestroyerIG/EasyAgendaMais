import { describe, it, expect } from 'vitest';
import { TRIAL_DAYS } from '../config/trial.js';
import { RECURRING_TRIAL_DAYS } from '../services/stripeCheckoutService.js';

describe('prazo do teste grátis', () => {
  it('é de 14 dias', () => {
    expect(TRIAL_DAYS).toBe(14);
  });

  it('o checkout recorrente usa o mesmo prazo', () => {
    expect(RECURRING_TRIAL_DAYS).toBe(TRIAL_DAYS);
  });
});
