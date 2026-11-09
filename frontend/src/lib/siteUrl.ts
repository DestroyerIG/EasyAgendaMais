import { ensureAbsoluteUrl } from './appUrl';

// Endereço público oficial (o domínio sem www redireciona para ele).
const SITE_URL_PADRAO = 'https://www.easyagendamais.com.br';

export const siteUrl = () => ensureAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL) || SITE_URL_PADRAO;
