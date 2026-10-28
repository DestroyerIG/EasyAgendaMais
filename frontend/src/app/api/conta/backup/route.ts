import { NextResponse } from 'next/server';
import { buildHeaders } from '@/lib/server/proxy';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:5000/api/v1';

// O backup é um zip: o proxy comum lê o corpo como texto e corromperia o arquivo, então este repassa os bytes.
export async function GET(request: Request) {
  try {
    // Mesmos headers do proxy comum: IP, agente e request id chegam à auditoria do backup.
    const headers = buildHeaders(request);

    const upstream = await fetch(`${BACKEND_URL}/conta/backup`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
    });

    const responseHeaders = new Headers();
    for (const nome of ['content-type', 'content-disposition']) {
      const valor = upstream.headers.get(nome);
      if (valor) responseHeaders.set(nome, valor);
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Backup proxy failed', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { success: false, message: 'Erro ao comunicar com o backend' },
      { status: 502 },
    );
  }
}
