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

    const rawKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const apiKey = rawKey?.trim();

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key não configurada no servidor.' }, { status: 500 });
    }

    // ============================================================
    // DETECÇÃO DE PERFIS NEE
    // ============================================================
    const adaptacoesLower = (adaptacoes || '').toLowerCase();
    const temDiscalculia  = adaptacoesLower.includes('discalculia');
    const temTDAH         = adaptacoesLower.includes('tdah');
    const temDislexia     = adaptacoesLower.includes('dislexia');
    const temTEA          = adaptacoesLower.includes('autismo') || adaptacoesLower.includes('tea');
    const temDefVisual    = adaptacoesLower.includes('visual');
    const temDefIntelectual = adaptacoesLower.includes('intelectual');

    // Instruções específicas por perfil NEE
    const instrucoesPerfil: string[] = [];

    if (temDiscalculia) instrucoesPerfil.push(`
PERFIL ATIVO: DISCALCULIA
- ELIMINE ou REDUZA questões que exijam cálculo numérico puro (somas, divisões, equações longas).
- SUBSTITUA questões de cálculo por questões de raciocínio QUALITATIVO (ex: "O que acontece quando...", "Qual é MAIOR?", "Em que situação...").
- Quando for INEVITÁVEL manter um cálculo, forneça os números já calculados e peça apenas INTERPRETAÇÃO do resultado.
- Prefira questões de associação, ordenação e conceito em vez de operações numéricas.
- Use analogias do cotidiano (ex: "É como dividir uma pizza entre amigos").`);

    if (temTDAH) instrucoesPerfil.push(`
PERFIL ATIVO: TDAH
- Questões CURTAS e DIRETAS — máximo 3 linhas de enunciado.
- Uma única ideia por questão, sem múltiplas partes.
- Elimine informações irrelevantes.
- Use NEGRITO para destacar a palavra-chave central da pergunta.
- Prefira questões objetivas com alternativas curtas e claramente distintas.`);

    if (temDislexia) instrucoesPerfil.push(`
PERFIL ATIVO: DISLEXIA
- Frases curtas (máx. 15 palavras), vocabulário simples e frequente.
- Use listas com marcadores em vez de parágrafos longos.
- Repita informações-chave de formas diferentes no enunciado.
- Ofereça glossário amplo para todos os termos técnicos.`);

    if (temTEA) instrucoesPerfil.push(`
PERFIL ATIVO: TEA (AUTISMO)
- Linguagem LITERAL e sem ambiguidade — evite metáforas e duplos sentidos.
- Estrutura padronizada e previsível para todas as questões.
- Evite questões que dependam de interpretação social ou emocional.
- Use exemplos concretos e situações do cotidiano próximas ao aluno.
- Inclua "Passo a passo" de como responder cada questão.`);

    if (temDefVisual) instrucoesPerfil.push(`
PERFIL ATIVO: DEFICIÊNCIA VISUAL
- Elimine referências a gráficos, imagens ou mapas sem fornecer descrição textual completa.
- Descreva dados visuais verbalmente (ex: "A tabela mostra que o valor X é 30 e o valor Y é 70").
- Use referências espaciais verbais claras (ex: "no primeiro item da lista").`);

    if (temDefIntelectual) instrucoesPerfil.push(`
PERFIL ATIVO: DEFICIÊNCIA INTELECTUAL
- Linguagem do cotidiano — frases de até 10 palavras.
- Use no máximo 2 alternativas (A e B) por questão objetiva.
- Ilustre cada questão com um exemplo da vida real antes do enunciado.
- Foco exclusivo em Lembrar e Entender (Taxonomia de Bloom).
- Evite abstrações — use sempre objetos, lugares e situações reais.`);

    // ============================================================
    // PROMPT PEDAGÓGICO ESPECIALIZADO
    // ============================================================
    const promptRegras = `
VOCÊ É UM ESPECIALISTA SÊNIOR EM EDUCAÇÃO INCLUSIVA E PEDAGOGIA ADAPTADA.

════ MISSÃO PRINCIPAL ════
Adapte o material de avaliação conforme as instruções do campo ADAPTAÇÕES, que têm MÁXIMA PRIORIDADE.

════ CONTROLE DE QUESTÕES — REGRAS ABSOLUTAS ════
1. Se o campo ADAPTAÇÕES indicar um número de questões (ex: "8 questões", "reduzir para 5"), gere EXATAMENTE esse número.
2. Se o campo ADAPTAÇÕES indicar o número de alternativas (ex: "3 alternativas", "itens a, b, c", "abc"), use EXATAMENTE esse número de alternativas em todas as questões objetivas.
3. Se não houver instrução explícita, mantenha a quantidade original.
4. Selecione as questões de MAIOR RELEVÂNCIA pedagógica para o perfil do aluno.

════ INSTRUÇÕES ESPECÍFICAS POR PERFIL ════
${instrucoesPerfil.length > 0 ? instrucoesPerfil.join('\n') : '- Aplique adaptações gerais de acessibilidade para o perfil informado.'}

════ ESTILO PEDAGÓGICO ════
${estilosAdaptacao?.destacarChave ? '- Destaque informações-chave em **NEGRITO**.' : ''}
${estilosAdaptacao?.dividirBlocos ? '- Divida o texto em blocos pequenos e espaçados.' : ''}
${estilosAdaptacao?.listasMarcadores ? '- Transforme parágrafos densos em listas com marcadores.' : ''}
${estilosAdaptacao?.simplificarLinguagem ? '- Use LINGUAGEM SIMPLES E ACESSÍVEL.' : ''}
${caixaAlta ? '- Escreva TODO O TEXTO EM LETRAS MAIÚSCULAS.' : ''}

════ TAXONOMIA DE BLOOM ════
Para ${etapaEnsino || 'Ensino Fundamental'}, priorize: Lembrar, Entender e Aplicar.

════ FORMATO DE SAÍDA — JSON PURO ════
Retorne SOMENTE o JSON abaixo. Sem markdown, sem explicações, sem texto fora do JSON:
{
  "title": "Título da Avaliação Adaptada",
  "studentInfo": true,
  "overallAEEInfo": "Resumo das adaptações aplicadas e orientações para o professor",
  "questions": [
    {
      "id": "q1",
      "originalNumber": "1",
      "bloomLevel": "Lembrar",
      "content": "Texto completo da questão com alternativas A), B), C)... se objetiva",
      "type": "multiple_choice",
      "answer": "A) Texto da alternativa correta",
      "justification": "Por que esta é a resposta correta, com base pedagógica",
      ${gerarImagensIA ? '"imagePrompt": "Descrição detalhada para gerar imagem didática",' : ''}
      "glossary": [{"word": "termo", "meaning": "definição acessível"}],
      "steps": ["Passo 1 para resolver", "Passo 2"]
    }
  ]
}
${!gerarImagensIA ? '\nREGRA CRÍTICA: NÃO inclua o campo "imagePrompt" no JSON em hipótese alguma.' : ''}
    `;

    const baseUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
      parts.push({ text: `${promptRegras}\n\nMATERIAL ORIGINAL:\n${material}\n\nADAPTAÇÕES SOLICITADAS:\n${adaptacoes}\n\nANO ESCOLAR: ${ano}\nETAPA: ${etapaEnsino}` });
      contents = [{ role: 'user', parts }];
    }

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
