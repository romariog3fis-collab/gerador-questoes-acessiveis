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
  
  // No Vercel, o usuário deve configurar POLLINATIONS_API_KEY
  // Localmente, pegamos do .env.local
  
  const authParam = apiKey ? `&key=${apiKey}` : '';
  
  // Construímos a URL final do Pollinations
  const pollinationsUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=${nologo}&seed=${seed}&model=${model}${authParam}`;

  // Redirecionamos para a URL do Pollinations (o navegador fará o trabalho de carregar a imagem)
  // Isso funciona bem para tags <img> e mantém a chave no servidor durante a construção da URL
  return NextResponse.redirect(pollinationsUrl);
}
