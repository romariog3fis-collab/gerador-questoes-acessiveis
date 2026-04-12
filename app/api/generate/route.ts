import { NextResponse } from 'next/server';

// ── Groq API - 100% Gratuito ────────────────────────────────────────
// Modelo: llama-3.3-70b-versatile
// Limites gratuitos: 14.400 req/dia, 30 req/min, 32.768 tokens/req
// Docs: https://console.groq.com/docs/openai
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PRIMARY_MODEL   = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL  = 'llama-3.1-8b-instant'; // fallback rápido se o 70B estiver sobrecarregado

export async function POST(req: Request) {
  try {
    const {
      material, adaptacoes, ano, etapaEnsino,
      estilosAdaptacao, caixaAlta, gerarImagensIA,
      fileBase64, fileType,
      isRefinement, refinementAction, questionToRefine
    } = await req.json();

    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada no servidor.' }, { status: 500 });
    }

    // ── Detecção de perfis NEE ─────────────────────────────────────
    const lower = (adaptacoes || '').toLowerCase();
    const perfis: string[] = [];

    if (lower.includes('discalculia')) perfis.push(
      'DISCALCULIA: Elimine/substitua cálculos numéricos por raciocínio qualitativo. Quando inevitável, forneça o resultado e peça só interpretação. Use analogias cotidianas.');
    if (lower.includes('tdah')) perfis.push(
      'TDAH: Enunciados curtos (≤3 linhas), uma ideia por questão, destaque palavra-chave em negrito, alternativas curtas e distintas.');
    if (lower.includes('dislexia')) perfis.push(
      'DISLEXIA: Frases curtas (≤15 palavras), listas com marcadores, glossário amplo.');
    if (lower.includes('autismo') || lower.includes('tea')) perfis.push(
      'TEA: Linguagem literal sem metáforas, estrutura previsível, exemplos concretos, passo a passo de como responder.');
    if (lower.includes('visual')) perfis.push(
      'DEF. VISUAL: Sem referências visuais sem descrição textual completa.');
    if (lower.includes('intelectual')) perfis.push(
      'DEF. INTELECTUAL: Frases ≤10 palavras, máx 2 alternativas (A/B), exemplo da vida real antes do enunciado.');

    // ── Estilos ────────────────────────────────────────────────────
    const estilos = [
      estilosAdaptacao?.destacarChave    && 'negrito nas info-chave',
      estilosAdaptacao?.dividirBlocos    && 'blocos pequenos espaçados',
      estilosAdaptacao?.listasMarcadores && 'listas com marcadores',
      estilosAdaptacao?.simplificarLinguagem && 'linguagem simples',
      caixaAlta && 'TODO O TEXTO EM MAIÚSCULAS',
    ].filter(Boolean).join(', ');

    // ── Schema JSON de saída ───────────────────────────────────────
    const imgField = gerarImagensIA ? `"imagePrompt":"descrição para imagem didática",` : '';

    // ── Construção do prompt ───────────────────────────────────────
    let systemPrompt = `Você é especialista em educação inclusiva e pedagogia adaptada. 
Responda SEMPRE com JSON puro e válido — sem markdown, sem comentários, sem texto fora do JSON.

SCHEMA obrigatório:
{"title":"...","studentInfo":true,"overallAEEInfo":"orientações ao professor","questions":[{"id":"q1","originalNumber":"1","bloomLevel":"Lembrar","content":"enunciado com alternativas A) B) C)...","type":"multiple_choice","answer":"A) texto","justification":"motivo pedagógico",${imgField}"glossary":[{"word":"termo","meaning":"def"}],"steps":["passo 1"]}]}

${!gerarImagensIA ? 'IMPORTANTE: NÃO inclua o campo imagePrompt.' : ''}`;

    let userPrompt = '';

    if (isRefinement) {
      userPrompt = `Refine a questão abaixo conforme a ação solicitada. Retorne SOMENTE o JSON da questão refinada (mesmo schema).

QUESTÃO ORIGINAL:
${JSON.stringify(questionToRefine, null, 2)}

AÇÃO: ${refinementAction}`;
    } else {
      userPrompt = `Adapte a avaliação abaixo seguindo EXATAMENTE estas instruções:

REGRAS ABSOLUTAS:
1. Quantidade: siga o campo ADAPTAÇÕES (ex: "8 questões, 3 alternativas" → gere exatamente isso).
2. Perfis NEE — aplique obrigatoriamente:
${perfis.length ? perfis.map(p => '   • ' + p).join('\n') : '   • Adaptação geral de acessibilidade.'}
3. Estilos: ${estilos || 'padrão acessível'}.
4. Etapa: ${etapaEnsino || 'Ensino Fundamental'} — priorize Bloom: Lembrar, Entender, Aplicar.

MATERIAL ORIGINAL:
${material}

ADAPTAÇÕES SOLICITADAS:
${adaptacoes || 'Adaptação geral inclusiva.'}
ANO: ${ano} | ETAPA: ${etapaEnsino}`;

      // Se veio arquivo de imagem/PDF como base64, adicionar aviso ao prompt
      if (fileBase64) {
        userPrompt += `\n\n[NOTA: Um arquivo foi anexado mas não pode ser processado diretamente. Use o texto do material acima para fazer a adaptação.]`;
      }
    }

    // ── Chamada à API do Groq ──────────────────────────────────────
    const callGroq = async (model: string) => {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 4000,
          response_format: { type: 'json_object' }, // força JSON válido
        }),
      });
      return res;
    };

    // Tenta modelo principal, com fallback automático
    let response = await callGroq(PRIMARY_MODEL);

    // Se o modelo principal falhar por estar sobrecarregado (503), limite de tokens (429) ou mensagem muito grande para o tier (400)
    if (!response.ok && [400, 429, 503].includes(response.status)) {
      console.warn(`[Groq] Erro ${response.status} com ${PRIMARY_MODEL}, tentando fallback ${FALLBACK_MODEL}...`);
      response = await callGroq(FALLBACK_MODEL);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('[Groq] Erro:', data);
      const msg = data.error?.message || 'Erro na API do Groq.';
      return NextResponse.json({ error: msg }, { status: response.status });
    }

    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json\n?|```/g, '').trim();

    return NextResponse.json(JSON.parse(clean));

  } catch (error: any) {
    console.error('[Route] Erro interno:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}
