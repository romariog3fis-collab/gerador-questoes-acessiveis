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

    // ESTRATÉGIA DE COMPATIBILIDADE TOTAL: REGRAS DENTRO DO PROMPT
    const promptRegras = `
      VOCÊ É UM ESPECIALISTA EM EDUCAÇÃO INCLUSIVA.
      Sua tarefa é ler um material de avaliação e adaptá-lo para alunos com Necessidades Educacionais Especiais (NEE).

      ESTILO DE ADAPTAÇÃO:
      ${estilosAdaptacao?.destacarChave ? '- Destaque informações-chave em NEGRITO.' : ''}
      ${estilosAdaptacao?.dividirBlocos ? '- Divida o texto em blocos pequenos e espaçados.' : ''}
      ${estilosAdaptacao?.listasMarcadores ? '- Transforme parágrafos densos em listas com marcadores.' : ''}
      ${estilosAdaptacao?.simplificarLinguagem ? '- Use LINGUAGEM SIMPLES.' : ''}

      REGRA DE BLOOM: Para ${etapaEnsino}, use prioritariamente: Lembrar, Entender e Aplicar.

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
      
      RETORNE APENAS O JSON, SEM COMENTÁRIOS ADICIONAIS.
    `;

    const baseUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let contents: any[] = [];
    if (isRefinement) {
      const prompt = `
        INSTRUÇÕES: ${promptRegras}
        REFINANDO QUESTÃO: ${JSON.stringify(questionToRefine)}
        AÇÃO: ${refinementAction}
      `;
      contents = [{ role: 'user', parts: [{ text: prompt }] }];
    } else {
      let parts: any[] = [];
      if (fileBase64) {
        parts.push({ inlineData: { data: fileBase64, mimeType: fileType || 'application/pdf' } });
      }
      parts.push({ text: `REGRAS: ${promptRegras}\nMATERIAL: ${material}\nADAPTAÇÕES: ${adaptacoes}\nANO: ${ano}\nETAPA: ${etapaEnsino}\nCAIXA ALTA: ${caixaAlta ? 'SIM' : 'NÃO'}` });
      contents = [{ role: 'user', parts }];
    }

    // ENVIANDO APENAS O CAMPO 'contents' (O MAIS BÁSICO E COMPATÍVEL)
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
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
