import { NextResponse } from 'next/server';

// ── Provedores de IA ────────────────────────────────────────────────────────
// OpenRouter é o provedor PRIMÁRIO. Tenta uma lista de modelos gratuitos (":free")
// em ordem antes de cair para Groq/Gemini (também de camada gratuita) como fallback.
// A disponibilidade de modelos ":free" no OpenRouter roda de tempos em tempos —
// confira a lista atual em https://openrouter.ai/models?max_price=0 se algum parar de responder.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TEXT_MODELS = [
  'z-ai/glm-4.5-air:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
];
const OPENROUTER_VISION_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen2.5-vl-72b-instruct:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
];

const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_PRIMARY   = 'llama-3.3-70b-versatile';
const GROQ_SMALL     = 'llama-3.1-8b-instant';
// Gemini: 2.5-flash (preview) → 2.0-flash → 1.5-flash
const GEMINI_25_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent';
const GEMINI_URL     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_FB_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Rastreia limites por modelo do Groq
let rateLimit70B = false;
let rateLimit8B = false;
// Rastreia modelos gratuitos do OpenRouter que já bateram rate limit nesta request
let blockedOpenRouterModels = new Set<string>();

// ── Utilitários de chamada ──────────────────────────────────────────────────
async function callOpenRouter(
  key: string, model: string, system: string, user: string, tokens: number, fileBase64?: string, fileType?: string
): Promise<string | null> {
  if (blockedOpenRouterModels.has(model)) return null;
  try {
    let userContent: any = user;
    if (fileBase64) {
      let mime = fileType || 'application/pdf';
      let data = fileBase64;
      if (fileBase64.includes(',')) {
        const [meta, rawData] = fileBase64.split(',');
        data = rawData;
        mime = meta.split(':')[1]?.split(';')[0] || mime;
      }
      userContent = [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } },
      ];
    }
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://gerador-questoes-acessiveis.vercel.app',
        'X-Title': 'Gerador Acessível',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature: 0.4,
        max_tokens: tokens,
        response_format: { type: 'json_object' },
        // Modelos "reasoning" (ex: GLM-4.5-Air) gastam parte do max_tokens pensando antes
        // de responder — desativamos para sobrar orçamento inteiro para o JSON de saída.
        reasoning: { effort: 'none' },
      }),
    });
    if (res.status === 429) {
      blockedOpenRouterModels.add(model);
      console.warn(`[OpenRouter/${model}] Rate limited (429) — trying next free model`);
      return null;
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[OpenRouter/${model}] HTTP ${res.status}: ${errBody.slice(0, 150)}`);
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.warn(`[OpenRouter/${model}] exception:`, e);
    return null;
  }
}

async function callGroq(
  key: string, model: string, system: string, user: string, tokens = 800
): Promise<string | null> {
  if (model === GROQ_PRIMARY && rateLimit70B) return null;
  if (model === GROQ_SMALL && rateLimit8B) return null;
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.4,
        max_tokens: tokens,
        response_format: { type: 'json_object' },
      }),
    });
    if (res.status === 429) {
      if (model === GROQ_PRIMARY) rateLimit70B = true;
      if (model === GROQ_SMALL) rateLimit8B = true;
      console.warn(`[Groq/${model}] Rate limited (429) — trying fallback`);
      return null;
    }
    if (!res.ok) {
      console.warn(`[Groq/${model}] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.warn(`[Groq/${model}] exception:`, e);
    return null;
  }
}

let lastGeminiError = '';

async function callGemini(
  key: string, system: string, user: string, tokens: number, fileBase64?: string, fileType?: string
): Promise<string | null> {
  const parts: any[] = [{ text: `${system}\n\n${user}` }];
  if (fileBase64) {
    let mime = fileType || 'application/pdf';
    let data = fileBase64;

    if (fileBase64.includes(',')) {
      const [meta, rawData] = fileBase64.split(',');
      data = rawData;
      mime = meta.split(':')[1]?.split(';')[0] || mime;
    }
    parts.push({ inline_data: { mime_type: mime, data } });
  }
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.4, maxOutputTokens: tokens },
  });

  // Tenta 2.5-flash → 2.0-flash → 1.5-flash
  for (const url of [GEMINI_25_URL, GEMINI_URL, GEMINI_FB_URL]) {
    try {
      const res = await fetch(`${url}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        const errObj = await res.json().catch(() => ({}));
        const errMsg = errObj?.error?.message || `HTTP ${res.status}`;
        console.warn(`[Gemini] Erro em ${url.split('/models/')[1]}: ${errMsg}`);
        
        // Se for 404 (modelo não existe), continua tentando a próxima URL.
        // Se for outro erro (ex: 400 API Key inválida, 429 Cota Esgotada, 403), guarda o erro.
        if (res.status !== 404) {
          lastGeminiError = errMsg;
        }
        continue;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      if (text) return text;
    } catch (e: any) {
      console.warn('[Gemini] exception:', e.message);
      lastGeminiError = e.message;
    }
  }
  return null;
}

async function callAI(
  openRouterKey: string, groqKey: string, geminiKey: string,
  system: string, user: string,
  tokens = 800, fileBase64?: string, fileType?: string
): Promise<string | null> {
  // Se houver arquivo (PDF/Imagem), precisamos de um modelo multimodal (visão).
  const hasFile = !!fileBase64;

  // 1) OpenRouter primeiro — percorre a lista de modelos gratuitos (":free") em ordem.
  if (openRouterKey) {
    const models = hasFile ? OPENROUTER_VISION_MODELS : OPENROUTER_TEXT_MODELS;
    for (const model of models) {
      const r = await callOpenRouter(openRouterKey, model, system, user, tokens, fileBase64, fileType);
      if (r) return r;
    }
    console.warn('[callAI] OpenRouter: todos os modelos gratuitos falharam — caindo para Groq/Gemini');
  }

  // 2) Fallback: provedores diretos de camada gratuita (Groq / Gemini)
  if (groqKey && !hasFile) {
    if (!rateLimit70B) {
      const r1 = await callGroq(groqKey, GROQ_PRIMARY, system, user, tokens);
      if (r1) return r1;
    }
    if (!rateLimit8B) {
      const r2 = await callGroq(groqKey, GROQ_SMALL, system, user, tokens);
      if (r2) return r2;
    }
  }
  if (geminiKey) {
    return callGemini(geminiKey, system, user, tokens, fileBase64, fileType);
  }
  return null;
}

function parseJSON(raw: string): any {
  let clean = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  
  // Extração robusta: encontra o primeiro '{' ou '[' e último '}' ou ']'
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = clean.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = clean.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    clean = clean.substring(startIdx, endIdx + 1);
  }

  return JSON.parse(clean);
}

// ── Gerador focado em UM único tipo de questão ──────────────────────────────
async function generateQuestionsOfType(opts: {
  openRouterKey: string;
  groqKey: string;
  geminiKey: string;
  typeKey: string;       // ex: "true_false"
  qty: number;
  materialSnippet: string;
  contextInfo: string;   // perfis, estilos, etapa
  imgField: string;
  fileBase64?: string;
  fileType?: string;
  startIndex: number;    // para numerar id sequencial
  alternatives?: number; // qtd alternativas para multipla escolha
}): Promise<any[]> {
  const { openRouterKey, groqKey, geminiKey, typeKey, qty, materialSnippet, contextInfo, imgField, fileBase64, fileType, startIndex, alternatives } = opts;

  // System prompt focado em UM tipo
  const typeDescriptions: Record<string, string> = {
    multiple_choice: `Gere EXATAMENTE ${qty} questão(ões) de MÚLTIPLA ESCOLHA.
    REGRA CRÍTICA: Cada questão deve ter EXATAMENTE ${alternatives || 4} alternativas (opções de resposta). NUNCA gere mais que isso.
Molde estrutural (USE O SEU MATERIAL PARA O CONTEÚDO, ISSO É APENAS UM EXEMPLO DE FORMATO):
{"id":"q#","originalNumber":"#","type":"multiple_choice","content":"enunciado da questão baseado no material","options":[{"letter":"A","text":"..."},{"letter":"B","text":"..."}],"answer":"A","justification":"explicação"${imgField ? ',' + imgField : ''}}`,

    true_false: `Gere EXATAMENTE ${qty} questão(ões) de VERDADEIRO OU FALSO.
Molde estrutural (USE O SEU MATERIAL PARA O CONTEÚDO, ISSO É APENAS UM EXEMPLO DE FORMATO):
{"id":"q#","originalNumber":"#","type":"true_false","content":"contexto da questão","assertions":[{"text":"afirmação 1 baseada no material","isTrue":true},{"text":"afirmação 2 baseada no material","isTrue":false},{"text":"afirmação 3 baseada no material","isTrue":true}],"answer":"V, F, V","justification":"explicação"${imgField ? ',' + imgField : ''}}
REGRA: O array "assertions" deve ter PELO MENOS 3 itens independentes.`,

    fill_blanks: `Gere EXATAMENTE ${qty} questão(ões) de COMPLETAR LACUNAS.
Molde estrutural (USE O SEU MATERIAL PARA O CONTEÚDO, NUNCA USE ESTE EXEMPLO LITERAL):
{"id":"q#","originalNumber":"#","type":"fill_blanks","content":"Segundo o material, o processo de _________ ocorre devido a _________ e gera _________.","blanks":["conceito1","conceito2","conceito3"],"answer":"conceito1, conceito2, conceito3","justification":"explicação"${imgField ? ',' + imgField : ''}}
REGRA CRÍTICA: O campo "content" DEVE conter o texto extraído do seu material com os espaços "_________" já aplicados onde ficariam os termos chaves. O array "blanks" deve ter mínimo 3 itens.`,

    match_columns: `Gere EXATAMENTE ${qty} questão(ões) de RELACIONAR COLUNAS.
Molde estrutural (USE O SEU MATERIAL PARA O CONTEÚDO):
{"id":"q#","originalNumber":"#","type":"match_columns","content":"Relacione os conceitos da Coluna A com as definições da Coluna B:","pairs":[{"left":"Termo X do material","right":"Definição X do material"},{"left":"Termo Y","right":"Definição Y"},{"left":"Termo Z","right":"Definição Z"},{"left":"Termo W","right":"Definição W"}],"answer":"A-1, B-2, C-3, D-4","justification":"explicação"${imgField ? ',' + imgField : ''}}
REGRA: Array "pairs" deve ter NO MÍNIMO 4 pares baseados no conteúdo fornecido.`,

    essay: `Gere EXATAMENTE ${qty} questão(ões) DISCURSIVA(S).
Molde estrutural (USE O SEU MATERIAL PARA O CONTEÚDO):
{"id":"q#","originalNumber":"#","type":"essay","content":"Enunciado pedindo ao aluno que redija, explique ou analise algo presente no material...","answer":"Chave de correção com os pontos esperados na resposta","justification":"explicação"${imgField ? ',' + imgField : ''}}`,
  };

  const system = `Você é um gerador de questões para educação inclusiva. 

${typeDescriptions[typeKey]}

REGRAS:
1. Responda APENAS com JSON válido no formato: {"questions":[...]}
2. Use SOMENTE o conteúdo do material fornecido.
3. NÃO inclua nenhum texto fora do JSON.
4. Cada "id" deve ser único: "q${startIndex}", "q${startIndex + 1}", etc.

${contextInfo}`;

  const user = `MATERIAL:
${materialSnippet}

Gere as ${qty} questão(ões) de ${typeKey}. Responda apenas com o JSON.`;

  // Sem teto artificial baixo: cada chamada já é limitada a no máximo CHUNK_SIZE
  // questões (ver batches no handler), então o orçamento pode escalar com segurança.
  const tokensNeeded = Math.min(qty * 550 + 500, 3200);
  const raw = await callAI(openRouterKey, groqKey, geminiKey, system, user, tokensNeeded, fileBase64, fileType);
  if (!raw) return [];

  try {
    const parsed = parseJSON(raw);
    // Aceita {"questions":[...]} ou diretamente [...]
    const arr: any[] = Array.isArray(parsed) ? parsed : (parsed.questions ?? []);
    // Garante que todos os itens têm o type correto e ids sequenciais
    return arr.slice(0, qty).map((q: any, i: number) => ({
      ...q,
      id: `q${startIndex + i}`,
      type: typeKey,  // força o tipo correto independentemente do que a IA devolveu
    }));
  } catch (e) {
    console.warn(`[generateQuestionsOfType/${typeKey}] JSON parse error:`, raw.slice(0, 200));
    return [];
  }
}

// ── Handler principal ───────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const {
      material, adaptacoes, selectedProfiles, questionTypes, ano, etapaEnsino,
      estilosAdaptacao, caixaAlta, incluirDescricaoVisual, gerarImagensIA,
      fileBase64, fileType,
      isRefinement, refinementAction, questionToRefine
    } = await req.json();

    const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
    const groqKey  = (process.env.GROQ_API_KEY  || '').trim();
    const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (!openRouterKey && !groqKey && !geminiKey) {
      return NextResponse.json(
        { error: 'Nenhuma chave de IA configurada. Configure OPENROUTER_API_KEY, GROQ_API_KEY ou GEMINI_API_KEY.' },
        { status: 500 }
      );
    }

    // ── Perfis NEE ────────────────────────────────────────────────────────
    const perfisMap: Record<string, string> = {
      'TDAH': 'TDAH: Enunciados diretos. Negrito em palavras-chave.',
      'Dislexia': 'DISLEXIA: Vocabulário simples, frases claras.',
      'Discalculia': 'DISCALCULIA: Foco em raciocínio, forneça fórmulas.',
      'Autismo': 'TEA: Linguagem literal e direta, sem ironias.',
      'Def. Visual': 'DEF. VISUAL: Audiodescrição precisa de figuras.',
      'Def. Intelectual': 'DEF. INTELECTUAL: Linguagem simples, frases curtas.',
    };
    const perfis = (selectedProfiles as string[] || []).map(p => perfisMap[p]).filter(Boolean);

    // ── Estilos ───────────────────────────────────────────────────────────
    const estilos = [
      estilosAdaptacao?.destacarChave        && 'negrito nas info-chave',
      estilosAdaptacao?.dividirBlocos        && 'blocos pequenos espaçados',
      estilosAdaptacao?.listasMarcadores     && 'listas com marcadores',
      estilosAdaptacao?.titulosClaros        && 'títulos e subtítulos descritivos',
      estilosAdaptacao?.simplificarLinguagem && 'linguagem simples',
      caixaAlta                              && 'TODO O TEXTO EM MAIÚSCULAS',
      incluirDescricaoVisual                 && 'adicionar TAG [Audiodescrição: ...] para qualquer elemento visual ou imagem mencionada na questão',
    ].filter(Boolean).join(', ') || 'padrão acessível';

    const imgField = gerarImagensIA ? '"imagePrompt":"descrição de ilustração didática"' : '';

    const contextInfo = [
      `Etapa: ${etapaEnsino || 'Ensino Fundamental'} | Ano: ${ano}`,
      `Estilos: ${estilos}`,
      perfis.length ? `Perfis NEE: ${perfis.join('; ')}` : '',
      adaptacoes ? `Adaptações extras: ${adaptacoes}` : '',
      `Regras de qualidade: SIMPLIFICAR não é RESUMIR. Use **negrito** para termos importantes. Mantenha o contexto.`,
    ].filter(Boolean).join('\n');

    // ── Fluxo de refinamento (sem mudança) ───────────────────────────────
    if (isRefinement) {
      const sysRef = `Você é especialista em educação inclusiva. Refine a questão conforme a ação. Responda APENAS com JSON da questão refinada, mantendo o "id" original e o mesmo schema.`;
      const usrRef = `QUESTÃO:\n${JSON.stringify(questionToRefine, null, 2)}\n\nAÇÃO: ${refinementAction}`;
      const raw = await callAI(openRouterKey, groqKey, geminiKey, sysRef, usrRef, 1000);
      if (!raw) return NextResponse.json({ error: 'IA indisponível para refinamento.' }, { status: 503 });
      try {
        const p = parseJSON(raw);
        return NextResponse.json(p.questions?.[0] ?? p);
      } catch {
        return NextResponse.json({ error: 'JSON inválido no refinamento.' }, { status: 500 });
      }
    }

    // ── Fluxo principal: uma chamada POR tipo ─────────────────────────────
    rateLimit70B = false; // reset por request
    rateLimit8B = false;  // reset por request
    blockedOpenRouterModels = new Set(); // reset por request
    const qTypes = questionTypes as any;
    // Contexto amplo restaurado para 5000 chars (~1.3k tokens)
    const materialSnippet = (material || '').slice(0, 5000);

    // Monta lista de jobs { typeKey, qty }
    // ORDEM: essay vem primeiro para garantir que pega budget de tokens fresco
    const jobs: { typeKey: string; qty: number; alternatives?: number }[] = [];
    if (qTypes?.essay?.enabled)          jobs.push({ typeKey: 'essay',           qty: qTypes.essay.quantity || 1 });
    if (qTypes?.multipleChoice?.enabled) jobs.push({ typeKey: 'multiple_choice', qty: qTypes.multipleChoice.quantity || 1, alternatives: qTypes.multipleChoice.alternatives || 4 });
    if (qTypes?.trueFalse?.enabled)      jobs.push({ typeKey: 'true_false',      qty: qTypes.trueFalse.quantity || 1 });
    if (qTypes?.fillBlanks?.enabled)     jobs.push({ typeKey: 'fill_blanks',     qty: qTypes.fillBlanks.quantity || 1 });
    if (qTypes?.matchColumns?.enabled)   jobs.push({ typeKey: 'match_columns',   qty: qTypes.matchColumns.quantity || 1 });

    if (jobs.length === 0) {
      return NextResponse.json({ error: 'Nenhum tipo de questão selecionado.' }, { status: 400 });
    }

    // Quebra cada job em lotes de no máximo CHUNK_SIZE questões por chamada de IA.
    // Pedir muitas questões (ex: 10) em uma única chamada estoura o orçamento de
    // tokens e a resposta vem truncada/incompleta — dividir em lotes menores evita isso.
    const CHUNK_SIZE = 4;
    const batches: { typeKey: string; qty: number; alternatives?: number }[] = [];
    for (const job of jobs) {
      let remaining = job.qty;
      while (remaining > 0) {
        const qty = Math.min(CHUNK_SIZE, remaining);
        batches.push({ typeKey: job.typeKey, qty, alternatives: job.alternatives });
        remaining -= qty;
      }
    }

    // Executa lotes sequencialmente para não exceder TPM do Groq / rate limit do OpenRouter
    let allQuestions: any[] = [];
    let idIndex = 1;
    let title = 'Avaliação Adaptada';
    let overallAEEInfo = '';

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (i > 0) await sleep(1500); // respeita TPM entre chamadas

      let qs = await generateQuestionsOfType({
        openRouterKey, groqKey, geminiKey,
        typeKey: batch.typeKey,
        qty: batch.qty,
        materialSnippet,
        contextInfo,
        imgField,
        fileBase64,
        fileType,
        startIndex: idIndex,
        alternatives: batch.alternatives,
      });

      // Retry automático se o lote falhou (limite transitório)
      if (qs.length === 0) {
        console.warn(`[Route] ${batch.typeKey} (lote de ${batch.qty}) falhou — retry em 3s`);
        await sleep(3000);
        rateLimit70B = false;
        rateLimit8B = false;
        blockedOpenRouterModels = new Set();
        qs = await generateQuestionsOfType({
          openRouterKey, groqKey, geminiKey,
          typeKey: batch.typeKey,
          qty: batch.qty,
          materialSnippet,
          contextInfo,
          imgField,
          fileBase64,
          fileType,
          startIndex: idIndex,
          alternatives: batch.alternatives,
        });
      }

      allQuestions = allQuestions.concat(qs);
      idIndex += qs.length || batch.qty;
    }

    if (allQuestions.length === 0) {
      const gErr = lastGeminiError ? ` (Erro IA: ${lastGeminiError})` : '';
      return NextResponse.json(
        { error: 'Todos os provedores de IA falharam.' + gErr + ' Aguarde alguns minutos e tente novamente.' },
        { status: 503 }
      );
    }

    // Gera título via IA usando uma chamada leve
    try {
      const titleRaw = await callAI(openRouterKey, groqKey, geminiKey,
        'Responda APENAS um JSON: {"title":"título curto da avaliação","overallAEEInfo":"resumo das adaptações aplicadas"}',
        `Material: ${materialSnippet.slice(0, 500)}\nPerfis: ${perfis.join(', ')}\nEstilos: ${estilos}`,
        200
      );
      if (titleRaw) {
        const tp = parseJSON(titleRaw);
        title = tp.title || title;
        overallAEEInfo = tp.overallAEEInfo || '';
      }
    } catch { /* título padrão */ }

    // Renumera originalNumber sequencialmente
    allQuestions = allQuestions.map((q, i) => ({ ...q, originalNumber: String(i + 1) }));

    return NextResponse.json({
      title,
      studentInfo: true,
      overallAEEInfo,
      questions: allQuestions,
    });

  } catch (error: any) {
    console.error('[Route] Erro interno:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}
