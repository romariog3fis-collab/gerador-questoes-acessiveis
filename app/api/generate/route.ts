import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { 
      material, 
      adaptacoes, 
      ano, 
      etapaEnsino, 
      estilosAdaptacao, 
      caixaAlta, 
      gerarImagensIA,
      fileBase64,
      fileType,
      isRefinement,
      refinementAction,
      questionToRefine
    } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key não configurada no servidor.' }, { status: 500 });
    }

    const systemInstruction = `
      Você é um especialista em educação inclusiva e design instrucional baseada na Taxonomia de Bloom.
      Sua tarefa é ler um material de avaliação e adaptá-lo para alunos com Necessidades Educacionais Especiais (NEE).

      ESTILO DE ADAPTAÇÃO:
      - Destaque informações-chave em NEGRITO.
      - Divida o texto em blocos pequenos.
      - Use LINGUAGEM SIMPLES.

      REGRA DE BLOOM: Use prioritariamente: Lembrar, Entender e Aplicar.

      FORMATO JSON (OBRIGATÓRIO):
      {
        "title": "...",
        "studentInfo": true,
        "overallAEEInfo": "...",
        "questions": [
          {
            "id": "...",
            "originalNumber": "...",
            "bloomLevel": "...",
            "content": "...",
            "type": "multiple_choice | essay",
            "answer": "...",
            "justification": "...",
            "imagePrompt": "...",
            "glossary": [{"word": "...", "meaning": "..."}],
            "steps": ["..."]
          }
        ]
      }
    `;

    // ENDPOINT NATIVO v1 (PARA EVITAR ERROS DE VERSÃO DA SDK)
    const baseUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let contents: any[] = [];
    if (isRefinement) {
      const prompt = `
        VOCÊ ESTÁ REFINANDO UMA ÚNICA QUESTÃO.
        MATERIAL ORIGINAL: ${JSON.stringify(questionToRefine)}
        COMANDO: ${refinementAction}
        RETORNE APENAS O OBJETO {}.
      `;
      contents = [{ role: 'user', parts: [{ text: prompt }] }];
    } else {
      let parts: any[] = [];
      if (fileBase64) {
        parts.push({ inline_data: { data: fileBase64, mime_type: fileType || 'application/pdf' } });
      }
      parts.push({ text: `CONTEÚDO: ${material}\nADAPTAÇÕES: ${adaptacoes}\nANO: ${ano}\nETAPA: ${etapaEnsino}\nCAIXA ALTA: ${caixaAlta ? 'SIM' : 'NÃO'}` });
      contents = [{ role: 'user', parts }];
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        system_instruction: { parts: [{ text: systemInstruction }] },
        generation_config: { response_mime_type: "application/json" }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Gemini API Error Payload:', data);
      return NextResponse.json({ error: data.error?.message || 'Erro na API do Gemini.' }, { status: response.status });
    }

    const responseText = data.candidates[0].content.parts[0].text;
    const cleanJson = responseText.replace(/```json\n?|```/g, '').trim();
    
    return NextResponse.json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}
