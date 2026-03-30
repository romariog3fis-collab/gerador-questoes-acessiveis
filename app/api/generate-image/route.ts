import { NextRequest, NextResponse } from 'next/server';

// Timeout helper
const fetchWithTimeout = async (url: string, timeoutMs = 25000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const prompt = searchParams.get('prompt');
  const width = searchParams.get('width') || '1024';
  const height = searchParams.get('height') || '768';
  const seed = searchParams.get('seed') || Math.floor(Math.random() * 999999).toString();

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const encodedPrompt = encodeURIComponent(prompt.substring(0, 450).trim());

  // Cadeia de fallback: 3 endpoints públicos gratuitos do Pollinations
  const endpoints = [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=turbo`,
    `https://pollinations.ai/p/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`,
  ];

  for (const url of endpoints) {
    try {
      console.log(`[ImageGen] Tentando: ${url.substring(0, 80)}...`);
      const response = await fetchWithTimeout(url, 28000);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        if (contentType.includes('image')) {
          const arrayBuffer = await response.arrayBuffer();
          console.log(`[ImageGen] Sucesso! Content-Type: ${contentType}`);
          return new NextResponse(Buffer.from(arrayBuffer), {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400',
            },
          });
        }
      }
      console.warn(`[ImageGen] Endpoint falhou (${response.status}): ${url.substring(0, 60)}`);
    } catch (err: any) {
      console.error(`[ImageGen] Erro no endpoint: ${err.message}`);
    }
  }

  return NextResponse.json(
    { error: 'Não foi possível gerar a imagem. Tente novamente.' },
    { status: 502 }
  );
}
