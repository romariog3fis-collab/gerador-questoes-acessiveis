import { GoogleGenAI } from '@google/genai';
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

    const genAI = new (GoogleGenAI as any)(apiKey);

    if (isRefinement) {
      const prompt = `
        VOCÊ ESTÁ REFINANDO UMA ÚNICA QUESTÃO.
        MATERIAL ORIGINAL DA QUESTÃO: ${JSON.stringify(questionToRefine)}
        COMANDO DE REFINAMENTO: ${refinementAction}
        
        RETORNE APENAS O OBJETO JSON DA QUESTÃO REFINADA (apenas o objeto {}).
      `;
      const result = await genAI.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      const responseText = result.candidates[0].content.parts[0].text;
      const cleanJson = responseText.replace(/```json\n?|```/g, '').trim();
      return NextResponse.json(JSON.parse(cleanJson));
    }

    const systemInstruction = `
      Você é um especialista em educação inclusiva e design instrucional baseada na Taxonomia de Bloom.
      Sua tarefa é ler um material de avaliação e adaptá-lo para alunos com Necessidades Educacionais Especiais (NEE).

      ESTILO DE ADAPTAÇÃO SOLICITADO:
      ${estilosAdaptacao.destacarChave ? '- Destaque informações-chave em NEGRITO.' : ''}
      ${estilosAdaptacao.dividirBlocos ? '- Divida o texto em blocos pequenos e espaçados.' : ''}
      ${estilosAdaptacao.listasMarcadores ? '- Transforme parágrafos densos em listas com marcadores.' : ''}
      ${estilosAdaptacao.titulosClaros ? '- Use títulos e subtítulos claros e hierárquicos.' : ''}
      ${estilosAdaptacao.simplificarLinguagem ? '- Use LINGUAGEM SIMPLES (evite termos complexos ou técnicos desnecessários).' : ''}

      REGRA DE BLOOM (RÉGUA DE DIFICULDADE):
      - Para ${etapaEnsino}, use prioritariamente os níveis: Lembrar, Entender e Aplicar.
      - Classifique cada questão de acordo com a Taxonomia de Bloom original.

      REGRAS DE FORMATAÇÃO:
      - MANTENHA A NUMERAÇÃO ORIGINAL DAS QUESTÕES.
      - Se "Caixa Alta" estiver ON: Todo o conteúdo textual deve ser em MAIÚSCULAS.
      - Se "Gerar Ilustrações" estiver ON: Inclua um imagePrompt técnico em inglês, focado em clipart, fundo branco, estilo vetor flat.

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

    let parts: any[] = [];
    if (fileBase64) {
      parts.push({ inlineData: { data: fileBase64, mimeType: fileType || 'application/pdf' } });
    }
    parts.push({ text: `CONTEÚDO/CONTEXTO: ${material}\nADAPTAÇÕES: ${adaptacoes}\nANO: ${ano}\nETAPA: ${etapaEnsino}\nCAIXA ALTA: ${caixaAlta ? 'SIM' : 'NÃO'}\nIMAGENS: ${gerarImagensIA ? 'SIM' : 'NÃO'}` });

    const result = await genAI.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: [{ role: 'user', parts }],
      config: { 
        systemInstruction,
        responseMimeType: "application/json" 
      }
    });

    const responseText = result.candidates[0].content.parts[0].text;
    const cleanJson = responseText.replace(/```json\n?|```/g, '').trim();
    
    return NextResponse.json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}
