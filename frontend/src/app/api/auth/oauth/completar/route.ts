import type { NextRequest } from 'next/server';
import { encaminharOAuth } from '@/lib/server/oauthBff';

export async function POST(request: NextRequest) {
  return encaminharOAuth('oauth/completar', request);
}
