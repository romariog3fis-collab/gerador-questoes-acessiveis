'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
import { Loader2, FileText, Send, Download, Copy, Share2, Sparkles, X, History, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Componentes Refatorados
import { useAuth } from '../src/components/AuthWrapper';
import { db, handleFirestoreError, OperationType } from '../src/lib/firebase';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import SkeletonLoader from '@/src/components/SkeletonLoader';
import QuestionCard from '@/src/components/QuestionCard';
import AdaptationForm from '@/src/components/AdaptationForm';
import AdaptationHistory from '@/src/components/AdaptationHistory';
import { HistoryItem, StructuredResult, Question } from '@/src/types';

export default function Home() {
  // Estados do Formulário
  const [material, setMaterial] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [ano, setAno] = useState('');
  const [etapaEnsino, setEtapaEnsino] = useState('');
  const [adaptacoes, setAdaptacoes] = useState('');
  const [caixaAlta, setCaixaAlta] = useState(false);
  const [incluirDescricaoVisual, setIncluirDescricaoVisual] = useState(false);
  const [gerarImagensIA, setGerarImagensIA] = useState(false);
  const [estilosAdaptacao, setEstilosAdaptacao] = useState({
    destacarChave: false,
    dividirBlocos: false,
    listasMarcadores: false,
    titulosClaros: false,
    simplificarLinguagem: true,
  });

  // Estados de Controle e Resultado
  const [resultado, setResultado] = useState<StructuredResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [generationsCount, setGenerationsCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const MAX_GENERATIONS = 5; // Aumentado para o dev
  
  const resultRef = useRef<HTMLDivElement>(null);
  const { user, profile, loading: authLoading, signOut } = useAuth() as any;
  const userAccessType = profile?.accessType;
  const userExpiresAt = profile?.expiresAt;

  const isFullVersion = profile?.role === 'admin' || userAccessType === 'unlimited' || (userAccessType === 'limited' && userExpiresAt && new Date() <= userExpiresAt);

  // Inicialização do Gemini
  const genAI = new (GoogleGenAI as any)(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');
  const ai = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-pro',
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const path = `users/${user.uid}/generations`;
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(10));
      const querySnapshot = await getDocs(q);
      const items: HistoryItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as HistoryItem);
      });
      setHistory(items);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchHistory();
  }, [user, fetchHistory]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setResultado(null);

    try {
      const systemInstruction = `
        Você é um especialista em educação inclusiva e design instrucional baseada na Taxonomia de Bloom.
        Sua tarefa é ler um material de avaliação e adaptá-lo para alunos com Necessidades Educacionais Especiais (NEE).

        ESTILO DE ADAPTAÇÃO SOLICITADO:
        ${estilosAdaptacao.destacarChave ? '- Destaque informações-chave em NEGTRITO.' : ''}
        ${estilosAdaptacao.dividirBlocos ? '- Divida o texto em blocos pequenos e espaçados.' : ''}
        ${estilosAdaptacao.listasMarcadores ? '- Transforme parágrafos densos em listas com marcadores.' : ''}
        ${estilosAdaptacao.titulosClaros ? '- Use títulos e subtítulos claros e hierárquicos.' : ''}
        ${estilosAdaptacao.simplificarLinguagem ? '- Use LINGUAGEM SIMPLES (evite termos complexos ou técnicos desnecessários).' : ''}

        REGRA DE BLOOM (RÉGUA DE DIFICULDADE):
        - Para ${etapaEnsino}, use prioritariamente os níveis: Lembrar, Entender e Aplicar.
        - Classifique cada questão de acordo com a Taxonomia de Bloom original.

        REGRAS DE FORMATAÇÃO:
        - MANTENHA A NUMERAÇÃO ORIGINAL DAS QUESTÕES. Não reinicie a conta do 1 se o original começar em outro número.
        - Se "Caixa Alta" estiver ON: Todo o conteúdo textual deve ser em MAIÚSCULAS.
        - Se "Gerar Ilustrações" estiver ON: Inclua um imagePrompt técnico em inglês, focado em clipart, fundo branco, estilo vetor flat.

        ESPECIFICAÇÕES DO FORMATO JSON (OBRIGATÓRIO):
        Retorne um objeto JSON seguindo exatamente esta estrutura:
        {
          "title": "Título da Avaliação",
          "studentInfo": true,
          "overallAEEInfo": "Resumo pedagógico da adaptação aplicada...",
          "questions": [
            {
              "id": "string único",
              "originalNumber": "string ou número",
              "bloomLevel": "Lembrar|Entender|Aplicar|Analisar|Avaliar|Criar",
              "content": "Enunciado em Markdown...",
              "type": "multiple_choice | essay",
              "answer": "Gabarito",
              "justification": "Justificativa pedagógica",
              "imagePrompt": "Clipart vector illustration of [subject]...",
              "glossary": [{"word": "...", "meaning": "..."}],
              "steps": ["passo 1", "passo 2"]
            }
          ]
        }
      `;

      let parts: any[] = [];
      if (file) {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        if (fileExtension === 'docx') {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          parts.push({ text: `CONTEÚDO DO ARQUIVO:\n${result.value}` });
        } else if (fileExtension === 'txt') {
          parts.push({ text: `CONTEÚDO DO ARQUIVO:\n${await file.text()}` });
        } else {
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });
          parts.push({ inlineData: { data: base64Data, mimeType: file.type || 'application/pdf' } });
        }
      }
      parts.push({ text: `CONTEXTO ADICIONAL: ${material}\nADAPTAÇÕES: ${adaptacoes}\nANO: ${ano}\nETAPA: ${etapaEnsino}` });
      parts.push({ text: `CAIXA ALTA: ${caixaAlta ? 'SIM' : 'NÃO'}\nIMAGENS: ${gerarImagensIA ? 'SIM' : 'NÃO'}` });

      const result = await ai.generateContent({
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: systemInstruction }] } as any,
      });

      const responseText = result.response.text();
      // Limpeza de possíveis markdown wrappers se houver
      const cleanJson = responseText.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(cleanJson) as StructuredResult;
      
      setResultado(parsed);
      
      // Salvar no Histórico
      if (user) {
        await addDoc(collection(db, `users/${user.uid}/generations`), {
          content: responseText,
          adaptationType: adaptacoes.split('\n')[0].replace('- ', '') || 'Geral',
          createdAt: serverTimestamp(),
          metadata: { ano, etapaEnsino }
        });
        fetchHistory();
      }

    } catch (err: any) {
      console.error(err);
      setError('Falha ao processar material. Verifique o formato do arquivo ou tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const refineQuestion = async (id: string, action: 'simplify' | 'accessible' | 'change_type') => {
    if (refiningId || !resultado) return;
    setRefiningId(id);
    
    try {
      const question = resultado.questions.find(q => q.id === id);
      if (!question) return;

      const actionPrompt = {
        simplify: "Simplifique o nível de dificuldade desta questão (desça um nível na Taxonomia de Bloom). Use linguagem ainda mais direta e reduza a carga cognitiva.",
        accessible: "Torne esta questão mais acessível (AEE). Foque em reduzir barreiras de compreensão e forneça mais suporte visual/glossário se necessário.",
        change_type: `Mude o formato desta questão de ${question.type === 'multiple_choice' ? 'Múltipla Escolha para Discursiva' : 'Discursiva para Múltipla Escolha'}.`
      }[action];

      const prompt = `
        VOCÊ ESTÁ REFINANDO UMA ÚNICA QUESTÃO.
        MATERIAL ORIGINAL DA QUESTÃO: ${JSON.stringify(question)}
        COMANDO DE REFINAMENTO: ${actionPrompt}
        
        RETORNE APENAS O OBJETO JSON DA QUESTÃO REFINADA, SEGUINDO O MESMO SCHEMA (apenas o objeto da questão, não a lista completa).
      `;

      const result = await ai.generateContent(prompt);
      const refinedQuestion = JSON.parse(result.response.text()) as Question;

      setResultado({
        ...resultado,
        questions: resultado.questions.map(q => q.id === id ? refinedQuestion : q)
      });
    } catch (err) {
      console.error(err);
      setError('Erro ao refinar a questão.');
    } finally {
      setRefiningId(null);
    }
  };

  const handleDownloadDoc = async () => {
    if (!resultado) return;
    setLoading(true);

    try {
      // Gerar HTML limpo para o Word
      let docHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h1 style="text-align: center; color: #1e293b;">${resultado.title}</h1>
          ${resultado.studentInfo ? '<div style="border: 1px solid #cbd5e1; padding: 10px; margin-bottom: 20px;">Nome: ____________________________________ Data: ___/___/___</div>' : ''}
          <p style="color: #64748b; font-size: 10px; text-transform: uppercase;">${resultado.overallAEEInfo || ''}</p>
          <hr />
      `;

      resultado.questions.forEach(q => {
        docHtml += `
          <div style="margin-bottom: 30px; page-break-inside: avoid;">
            <h3 style="color: #0f172a;">Questão ${q.originalNumber}</h3>
            <div style="color: #334155;">${q.content.replace(/\n/g, '<br>')}</div>
            ${q.imagePrompt ? '<div style="margin: 20px 0; font-style: italic; color: #94a3b8;">[Espaço para Imagem: ' + q.imagePrompt + ']</div>' : ''}
            <div style="margin-top: 15px; background-color: #f8fafc; padding: 10px; font-size: 11px;">
              <strong>Gabarito:</strong> ${q.answer}<br>
              <strong>Justificativa:</strong> ${q.justification}
            </div>
          </div>
        `;
      });

      docHtml += '</div>';

      const header = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' 
              xmlns:w='urn:schemas-microsoft-com:office:word' 
              xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Avaliação Adaptada</title></head><body>
      `;
      const footer = "</body></html>";
      const sourceData = header + docHtml + footer;

      const blob = new Blob(['\ufeff', sourceData], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Avaliacao_Adaptada_${resultado.title.replace(/\s+/g, '_')}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
      setError("Erro ao gerar arquivo Word.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-[#fcfdfe] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Background Decor */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.03),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.03),transparent_40%)]" />
      
      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="mb-16 text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-[10px] uppercase font-black tracking-[0.2em] mb-4 border border-blue-100/50 shadow-sm"
          >
            <Sparkles size={12} />
            Educação Inclusiva & IA
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 tracking-tighter">Gerador <span className="text-blue-600">Acessível</span></h1>
          <p className="text-slate-400 font-medium max-w-lg mx-auto leading-relaxed">Adapte avaliações usando pedagogia baseada em evidências e um motor de IA treinado para acessibilidade.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Coluna Esquerda: Formulário e Histórico */}
          <div className="lg:col-span-5 space-y-12 no-print">
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-8 rounded-[3rem] shadow-[0_8px_40px_rgb(0,0,0,0.03)] border border-slate-100"
            >
              <AdaptationForm 
                loading={loading}
                onSubmit={handleGenerate}
                file={file}
                setFile={setFile}
                material={material}
                setMaterial={setMaterial}
                etapaEnsino={etapaEnsino}
                setEtapaEnsino={setEtapaEnsino}
                ano={ano}
                setAno={setAno}
                caixaAlta={caixaAlta}
                setCaixaAlta={setCaixaAlta}
                incluirDescricaoVisual={incluirDescricaoVisual}
                setIncluirDescricaoVisual={setIncluirDescricaoVisual}
                gerarImagensIA={gerarImagensIA}
                setGerarImagensIA={setGerarImagensIA}
                adaptacoes={adaptacoes}
                setAdaptacoes={setAdaptacoes}
                estilosAdaptacao={estilosAdaptacao}
                setEstilosAdaptacao={setEstilosAdaptacao}
                generationsCount={generationsCount}
                MAX_GENERATIONS={MAX_GENERATIONS}
                isFullVersion={isFullVersion}
              />
            </motion.div>

            {user && (
              <div className="px-4">
                <h3 className="text-lg font-black mb-8 flex items-center gap-3 text-slate-800">
                  <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                    <History size={16} className="text-slate-400" />
                  </div>
                  Materiais Recentes
                </h3>
                <AdaptationHistory 
                  history={history} 
                  onSelect={(item) => {
                    try {
                      setResultado(JSON.parse(item.content));
                    } catch (e) {
                      setError("Não foi possível carregar este item do histórico.");
                    }
                  }} 
                />
              </div>
            )}
          </div>

          {/* Coluna Direita: Resultado */}
          <div className="lg:col-span-7 flex flex-col h-full min-h-[800px]">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <SkeletonLoader />
                </motion.div>
              ) : resultado ? (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div className="flex justify-between items-center mb-4 no-print">
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                      <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-2xl">
                        <Share2 size={20} className="rotate-45" />
                      </div>
                      Pronto para Uso
                    </h2>
                    <div className="flex gap-3">
                      <button onClick={handleDownloadDoc} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95">
                        <FileText size={14} /> EXPORTAR WORD
                      </button>
                      <button onClick={handlePrint} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95">
                        <Download size={14} /> EXPORTAR PDF
                      </button>
                    </div>
                  </div>

                  {resultado.overallAEEInfo && (
                    <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 text-blue-800 mb-8">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Resumo da Inclusão</p>
                      <p className="text-xs font-bold leading-relaxed">{resultado.overallAEEInfo}</p>
                    </div>
                  )}

                  <div className="space-y-8" ref={resultRef}>
                    {resultado.questions.map((q) => (
                      <QuestionCard 
                        key={q.id} 
                        question={q} 
                        onRefine={refineQuestion}
                        refiningId={refiningId}
                      />
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full border-2 border-dashed border-slate-100 rounded-[3rem] flex flex-col items-center justify-center p-12 text-center"
                >
                  <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-6">
                    <FileText size={40} className="text-slate-200" />
                  </div>
                  <h2 className="text-xl font-black text-slate-800 mb-2">Configure sua Avaliação</h2>
                  <p className="text-sm text-slate-400 max-w-xs">Anexe um material ao lado e escolha as adaptações pedagógicas para começar.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="mt-8 bg-red-50 text-red-600 p-6 rounded-3xl border border-red-100 text-sm font-bold flex items-center gap-3">
                <X size={20} />
                {error}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
