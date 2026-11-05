export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const digitos = (s: string) => s.replace(/\D/g, '');
