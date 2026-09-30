import { describe, it, expect } from 'vitest';
import { slugify, isValidSlug } from '../modules/businessPublicPage/businessPublicPage.service.js';

describe('slugify', () => {
  it('normaliza nome do negócio para um slug válido', () => {
    expect(slugify('Studio Aurora & Unhas')).toBe('studio-aurora-unhas');
  });

  it('remove acentos', () => {
    expect(slugify('Espaço Lumé Estética')).toBe('espaco-lume-estetica');
  });
});

describe('isValidSlug', () => {
  it('aceita apenas letras minúsculas, números e hífen', () => {
    expect(isValidSlug('studio-aurora')).toBe(true);
    expect(isValidSlug('Studio Aurora')).toBe(false);
    expect(isValidSlug('studio_aurora')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });
});
