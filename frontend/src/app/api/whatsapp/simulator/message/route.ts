import { NextResponse } from 'next/server';
import { proxyRequest } from '@/lib/server/proxy';

const normalizeBusinessId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

export async function POST(request: Request) {
  try {
    const body = await request.clone().json();
    const businessId = normalizeBusinessId(body?.businessId);

    if (!businessId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Campo businessId e obrigatorio para o simulador do WhatsApp.',
          error: {
            code: 'WHATSAPP_SIMULATOR_BUSINESS_REQUIRED',
            message: 'Campo businessId e obrigatorio para o simulador do WhatsApp.',
          },
        },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: 'Payload JSON invalido para o simulador do WhatsApp.',
        error: {
          code: 'WHATSAPP_SIMULATOR_INVALID_PAYLOAD',
          message: 'Payload JSON invalido para o simulador do WhatsApp.',
        },
      },
      { status: 400 }
    );
  }

  return proxyRequest(request, '/whatsapp/simulator/message', 'POST');
}
