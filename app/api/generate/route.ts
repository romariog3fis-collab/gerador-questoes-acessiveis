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

export const runtime = 'edge';

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

    // ── Quantidade e tipos de questão (Nova Lógica Estruturada) ────────────
    let instrucaoTipos = '';
    const qTypes = questionTypes as any;
    
    if (qTypes) {
      const parts: string[] = [];
      if (qTypes.multipleChoice?.enabled) {
        const qty = qTypes.multipleChoice.quantity;
        const alts = Math.max(3, qTypes.multipleChoice.alternatives || 4);
        parts.push(`Múltipla Escolha (type="multiple_choice") -> ${qty > 0 ? qty : 'mesmo do material'} questões com EXATAMENTE ${alts} alternativas (no mínimo 3: A B C)`);
      }
      if (qTypes.trueFalse?.enabled) {
        const qty = qTypes.trueFalse.quantity;
        parts.push(`Verdadeiro/Falso (type="true_false") -> ${qty > 0 ? qty : 'mesmo do material'} questões. OBRIGATÓRIO: cada questão deve ter pelo menos 3 afirmações (assertivas).`);
      }
      if (qTypes.fillBlanks?.enabled) {
        const qty = qTypes.fillBlanks.quantity;
        parts.push(`Completar Lacunas (type="fill_blanks") -> ${qty > 0 ? qty : 'mesmo do material'} questões. OBRIGATÓRIO: cada questão deve ter pelo menos 3 lacunas (___).`);
      }
      if (qTypes.matchColumns?.enabled) {
        const qty = qTypes.matchColumns.quantity;
        parts.push(`Relacionar Colunas (type="match_columns") -> ${qty > 0 ? qty : 'mesmo do material'} questões. OBRIGATÓRIO: pelo menos 3 associações (links) por questão.`);
      }
      if (qTypes.essay?.enabled) {
        const qty = qTypes.essay.quantity;
        parts.push(`Discursivas (type="essay") -> ${qty > 0 ? qty : 'mesmo do material'} questões`);
      }
      
      parts.push(`\n⚠️ REGRA DE DISTRIBUIÇÃO OBRIGATÓRIA:
      1. Se o material original tiver X questões e o usuário pediu Y questões:
         - Se X = Y: Adapte cada questão original para um dos formatos solicitados (1 para 1).
         - Se Y > X: Adapte as X originais e crie (Y-X) questões CORRELATAS baseadas rigorosamente nos mesmos fatos do material original.
         - Se Y < X: Selecione as X questões mais centrais e adapte para os formatos desejados.
      2. NUNCA ignore as quantidades solicitadas acima.`);
      
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
   "originalNumber":"1",
   "type":"multiple_choice|essay|true_false|fill_blanks|match_columns",
   "content":"enunciado adaptado. Use LaTeX para fórmulas: $...$ (inline) ou $$...$$ (bloco).",
   "options":[{"letter":"A","text":"texto ou fórumla LaTeX"}], 
   "isTrue": true,                           
   "blanks":["res1","res2","res3"],          
   "pairs":[{"left":"item1","right":"corresp1"}], 
   "answer":"resultado correto (pode ser LaTeX)",
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
  MARCAÇÃO: Use **negrito** (asteriscos duplos) para destacar termos e conceitos fundamentais.
  
  === REGRAS DE OURO PARA ADAPTAÇÃO ===
  - SIMPLIFICAR NÃO É RESUMIR: Não remova informações fundamentais para o entendimento do problema. 
  - CONTEXTO: O aluno deve ter informação suficiente para raciocinar. Se o enunciado original for longo, simplifique a estrutura das frases, mas mantenha os dados.
  - MATEMÁTICA E GEOMETRIA: Use LaTeX para todas as fórmulas ($\frac{a}{b}$, $x^2$, etc).
  - VISÃO: Analise a imagem original. Descreva diagramas geométricos com precisão no enunciado (Audiodescrição).

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
