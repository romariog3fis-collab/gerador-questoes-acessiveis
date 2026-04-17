import { NextResponse } from 'next/server';

// ── Provedores de IA (todos gratuitos) ────────────────────────────────────
// Camada 1: Groq llama-3.3-70b  → 14.400 req/dia
// Camada 2: Groq llama-3.1-8b   → fallback TPM/overload
// Camada 3: Gemini 2.0 Flash     → 1.500 req/dia (AI Studio free tier)
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_PRIMARY = 'llama-3.3-70b-versatile';
const GROQ_SMALL   = 'llama-3.1-8b-instant';
const GEMINI_URL   = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

export async function POST(req: Request) {
  try {
    const {
      material, adaptacoes, ano, etapaEnsino,
      estilosAdaptacao, caixaAlta, gerarImagensIA,
      fileBase64,
      isRefinement, refinementAction, questionToRefine
    } = await req.json();

    const groqKey   = (process.env.GROQ_API_KEY   || '').trim();
    const geminiKey = (process.env.GEMINI_API_KEY  || '').trim();

    if (!groqKey && !geminiKey) {
      return NextResponse.json(
        { error: 'Nenhuma chave de IA configurada. Configure GROQ_API_KEY ou GEMINI_API_KEY.' },
        { status: 500 }
      );
    }

    // ── Detecção de perfis NEE ────────────────────────────────────────────
    const lower = (adaptacoes || '').toLowerCase();
    const perfis: string[] = [];
    if (lower.includes('discalculia')) perfis.push('DISCALCULIA: substitua cálculos por raciocínio qualitativo. Forneça resultado pronto quando inevitável. Use analogias do cotidiano.');
    if (lower.includes('tdah'))        perfis.push('TDAH: enunciados ≤3 linhas, palavra-chave em **negrito**, alternativas curtas e distintas.');
    if (lower.includes('dislexia'))    perfis.push('DISLEXIA: frases ≤15 palavras, listas com marcadores, glossário amplo.');
    if (lower.includes('autismo') || lower.includes('tea')) perfis.push('TEA: linguagem literal, sem metáforas, exemplos concretos, passo a passo de como responder.');
    if (lower.includes('visual'))      perfis.push('DEF. VISUAL: descreva textualmente tudo que seria visual.');
    if (lower.includes('intelectual')) perfis.push('DEF. INTELECTUAL: frases ≤10 palavras, máx 2 alternativas (A/B), exemplo real antes do enunciado.');

    // ── Estilos pedagógicos ───────────────────────────────────────────────
    const estilos = [
      estilosAdaptacao?.destacarChave        && 'negrito nas info-chave',
      estilosAdaptacao?.dividirBlocos        && 'blocos pequenos espaçados',
      estilosAdaptacao?.listasMarcadores     && 'listas com marcadores',
      estilosAdaptacao?.simplificarLinguagem && 'linguagem simples',
      caixaAlta                              && 'TODO O TEXTO EM MAIÚSCULAS',
    ].filter(Boolean).join(', ') || 'padrão acessível';

    // ── Quantidade e tipos de questão ────────────────────────────────────
    const adLower = (adaptacoes || '').toLowerCase();
    const objMatch = adLower.match(/(\d+)\s*objetivas?/);
    const subMatch = adLower.match(/(\d+)\s*(subjetivas?|discursivas?)/);
    const totMatch = adLower.match(/(\d+)\s*quest[oõ]es?/);
    const altMatch = adLower.match(/(\d+)\s*(alternativas?|op[çc][oõ]es?|itens?)/);

    const qtdObj = objMatch ? parseInt(objMatch[1]) : null;
    const qtdSub = subMatch ? parseInt(subMatch[1]) : null;
    const qtdTot = totMatch && !objMatch && !subMatch ? parseInt(totMatch[1]) : null;

    let instrucaoQuantidade = '';
    if (qtdObj !== null && qtdSub !== null) {
      instrucaoQuantidade = `GERE EXATAMENTE ${qtdObj + qtdSub} questões: ${qtdObj} com type="multiple_choice" (objetivas, com alternativas A) B) C)...) e ${qtdSub} com type="essay" (subjetivas, sem alternativas).`;
    } else if (qtdObj !== null) {
      instrucaoQuantidade = `GERE EXATAMENTE ${qtdObj} questões objetivas com type="multiple_choice" e alternativas A) B) C)...`;
    } else if (qtdSub !== null) {
      instrucaoQuantidade = `GERE EXATAMENTE ${qtdSub} questões subjetivas/discursivas com type="essay", sem alternativas.`;
    } else if (qtdTot !== null) {
      instrucaoQuantidade = `GERE EXATAMENTE ${qtdTot} questões.`;
    } else {
      instrucaoQuantidade = 'Adapte o mesmo número de questões que o material original contém.';
    }

    const instrucaoAlts = altMatch
      ? `Use EXATAMENTE ${altMatch[1]} alternativas nas questões objetivas.`
      : 'Use 4 alternativas (A B C D) nas questões objetivas.';

    // ── Prompts ───────────────────────────────────────────────────────────
    const imgField = gerarImagensIA ? `"imagePrompt":"descrição de ilustração didática",` : '';
    const imgNote  = gerarImagensIA ? '' : 'NÃO inclua o campo imagePrompt.';

    const systemPrompt = `Você é especialista em educação inclusiva. Sua única função é ADAPTAR questões já existentes — NUNCA criar questões novas.

REGRA Nº1: USE SOMENTE o conteúdo do material fornecido. É PROIBIDO inventar questões não presentes no material original.
REGRA Nº2: Responda APENAS com JSON válido, sem texto extra, sem markdown.

SCHEMA para cada questão:
{"id":"q1","originalNumber":"1","bloomLevel":"Lembrar|Entender|Aplicar|Analisar|Avaliar|Criar","type":"multiple_choice ou essay","content":"enunciado ADAPTADO da questão original (multiple_choice: inclua A) B) C)...)","answer":"resposta correta","justification":"justificativa pedagógica breve",${imgField}"glossary":[{"word":"termo do enunciado","meaning":"definição simples"}],"steps":["passo 1","passo 2"]}

${imgNote}
Retorne: {"title":"...","studentInfo":true,"overallAEEInfo":"orientações ao professor sobre as adaptações feitas","questions":[...]}`;

    let userPrompt = '';

    if (isRefinement) {
      userPrompt = `Refine a questão abaixo conforme a ação. Retorne SOMENTE o JSON da questão refinada, mesmo schema, mantendo o "id" original.

QUESTÃO:
${JSON.stringify(questionToRefine, null, 2)}

AÇÃO: ${refinementAction}`;
    } else {
      userPrompt = `Adapte as questões abaixo para tornar a avaliação mais acessível.

⚠️ OBRIGATÓRIO: trabalhe SOMENTE com as questões do MATERIAL ORIGINAL abaixo. Não invente conteúdo.

=== REGRAS DE ADAPTAÇÃO ===
QUANTIDADE: ${instrucaoQuantidade}
ALTERNATIVAS: ${instrucaoAlts}
PERFIS NEE:
${perfis.length ? perfis.map(p => '  • ' + p).join('\n') : '  • Adaptação geral de acessibilidade.'}
ESTILOS: ${estilos}
ETAPA: ${etapaEnsino || 'Ensino Fundamental'} | ANO: ${ano}
Taxonomia de Bloom: priorize Lembrar, Entender e Aplicar.

=== MATERIAL ORIGINAL (adapte SOMENTE este conteúdo) ===
${(material || '').slice(0, 8000)}

=== ADAPTAÇÕES SOLICITADAS ===
${adaptacoes || 'Adaptação geral inclusiva.'}`;

      if (fileBase64) {
        userPrompt += '\n\n[Arquivo também enviado. Use o texto acima como base.]';
      }
    }

    // ── Função de chamada Groq ────────────────────────────────────────────
    const callGroq = async (model: string, tokens: number) => {
      if (!groqKey) return null;
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          temperature: 0.35,
          max_tokens: tokens,
          response_format: { type: 'json_object' },
        }),
      });
      return res;
    };

    // ── Função de chamada Gemini ──────────────────────────────────────────
    const callGemini = async () => {
      if (!geminiKey) return null;

      // Gemini API v1 não suporta "systemInstruction" nem "responseMimeType"
      // → mesclamos o system prompt no conteúdo do usuário
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

      const body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 5000,
        },
      });

      // Usa x-goog-api-key header (funciona com AIza e AQ.)
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body,
      });

      if (!res.ok) {
        const errBody = await res.clone().json().catch(() => ({}));
        console.error(`[Gemini] x-goog-api-key falhou (${res.status}):`, JSON.stringify(errBody).slice(0, 400));
      }

      return res;
    };

    // ── Extrai texto da resposta conforme o provedor ──────────────────────
    const extractText = async (res: Response, provider: 'groq' | 'gemini'): Promise<string | null> => {
      const data = await res.json();
      if (!res.ok) {
        console.error(`[${provider}] Erro ${res.status}:`, JSON.stringify(data).slice(0, 300));
        return null;
      }
      if (provider === 'groq') {
        return data.choices?.[0]?.message?.content || null;
      } else {
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }
    };

    // ── Cadeia de fallback: Groq 70B → Groq 8B → Gemini ─────────────────
    let rawText: string | null = null;

    // Tentativa 1: Groq 70B
    if (groqKey && !rawText) {
      const res1 = await callGroq(GROQ_PRIMARY, 5000);
      if (res1 && res1.ok) {
        rawText = await extractText(res1, 'groq');
        if (rawText) console.log('[Route] Respondido por Groq 70B');
      } else if (res1) {
        const status1 = res1.status;
        console.warn(`[Groq 70B] Status ${status1} — tentando fallback`);

        // Tentativa 2: Groq 8B (só se o erro for de carga/limite, não auth)
        if ([400, 429, 503].includes(status1)) {
          const res2 = await callGroq(GROQ_SMALL, 4000);
          if (res2 && res2.ok) {
            rawText = await extractText(res2, 'groq');
            if (rawText) console.log('[Route] Respondido por Groq 8B (fallback)');
          } else {
            console.warn(`[Groq 8B] Status ${res2?.status} — escalando para Gemini`);
          }
        }
      }
    }

    // Tentativa 3: Gemini 2.0 Flash
    if (!rawText && geminiKey) {
      console.log('[Route] Usando Gemini 2.0 Flash como fallback final');
      const res3 = await callGemini();
      if (res3 && res3.ok) {
        rawText = await extractText(res3, 'gemini');
        if (rawText) console.log('[Route] Respondido por Gemini 2.0 Flash');
      } else {
        const errData = res3 ? await res3.json().catch(() => ({})) : {};
        const errMsg = errData?.error?.message || '';
        // Log técnico no servidor, mensagem amigável para o usuário
        console.error('[Gemini] Erro:', errMsg.slice(0, 300));

        // Quota esgotada: erro esperado, não expor detalhes técnicos
        const isQuota = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit');
        if (isQuota) {
          console.warn('[Gemini] Cota esgotada. Verifique a GEMINI_API_KEY no Vercel (use chave de projeto SEM faturamento).');
        }
        // Continua — rawText ainda null, vai retornar erro abaixo
      }
    }

    if (!rawText) {
      return NextResponse.json(
        { error: 'Os servidores de IA estão sobrecarregados no momento. Aguarde alguns minutos e tente novamente.' },
        { status: 503 }
      );
    }

    // ── Parse do JSON ─────────────────────────────────────────────────────
    const clean = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[Route] JSON inválido:', clean.slice(0, 500));
      return NextResponse.json(
        { error: 'Resposta da IA em formato inválido. Tente novamente.' },
        { status: 500 }
      );
    }

    // Para refinamento aceita questão direta ou embrulhada
    if (isRefinement) {
      return NextResponse.json(parsed.questions?.[0] ?? parsed);
    }

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[Route] Erro interno:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}
