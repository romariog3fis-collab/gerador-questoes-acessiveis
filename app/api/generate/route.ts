import { NextResponse } from 'next/server';

const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const SMALL_MODEL   = 'llama-3.1-8b-instant';

// ── Pré-processador de material ────────────────────────────────────────────
// Reduz tokens em ~40-60% removendo ruído antes de enviar para a IA
function preprocessMaterial(raw: string): string {
  if (!raw || raw.length < 50) return raw;

  // 1. Normalizar quebras de linha e espaços
  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')          // múltiplos espaços → 1 espaço
    .replace(/\n{3,}/g, '\n\n');      // mais de 2 quebras → 2

  // 2. Remover cabeçalhos típicos de prova (escola, data, nome, turma, valor)
  const headerPatterns = [
    /^.{0,120}(escola|colégio|instituto|s\.?e\.?m\.?|secretaria).{0,120}$/im,
    /^.{0,120}(professor[ao]?:|prof\.?:|docente:).{0,120}$/im,
    /^.{0,120}(data:|turma:|série:|ano:|bimestre:|período:|valor:).{0,120}$/im,
    /^.{0,120}(nome[:\s_\.]+){1,2}$/im,
    /^.{0,120}(assinatura[:\s_]+)$/im,
    /^.{0,120}(avalia[çc][aã]o|prova|teste|exame)[^:]*$/im,
    /^.{0,50}(\d{1,2}\/\d{1,2}\/\d{2,4}).{0,50}$/im,
  ];
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true; // manter linhas em branco (separadores)
    if (trimmed.length < 5) return false;  // linhas muito curtas são ruído
    // Remover linhas que casam com padrões de cabeçalho nas primeiras 15 linhas
    const idx = lines.indexOf(line);
    if (idx < 15) {
      return !headerPatterns.some(p => p.test(trimmed));
    }
    return true;
  });
  text = filteredLines.join('\n');

  // 3. Remover rodapés comuns
  const footerPatterns = [
    /bons estudos[!.]*/gi,
    /boa sorte[!.]*/gi,
    /responda com atenção.*/gi,
    /leia atentamente as questões.*/gi,
    /use a folha de rascunho.*/gi,
    /não é permitido.*/gi,
    /proibido o uso de.*/gi,
  ];
  footerPatterns.forEach(p => { text = text.replace(p, ''); });

  // 4. Remover linhas de preenchimento (__ _ _ __ / --- / === / ...)
  text = text.replace(/^[\s_\-=\.]{5,}$/gm, '');

  // 5. Remoção de pontuações repetidas ex: "................  2,0 pts"
  text = text.replace(/\.{4,}/g, ' ');
  text = text.replace(/-{4,}/g, ' ');

  // 6. Comprimir resultado final
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // 7. Limite de segurança: ~5.500 caracteres (~1.375 tokens)
  if (text.length > 5500) {
    text = text.slice(0, 5500) + '\n[...material truncado para otimização...]';
  }

  return text;
}

// Estima quantidade de tokens (aprox: 1 token ≈ 4 chars em pt-BR)
function estimateTokens(text: string) {
  return Math.round(text.length / 4);
}

export async function POST(req: Request) {
  try {
    const {
      material, adaptacoes, ano, etapaEnsino,
      estilosAdaptacao, caixaAlta, gerarImagensIA,
      fileBase64,
      isRefinement, refinementAction, questionToRefine
    } = await req.json();

    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada no servidor.' }, { status: 500 });
    }

    // ── Detecção de perfis NEE ─────────────────────────────────────────────
    const lower = (adaptacoes || '').toLowerCase();
    const perfis: string[] = [];
    if (lower.includes('discalculia')) perfis.push('DISCALCULIA: substitua cálculos por raciocínio qualitativo. Forneça resultado pronto quando inevitável. Use analogias do cotidiano.');
    if (lower.includes('tdah'))        perfis.push('TDAH: enunciados ≤3 linhas, palavra-chave em **negrito**, alternativas curtas e distintas.');
    if (lower.includes('dislexia'))    perfis.push('DISLEXIA: frases ≤15 palavras, listas com marcadores, glossário amplo.');
    if (lower.includes('autismo') || lower.includes('tea')) perfis.push('TEA: linguagem literal, sem metáforas, exemplos concretos, passo a passo de como responder.');
    if (lower.includes('visual'))      perfis.push('DEF. VISUAL: descreva textualmente tudo que seria visual.');
    if (lower.includes('intelectual')) perfis.push('DEF. INTELECTUAL: frases ≤10 palavras, máx 2 alternativas (A/B), exemplo real antes do enunciado.');

    // ── Estilos pedagógicos ────────────────────────────────────────────────
    const estilos = [
      estilosAdaptacao?.destacarChave        && 'negrito nas info-chave',
      estilosAdaptacao?.dividirBlocos        && 'blocos pequenos espaçados',
      estilosAdaptacao?.listasMarcadores     && 'listas com marcadores',
      estilosAdaptacao?.simplificarLinguagem && 'linguagem simples',
      caixaAlta                              && 'TODO O TEXTO EM MAIÚSCULAS',
    ].filter(Boolean).join(', ') || 'padrão acessível';

    // ── Detectar quantidade e mistura de tipos pedida ──────────────────────
    // Ex: "5 objetivas e 5 subjetivas", "8 questões com abc", "10 objetivas"
    const qtdMatch = (adaptacoes || '').match(/(\d+)\s*(quest[oõ]es?|objetivas?|subjetivas?|discursivas?)/gi) || [];
    let qtdObjetivas: number | null = null;
    let qtdSubjetivas: number | null = null;
    let qtdTotal: number | null = null;

    const adLower = (adaptacoes || '').toLowerCase();
    // Detecta padrões como "5 objetivas" "5 subjetivas" "10 questoes"
    const objMatch = adLower.match(/(\d+)\s*objetivas?/);
    const subMatch = adLower.match(/(\d+)\s*(subjetivas?|discursivas?)/);
    const totMatch = adLower.match(/(\d+)\s*quest[oõ]es?/);

    if (objMatch) qtdObjetivas = parseInt(objMatch[1]);
    if (subMatch) qtdSubjetivas = parseInt(subMatch[1]);
    if (totMatch && !objMatch && !subMatch) qtdTotal = parseInt(totMatch[1]);

    let instrucaoQuantidade = '';
    if (qtdObjetivas !== null && qtdSubjetivas !== null) {
      instrucaoQuantidade = `GERE EXATAMENTE ${qtdObjetivas + qtdSubjetivas} questões: ${qtdObjetivas} com type="multiple_choice" (objetivas com alternativas A) B) C)...) e ${qtdSubjetivas} com type="essay" (subjetivas/discursivas, sem alternativas). Total = ${qtdObjetivas + qtdSubjetivas} questões.`;
    } else if (qtdObjetivas !== null) {
      instrucaoQuantidade = `GERE EXATAMENTE ${qtdObjetivas} questões objetivas com type="multiple_choice" e alternativas A) B) C)...`;
    } else if (qtdSubjetivas !== null) {
      instrucaoQuantidade = `GERE EXATAMENTE ${qtdSubjetivas} questões subjetivas/discursivas com type="essay", sem alternativas.`;
    } else if (qtdTotal !== null) {
      instrucaoQuantidade = `GERE EXATAMENTE ${qtdTotal} questões.`;
    } else {
      instrucaoQuantidade = 'Gere o mesmo número de questões que o material original.';
    }

    // ── Número de alternativas ────────────────────────────────────────────
    const altMatch = adLower.match(/(\d+)\s*(alternativas?|op[çc][oõ]es?|itens?)/);
    const instrucaoAlts = altMatch
      ? `Use EXATAMENTE ${altMatch[1]} alternativas nas questões objetivas (ex: A) B) C)${parseInt(altMatch[1]) > 3 ? ' D)' : ''}${parseInt(altMatch[1]) > 4 ? ' E)' : ''}).`
      : 'Use 4 alternativas (A B C D) nas questões objetivas.';

    // ── Schema JSON ───────────────────────────────────────────────────────
    const imgField = gerarImagensIA ? `"imagePrompt":"string descrevendo ilustração didática",` : '';
    const imgNote  = gerarImagensIA ? '' : 'NÃO inclua o campo imagePrompt no JSON.';

    const systemPrompt = `Você é especialista em educação inclusiva. Responda APENAS com JSON válido, sem texto extra, sem markdown.

SCHEMA OBRIGATÓRIO para cada questão:
{
  "id": "q1",
  "originalNumber": "1",
  "bloomLevel": "Lembrar|Entender|Aplicar|Analisar|Avaliar|Criar",
  "type": "multiple_choice" para objetivas OU "essay" para subjetivas/discursivas,
  "content": "enunciado completo. Para multiple_choice inclua as alternativas: A) ... B) ... C) ...",
  "answer": "resposta correta (para essay: resposta esperada resumida)",
  "justification": "justificativa pedagógica breve",
  ${imgField}
  "glossary": [{"word": "termo", "meaning": "definição simples"}],
  "steps": ["passo 1", "passo 2"]
}

${imgNote}
Retorne: {"title":"...","studentInfo":true,"overallAEEInfo":"orientações ao professor","questions":[...]}`;

    let userPrompt = '';

    if (isRefinement) {
      // ── Refinamento de questão individual ─────────────────────────────
      userPrompt = `Refine a questão abaixo conforme a ação. Retorne SOMENTE o JSON da questão refinada, mesmo schema, mantendo o "id" original.

QUESTÃO:
${JSON.stringify(questionToRefine, null, 2)}

AÇÃO: ${refinementAction}`;

    } else {
      // ── Pré-processar material para reduzir tokens ─────────────────────
      const cleanMaterial = preprocessMaterial(material || '');
      const estTokens = estimateTokens(cleanMaterial);
      console.log(`[Route] Material: ${(material||'').length} chars → ${cleanMaterial.length} chars (~${estTokens} tokens após limpeza)`);

      // ── Geração principal ─────────────────────────────────────────────
      userPrompt = `Adapte o material abaixo para uma avaliação inclusiva.

=== REGRAS ABSOLUTAS (não ignore) ===
QUANTIDADE: ${instrucaoQuantidade}
ALTERNATIVAS: ${instrucaoAlts}
PERFIS NEE:
${perfis.length ? perfis.map(p => '  • ' + p).join('\n') : '  • Adaptação geral de acessibilidade.'}
ESTILOS: ${estilos}
ETAPA: ${etapaEnsino || 'Ensino Fundamental'} | ANO: ${ano}
Taxonomia de Bloom: priorize níveis Lembrar, Entender e Aplicar.

=== MATERIAL ORIGINAL ===
${cleanMaterial}

=== ADAPTAÇÕES SOLICITADAS ===
${adaptacoes || 'Adaptação geral inclusiva.'}`;

      if (fileBase64) {
        userPrompt += '\n\n[Arquivo também enviado — use o texto acima como base principal.]';
      }
    }

    // ── Chamada Groq com fallback ─────────────────────────────────────────
    const callGroq = async (model: string, tokens: number) => {
      return fetch(GROQ_API_URL, {
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
          temperature: 0.35,
          max_tokens: tokens,
          response_format: { type: 'json_object' },
        }),
      });
    };

    // Tenta 70B com 5000 tokens; se falhar por tamanho/limite → fallback 8B com 4000 tokens
    let response = await callGroq(PRIMARY_MODEL, 5000);

    if (!response.ok && [400, 429, 503].includes(response.status)) {
      console.warn(`[Groq] ${response.status} no ${PRIMARY_MODEL}, fallback para ${SMALL_MODEL}`);
      response = await callGroq(SMALL_MODEL, 4000);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('[Groq] Erro final:', JSON.stringify(data));
      return NextResponse.json(
        { error: data.error?.message || 'Erro na API do Groq. Tente novamente.' },
        { status: response.status }
      );
    }

    const rawText = data.choices?.[0]?.message?.content || '';
    // Limpa possível markdown ao redor do JSON
    const clean = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[Groq] JSON inválido recebido:', clean.slice(0, 500));
      return NextResponse.json(
        { error: 'Resposta da IA veio em formato inválido. Tente novamente.' },
        { status: 500 }
      );
    }

    // Para refinamento: aceita tanto { questions:[...] } quanto questão direta
    if (isRefinement) {
      const refined = parsed.questions?.[0] ?? parsed;
      return NextResponse.json(refined);
    }

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[Route] Erro interno:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}
