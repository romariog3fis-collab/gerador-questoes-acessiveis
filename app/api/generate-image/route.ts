import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const prompt = searchParams.get('prompt');
  const width = searchParams.get('width') || '1024';
  const height = searchParams.get('height') || '768';
  const seed = searchParams.get('seed') || Math.floor(Math.random() * 1000000).toString();
  const model = searchParams.get('model') || 'flux';
  const nologo = searchParams.get('nologo') || 'true';

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const apiKey = process.env.POLLINATIONS_API_KEY;
  
  // Lista de modelos para tentar em ordem de preferência (Fallback Chain)
  // O Pollinations às vezes fica instável em modelos específicos
  const models = ['flux', 'turbo', 'unity'];
  
  for (const model of models) {
    try {
      // Construímos a URL para o Pollinations
      // gen.pollinations.ai é o endpoint otimizado para API
      const pollinationsUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=${nologo}&seed=${seed}&model=${model}`;
      
      console.log(`[Pollinations] Tentando modelo: ${model}`);
      
      const response = await fetch(pollinationsUrl, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
        // Adicionamos um timeout implícito via sinal se necessário, 
        // mas o fetch padrão do Next.js já lida com cache e timeouts razoáveis
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        
        // Verificamos se realmente recebemos uma imagem
        if (contentType && contentType.includes('image')) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          console.log(`[Pollinations] Sucesso com modelo: ${model}`);

          return new NextResponse(buffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=43200',
              'X-Generated-By': 'Pollinations-Bridge',
              'X-Model-Used': model
            },
          });
        }
      }
      
      const errorMsg = await response.text().catch(() => 'Erro desconhecido');
      console.warn(`[Pollinations] Modelo ${model} falhou (Status ${response.status}): ${errorMsg.substring(0, 100)}`);
    } catch (error) {
      console.error(`[Pollinations] Erro na tentativa com ${model}:`, error);
    }
  }

  // Fallback final: Tentar o endpoint público padrão se os modelos específicos falharem
  try {
    const fallbackUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    const response = await fetch(fallbackUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return new NextResponse(Buffer.from(arrayBuffer), {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
  } catch (e) {
    console.error("[Pollinations] Falha crítica em todos os endpoints", e);
  }

  return NextResponse.json(
    { error: 'Não foi possível gerar a imagem no momento. Tente novamente mais tarde.' }, 
    { status: 502 }
  );
}
