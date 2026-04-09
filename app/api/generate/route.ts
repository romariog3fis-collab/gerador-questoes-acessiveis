import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const {
      material, adaptacoes, ano, etapaEnsino,
      estilosAdaptacao, caixaAlta, gerarImagensIA,
      fileBase64, fileType,
      isRefinement, refinementAction, questionToRefine
    } = await req.json();

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key não configurada.' }, { status: 500 });
    }

    // ── Detecção de perfis NEE ────────────────────────────────────────
    const lower = (adaptacoes || '').toLowerCase();
    const perfis: string[] = [];

    if (lower.includes('discalculia')) perfis.push(
      'DISCALCULIA: Elimine/substitua cálculos numéricos por raciocínio qualitativo. Quando inevitável, forneça o resultado e peça só interpretação. Use analogias cotidianas.');
    if (lower.includes('tdah')) perfis.push(
      'TDAH: Enunciados curtos (≤3 linhas), uma ideia por questão, destaque a palavra-chave em negrito, alternativas curtas e distintas.');
    if (lower.includes('dislexia')) perfis.push(
      'DISLEXIA: Frases curtas (≤15 palavras), listas com marcadores, glossário amplo, evite parágrafos denssos.');
    if (lower.includes('autismo') || lower.includes('tea')) perfis.push(
      'TEA: Linguagem literal sem metáforas, estrutura previsível, exemplos concretos do cotidiano, passo a passo de como responder.');
    if (lower.includes('visual')) perfis.push(
      'DEF. VISUAL: Sem referências a imagens/gráficos sem descrição textual completa. Use referências espaciais verbais.');
    if (lower.includes('intelectual')) perfis.push(
      'DEF. INTELECTUAL: Frases ≤10 palavras, máx. 2 alternativas (A/B), exemplo da vida real antes do enunciado, foco em Lembrar/Entender.');

    // ── Estilos ──────────────────────────────────────────────────────
    const estilos = [
      estilosAdaptacao?.destacarChave    && '**negrito** nas info-chave',
      estilosAdaptacao?.dividirBlocos    && 'blocos pequenos espaçados',
      estilosAdaptacao?.listasMarcadores && 'listas com marcadores',
      estilosAdaptacao?.simplificarLinguagem && 'linguagem simples',
      caixaAlta                          && 'TODO O TEXTO EM MAIÚSCULAS',
    ].filter(Boolean).join(', ');

    // ── Schema JSON ──────────────────────────────────────────────────
    const imgField = gerarImagensIA ? `"imagePrompt":"descrição para imagem didática",` : '';
    const noImg = !gerarImagensIA ? 'NÃO inclua imagePrompt.' : 'imagePrompt: descrição detalhada de ilustração didática.';

    const prompt = `Você é especialista em educação inclusiva. Adapte a avaliação abaixo seguindo EXATAMENTE as instruções.

REGRAS ABSOLUTAS:
1. Número de questões e alternativas: siga o campo ADAPTAÇÕES (ex: "8 questões, 3 alternativas" → gere exatamente isso).
2. Perfis NEE ativos — aplique obrigatoriamente:
${perfis.length ? perfis.map(p => '   • ' + p).join('\n') : '   • Adaptação geral de acessibilidade.'}
3. Estilos: ${estilos || 'padrão'}.
4. Etapa: ${etapaEnsino || 'Ensino Fundamental'} — priorize Bloom: Lembrar, Entender, Aplicar.
5. ${noImg}

RETORNE SOMENTE este JSON (sem markdown, sem texto adicional):
{"title":"...","studentInfo":true,"overallAEEInfo":"resumo das adaptações e orientações ao professor","questions":[{"id":"q1","originalNumber":"1","bloomLevel":"Lembrar","content":"enunciado completo com alternativas A) B) C)...","type":"multiple_choice","answer":"A) texto correto","justification":"motivo pedagógico",${imgField}"glossary":[{"word":"termo","meaning":"definição simples"}],"steps":["passo 1","passo 2"]}]}

MATERIAL ORIGINAL:
${material}

ADAPTAÇÕES SOLICITADAS:
${adaptacoes || 'Adaptação geral inclusiva.'}
ANO: ${ano} | ETAPA: ${etapaEnsino}`;

    // ── Chamada Gemini ────────────────────────────────────────────────
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    let contents: any[];
    if (isRefinement) {
      contents = [{ role: 'user', parts: [{ text: `${prompt}\n\nREFINAR QUESTÃO:\n${JSON.stringify(questionToRefine)}\nAÇÃO: ${refinementAction}` }] }];
    } else {
      const parts: any[] = [];
      if (fileBase64) parts.push({ inlineData: { data: fileBase64, mimeType: fileType || 'application/pdf' } });
      parts.push({ text: prompt });
      contents = [{ role: 'user', parts }];
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.4,      // menos criatividade = menos tokens de saída redundantes
          maxOutputTokens: 8192,
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini Error:', data);
      return NextResponse.json({ error: data.error?.message || 'Erro na API do Gemini.' }, { status: response.status });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json\n?|```/g, '').trim();
    return NextResponse.json(JSON.parse(clean));

  } catch (error: any) {
    console.error('Route Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
