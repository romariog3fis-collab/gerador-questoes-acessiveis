import { NextResponse } from 'next/server';

// ── Provedores de IA (todos gratuitos) ────────────────────────────────────
// Camada 1: Groq llama-3.3-70b  → 14.400 req/dia
// Camada 2: Groq llama-3.1-8b   → fallback TPM/overload
// Camada 3: Gemini 2.0 Flash     → 1.500 req/dia (AI Studio free tier)
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_PRIMARY = 'llama-3.3-70b-versatile';
const GROQ_SMALL   = 'llama-3.1-8b-instant';
const GROQ_TERTIARY = 'mixtral-8x7b-32768';
const GEMINI_URL   = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  try {
    const {
      material, adaptacoes, selectedProfiles, questionTypes, ano, etapaEnsino,
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

    // ── Detecção de perfis NEE (Chips vindo da UI) ─────────────────────────
    const perfisMap: Record<string, string> = {
      'TDAH': 'TDAH: Priorize enunciados diretos e objetivos. Use negrito em palavras-chave. Evite distrações, mas mantenha o contexto necessário.',
      'Dislexia': 'DISLEXIA: Use vocabulário simples e frases claras. Use listas com marcadores para organizar informações complexas.',
      'Discalculia': 'DISCALCULIA: Foque no raciocínio lógico e conceitos qualitativos. Forneça fórmulas e resultados intermediários se o foco não for o cálculo puro.',
      'Autismo': 'TEA: Linguagem literal e direta. Evite ironias ou metáforas. Explique claramente o comando da questão.',
      'Def. Visual': 'DEF. VISUAL: Forneça audiodescrição precisa de gráficos, tabelas e figuras geométricas no enunciado.',
      'Def. Intelectual': 'DEF. INTELECTUAL: Linguagem extremamente simples, frases curtas e foco em um único conceito por questão. Máximo 2 alternativas.'
    };
    
    const perfis = (selectedProfiles as string[] || []).map(p => perfisMap[p]).filter(Boolean);

    // ── Estilos pedagógicos ───────────────────────────────────────────────
    const estilos = [
      estilosAdaptacao?.destacarChave        && 'negrito nas info-chave',
      estilosAdaptacao?.dividirBlocos        && 'blocos pequenos espaçados',
      estilosAdaptacao?.listasMarcadores     && 'listas com marcadores',
      estilosAdaptacao?.simplificarLinguagem && 'linguagem simples',
      caixaAlta                              && 'TODO O TEXTO EM MAIÚSCULAS',
    ].filter(Boolean).join(', ') || 'padrão acessível';

    // ── Quantidade e tipos de questão ────────────────────────────────────
    let instrucaoTipos = '';
    let totalRequested = 0;
    const qTypes = questionTypes as any;

    if (qTypes) {
      const parts: string[] = [];

      if (qTypes.multipleChoice?.enabled) {
        const qty = qTypes.multipleChoice.quantity || 1;
        totalRequested += qty;
        const alts = Math.max(3, qTypes.multipleChoice.alternatives || 4);
        parts.push(`- ${qty} questão(ões) tipo="multiple_choice" com ${alts} alternativas`);
      }
      if (qTypes.trueFalse?.enabled) {
        const qty = qTypes.trueFalse.quantity || 1;
        totalRequested += qty;
        parts.push(`- ${qty} questão(ões) tipo="true_false" (array "assertions" com ≥3 afirmações em cada)`);
      }
      if (qTypes.fillBlanks?.enabled) {
        const qty = qTypes.fillBlanks.quantity || 1;
        totalRequested += qty;
        parts.push(`- ${qty} questão(ões) tipo="fill_blanks" (content com ≥3 lacunas "_________", array "blanks" correspondente)`);
      }
      if (qTypes.matchColumns?.enabled) {
        const qty = qTypes.matchColumns.quantity || 1;
        totalRequested += qty;
        parts.push(`- ${qty} questão(ões) tipo="match_columns" (array "pairs" com ≥4 pares left/right)`);
      }
      if (qTypes.essay?.enabled) {
        const qty = qTypes.essay.quantity || 1;
        totalRequested += qty;
        parts.push(`- ${qty} questão(ões) tipo="essay"`);
      }

      instrucaoTipos = parts.length > 0
        ? `TOTAL: ${totalRequested} questões com esta distribuição OBRIGATÓRIA:\n${parts.join('\n')}`
        : 'Adapte as questões mantendo seus formatos originais.';
    } else {
      instrucaoTipos = 'Adapte o mesmo número de questões do material original.';
    }

    // ── Prompts ───────────────────────────────────────────────────────────
    const imgField = gerarImagensIA ? '"imagePrompt":"descrição de ilustração didática",' : '';
    const imgNote  = gerarImagensIA ? '' : 'NÃO inclua o campo imagePrompt.';

    const systemPrompt = [
      `Você é um gerador de avaliações especializado em educação inclusiva.`,
      ``,
      `==== SUA MISSÃO (LEIA ANTES DE QUALQUER OUTRA COISA) ====`,
      instrucaoTipos,
      `=========================================================`,
      ``,
      `REGRAS ABSOLUTAS:`,
      `1. Use SOMENTE o conteúdo do MATERIAL fornecido. PROIBIDO inventar.`,
      `2. Responda APENAS com JSON válido — zero texto fora do JSON.`,
      `3. O campo "type" de CADA questão DEVE ser exatamente um dos tipos acima.`,
      `4. NUNCA converta questões de outros tipos para multiple_choice.`,
      `5. ${imgNote}`,
      ``,
      `MOLDES OBRIGATÓRIOS (use o molde correto para cada tipo):`,
      ``,
      `[multiple_choice] → {"id":"q1","originalNumber":"1","type":"multiple_choice","content":"enunciado","options":[{"letter":"A","text":"texto A"},{"letter":"B","text":"texto B"},{"letter":"C","text":"texto C"}],"answer":"A","justification":"..."}`,
      ``,
      `[true_false] → {"id":"q2","originalNumber":"2","type":"true_false","content":"contexto geral da questão","assertions":[{"text":"afirmação 1","isTrue":true},{"text":"afirmação 2","isTrue":false},{"text":"afirmação 3","isTrue":true}],"answer":"V, F, V","justification":"..."}`,
      ``,
      `[fill_blanks] → {"id":"q3","originalNumber":"3","type":"fill_blanks","content":"A _________ ocorreu em 1822 e resultou na _________ do Brasil da _________  portuguesa.","blanks":["Independência","separação","coroa"],"answer":"Independência, separação, coroa","justification":"..."}`,
      ``,
      `[match_columns] → {"id":"q4","originalNumber":"4","type":"match_columns","content":"Relacione os conceitos:","pairs":[{"left":"Conceito A","right":"Definição 1"},{"left":"Conceito B","right":"Definição 2"},{"left":"Conceito C","right":"Definição 3"},{"left":"Conceito D","right":"Definição 4"}],"answer":"A-1, B-2, C-3, D-4","justification":"..."}`,
      ``,
      `[essay] → {"id":"q5","originalNumber":"5","type":"essay","content":"Explique com suas palavras...","answer":"Chave de correção esperada","justification":"..."}`,
      ``,
      `JSON de retorno: {"title":"...","studentInfo":true,"overallAEEInfo":"resumo das adaptações","questions":[...]}`,
    ].join('\n');

    let userPrompt = '';

    if (isRefinement) {
      userPrompt = `Refine a questão abaixo conforme a ação solicitada. Retorne SOMENTE o JSON da questão refinada, mantendo o "id" original.

QUESTÃO:
${JSON.stringify(questionToRefine, null, 2)}

AÇÃO: ${refinementAction}`;
    } else {
      userPrompt = `MATERIAL ORIGINAL (use como única fonte de conteúdo):
${(material || '').slice(0, 8000)}

PERFIS DE ACESSIBILIDADE:
${perfis.length ? perfis.map((p: string) => '  • ' + p).join('\n') : '  • Adaptação geral de acessibilidade.'}

ESTILOS DE ADAPTAÇÃO: ${estilos}
ETAPA: ${etapaEnsino || 'Ensino Fundamental'} | ANO: ${ano}

REGRAS DE QUALIDADE:
- SIMPLIFICAR não é RESUMIR. Mantenha o contexto para o aluno raciocinar.
- Use **negrito** para termos e conceitos fundamentais.
- Matemática: LaTeX ($\\frac{a}{b}$, $x^2$).
- Para fill_blanks: reescreva como afirmação e insira _________ nas palavras-chave.

ADAPTAÇÕES EXTRAS: ${adaptacoes || 'Nenhuma.'}

⚠️ LEMBRETE: Gere EXATAMENTE ${totalRequested} questões conforme os tipos definidos na sua missão principal.`;

      if (fileBase64) {
        userPrompt += '\n\n[Arquivo de imagem enviado. Use o texto acima como base principal.]';
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

    // ── Função de chamada Gemini (com Visão) ─────────────────────────────
    const callGemini = async () => {
      if (!geminiKey) return null;

      const parts: any[] = [{ text: `${systemPrompt}\n\n${userPrompt}` }];
      
      // Se houver arquivo, envia a imagem para o Gemini analisar
      if (fileBase64) {
        const [meta, data] = fileBase64.split(',');
        const mime = meta.split(':')[1].split(';')[0];
        parts.push({ inline_data: { mime_type: mime, data } });
      }

      const body = JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 5000,
        },
      });

      const res = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) {
        const errBody = await res.clone().json().catch(() => ({}));
        console.error(`[Gemini] Erro (${res.status}):`, JSON.stringify(errBody).slice(0, 400));
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
    let lastErrorMsg = 'Os servidores de IA estão sobrecarregados no momento. Aguarde alguns minutos e tente novamente.';

    // Tentativa 1: Groq 70B
    if (groqKey && !rawText) {
      try {
        // Reduzido para 3000 tokens para evitar que (max_tokens + prompt) > 6000 TPM (Limite Grátis Groq)
        const res1 = await callGroq(GROQ_PRIMARY, 3000);
        if (res1 && res1.ok) {
          rawText = await extractText(res1, 'groq');
        } else if (res1) {
          const err1 = await res1.clone().json().catch(() => ({}));
          lastErrorMsg = `Recusado pelo Groq 70B (Status ${res1.status}). Motivo: ${err1?.error?.message?.slice(0, 50) || 'Limite de tráfego'}`;
          console.warn(`[Groq 70B] Falhou — tentando infra reserva (8B). Erro:`, err1);
          
          // Tentativa 2: Groq 8B
          const res2 = await callGroq(GROQ_SMALL, 3000);
          if (res2 && res2.ok) {
            rawText = await extractText(res2, 'groq');
          } else {
             // Tentativa 2.5: Mixtral (Groq)
             const resM = await callGroq(GROQ_TERTIARY, 3000);
             if (resM && resM.ok) {
               rawText = await extractText(resM, 'groq');
             } else if (resM) {
                const errM = await resM.clone().json().catch(() => ({}));
                lastErrorMsg = `Recusado pelo Groq Mixtral (Status ${resM.status}). Motivo: ${errM?.error?.message?.slice(0, 50) || 'Limite de tráfego'}`;
             }
          }
        }
      } catch (err: any) {
        lastErrorMsg = `Falha de conexão com a IA: ${err.message}`;
        console.error('[Groq] Falha de conexão/timeout:', err);
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
        lastErrorMsg = `Recusado pelo Google Gemini. Motivo: ${errMsg.slice(0, 60)}`;
        
        console.error('[Gemini] Erro:', errMsg.slice(0, 300));
        const isQuota = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit');
        if (isQuota) {
          console.warn('[Gemini] Cota esgotada. Verifique a GEMINI_API_KEY no Vercel.');
        }
      }
    }

    if (!rawText) {
      return NextResponse.json(
        { error: `Falha na geração: ${lastErrorMsg}` },
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
