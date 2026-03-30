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

      ESTILO DE ADAPTAÇÃO SOLICITADO:
      ${estilosAdaptacao.destacarChave ? '- Destaque informações-chave em NEGRITO.' : ''}
      ${estilosAdaptacao.dividirBlocos ? '- Divida o texto em blocos pequenos e espaçados.' : ''}
      ${estilosAdaptacao.listasMarcadores ? '- Transforme parágrafos densos em listas com marcadores.' : ''}
      ${estilosAdaptacao.titulosClaros ? '- Use títulos e subtítulos claros e hierárquicos.' : ''}
      ${estilosAdaptacao.simplificarLinguagem ? '- Use LINGUAGEM SIMPLES.' : ''}

      REGRA DE BLOOM:
      - Para ${etapaEnsino}, use prioritariamente os níveis: Lembrar, Entender e Aplicar.

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

    const model = 'gemini-1.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

    let contents: any[] = [];
    if (isRefinement) {
      const prompt = `
        VOCÊ ESTÁ REFINANDO UMA ÚNICA QUESTÃO.
        MATERIAL ORIGINAL DA QUESTÃO: ${JSON.stringify(questionToRefine)}
        COMANDO DE REFINAMENTO: ${refinementAction}
        RETORNE APENAS O OBJETO {}.
      `;
      contents = [{ role: 'user', parts: [{ text: prompt }] }];
    } else {
      let parts: any[] = [];
      if (fileBase64) {
        parts.push({ inlineData: { data: fileBase64, mimeType: fileType || 'application/pdf' } });
      }
      parts.push({ text: `CONTEÚDO: ${material}\nADAPTAÇÕES: ${adaptacoes}\nANO: ${ano}\nETAPA: ${etapaEnsino}\nCAIXA ALTA: ${caixaAlta ? 'SIM' : 'NÃO'}\nIMAGENS: ${gerarImagensIA ? 'SIM' : 'NÃO'}` });
      contents = [{ role: 'user', parts }];
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
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
