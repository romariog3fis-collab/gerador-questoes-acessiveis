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
      'TDAH': 'TDAH: enunciados ≤3 linhas, palavra-chave em **negrito**, alternativas curtas e distintas.',
      'Dislexia': 'DISLEXIA: frases ≤15 palavras, listas com marcadores, glossário amplo.',
      'Discalculia': 'DISCALCULIA: substitua cálculos por raciocínio qualitativo. Forneça resultado pronto quando inevitável.',
      'Autismo': 'TEA: linguagem literal, sem metáforas, exemplos concretos, passo a passo de como responder.',
      'Def. Visual': 'DEF. VISUAL: descreva textualmente tudo que seria visual.',
      'Def. Intelectual': 'DEF. INTELECTUAL: frases ≤10 palavras, máx 2 alternativas (A/B), suporte visual intenso.'
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

    // ── Quantidade e tipos de questão (Nova Lógica Estruturada) ────────────
    let instrucaoTipos = '';
    const qTypes = questionTypes as any;
    
    if (qTypes) {
      const parts: string[] = [];
      if (qTypes.multipleChoice?.enabled) {
        const qty = qTypes.multipleChoice.quantity;
        const alts = qTypes.multipleChoice.alternatives || 4;
        parts.push(`Múltipla Escolha (type="multiple_choice") -> ${qty > 0 ? qty : 'mesmo do material'} questões com EXATAMENTE ${alts} alternativas (A B C...)`);
      }
      if (qTypes.trueFalse?.enabled) {
        const qty = qTypes.trueFalse.quantity;
        parts.push(`Verdadeiro/Falso (type="true_false") -> ${qty > 0 ? qty : 'mesmo do material'} questões`);
      }
      if (qTypes.fillBlanks?.enabled) {
        const qty = qTypes.fillBlanks.quantity;
        parts.push(`Completar Lacunas (type="fill_blanks") -> ${qty > 0 ? qty : 'mesmo do material'} questões (use ___ no enunciado)`);
      }
      if (qTypes.matchColumns?.enabled) {
        const qty = qTypes.matchColumns.quantity;
        parts.push(`Relacionar Colunas (type="match_columns") -> ${qty > 0 ? qty : 'mesmo do material'} questões`);
      }
      if (qTypes.essay?.enabled) {
        const qty = qTypes.essay.quantity;
        parts.push(`Discursivas (type="essay") -> ${qty > 0 ? qty : 'mesmo do material'} questões`);
      }
      
      instrucaoTipos = parts.length > 0 ? parts.join('\n') : 'Adapte as questões existentes mantendo seus formatos originais.';
    } else {
      instrucaoTipos = 'Adapte o mesmo número de questões que o material original contém.';
    }

    // ── Prompts ───────────────────────────────────────────────────────────
    const imgField = gerarImagensIA ? `"imagePrompt":"descrição de ilustração didática",` : '';
    const imgNote  = gerarImagensIA ? '' : 'NÃO inclua o campo imagePrompt.';

    const systemPrompt = `Você é especialista em educação inclusiva. Sua única função é ADAPTAR questões existentes.
 
 REGRA Nº1: USE SOMENTE o conteúdo do material fornecido. É PROIBIDO inventar conteúdo extra.
 REGRA Nº2: Responda APENAS com JSON válido.
 
 SCHEMA da questão:
 {
   "id":"q1",
   "type":"multiple_choice|essay|true_false|fill_blanks|match_columns",
   "content":"enunciado (use ___ para fill_blanks)",
   "options":[{"letter":"A","text":"..."}],  // para multiple_choice
   "isTrue": true,                           // para true_false
   "blanks":["res1","res2"],                 // para fill_blanks
   "pairs":[{"left":"item1","right":"corresp1"}], // para match_columns
   "answer":"resultado correto",
   "justification":"breve explicação",
   ${imgField}
   "glossary":[{"word":"...","meaning":"..."}],
   "steps":["passo 1"]
 }
 
 Retorne: {"title":"...","studentInfo":true,"overallAEEInfo":"resumo das adaptações","questions":[...]}`;

    let userPrompt = '';

    if (isRefinement) {
      userPrompt = `Refine a questão abaixo conforme a ação. Retorne SOMENTE o JSON da questão refinada, mesmo schema, mantendo o "id" original.

QUESTÃO:
${JSON.stringify(questionToRefine, null, 2)}

AÇÃO: ${refinementAction}`;
    } else {
      userPrompt = `Adapte as questões abaixo para tornar a avaliação mais acessível.

⚠️ OBRIGATÓRIO: trabalhe SOMENTE com as questões do MATERIAL ORIGINAL abaixo. Não invente conteúdo.

=== REGRAS DE CONFIGURAÇÃO ===
${instrucaoTipos}

PERFIS NEE ATIVOS:
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

      // Usa ?key= na URL (método mais compatível com todos os formatos de chave)
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
