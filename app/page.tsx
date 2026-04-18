'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
import FeedbackButton from '@/src/components/FeedbackButton';
import { HistoryItem, StructuredResult, Question } from '@/src/types';
import { QuestionTypesState } from '@/src/components/QuestionTypesSelector';

export default function Home() {
  // Estados do Formulário
  const [material, setMaterial] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [ano, setAno] = useState('');
  const [etapaEnsino, setEtapaEnsino] = useState('');
  const [adaptacoes, setAdaptacoes] = useState('');
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionTypesState>({
    multipleChoice: { enabled: true,  quantity: 0, alternatives: 4 },
    trueFalse:      { enabled: false, quantity: 0 },
    fillBlanks:     { enabled: false, quantity: 0 },
    matchColumns:   { enabled: false, quantity: 0 },
    essay:          { enabled: false, quantity: 0 },
  });
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
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const MAX_GENERATIONS = 5;
  
  const resultRef = useRef<HTMLDivElement>(null);
  const { user, profile, loading: authLoading, signOut } = useAuth() as any;
  const userAccessType = profile?.accessType;
  const userExpiresAt = profile?.expiresAt;

  const isFullVersion = profile?.role === 'admin' || userAccessType === 'unlimited' || (userAccessType === 'limited' && userExpiresAt && new Date() <= userExpiresAt);

  // Removida inicialização global para evitar erro de API Key no client side puro

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const path = `users/${user.uid}/generations`;
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(10));
      const querySnapshot = await getDocs(q);
      const items: HistoryItem[] = [];
      let monthCount = 0;
      const now = new Date();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        items.push({ id: doc.id, ...data } as HistoryItem);
        // Contar apenas adaptações do mês atual
        if (data.createdAt) {
          const createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          if (createdDate.getMonth() === now.getMonth() && createdDate.getFullYear() === now.getFullYear()) {
            monthCount++;
          }
        }
      });
      setHistory(items);
      setGenerationsCount(monthCount);
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

    // Bloquear se não for versão completa e atingiu o limite mensal
    if (!isFullVersion && generationsCount >= MAX_GENERATIONS) {
      setError(`Você atingiu o limite de ${MAX_GENERATIONS} adaptações gratuitas este mês. O contador reseta no início do próximo mês.`);
      return;
    }

    setLoading(true);
    if (!file && !material.trim()) {
      setError('Por favor, anexe um arquivo ou digite o texto da avaliação original.');
      setLoading(false);
      return;
    }

    try {
      let fileBase64 = null;
      let fileType = null;
      let contextMaterial = material;

      if (file) {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        if (fileExtension === 'docx') {
          const arrayBuffer = await file.arrayBuffer();
          const docxResult = await mammoth.extractRawText({ arrayBuffer });
          const extractedText = docxResult.value?.trim() || '';

          if (extractedText.length < 80) {
            // Texto muito curto = extração falhou (DOCX com imagens, PDF renomeado, etc.)
            setError(
              'Não foi possível ler o conteúdo do arquivo. O documento pode conter apenas imagens, ' +
              'estar protegido, ou ser um PDF renomeado como .docx. Por favor, cole o texto das questões manualmente no campo abaixo.'
            );
            setLoading(false);
            return;
          }

          contextMaterial = `QUESTÕES DA PROVA ORIGINAL (extraídas do documento):\n${extractedText}\n\n${material ? `INSTRUÇÕES ADICIONAIS DO PROFESSOR:\n${material}` : ''}`;
        } else if (fileExtension === 'txt') {
          const txtContent = await file.text();
          contextMaterial = `QUESTÕES DA PROVA ORIGINAL (extraídas do arquivo):\n${txtContent}\n\n${material ? `INSTRUÇÕES ADICIONAIS DO PROFESSOR:\n${material}` : ''}`;
        } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
          fileType = file.type;
          fileBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });
        }
      }

      // Validar se há algum material para trabalhar
      if (!contextMaterial?.trim() && !fileBase64) {
        setError('Por favor, cole o texto da prova ou anexe um arquivo antes de gerar a adaptação.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material: contextMaterial,
          adaptacoes,
          selectedProfiles,
          questionTypes,
          ano,
          etapaEnsino,
          estilosAdaptacao,
          caixaAlta,
          gerarImagensIA,
          fileBase64,
          fileType,
          isRefinement: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha na resposta do servidor.');
      }

      const parsed = await response.json() as StructuredResult;
      setResultado(parsed);
      
      // Salvar no Histórico e debitar crédito
      if (user) {
        await addDoc(collection(db, `users/${user.uid}/generations`), {
          content: JSON.stringify(parsed),
          adaptationType: adaptacoes.split('\n')[0].replace('- ', '') || 'Geral',
          createdAt: serverTimestamp(),
          metadata: { ano, etapaEnsino }
        });
        setGenerationsCount(prev => prev + 1);
        fetchHistory();
      }

    } catch (err: any) {
      console.error('Erro Gemini:', err);
      const errorMessage = err?.message || 'Falha ao processar material. Verifique a conexão ou tente novamente.';
      setError(errorMessage);
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
        simplify: "Simplifique o nível de dificuldade desta questão (desça um nível na Taxonomia de Bloom). Use linguagem ainda mais direta e reduza a carga cognitiva. Mantenha o id original.",
        accessible: "Torne esta questão mais acessível (AEE). Foque em reduzir barreiras de compreensão e forneça mais suporte visual/glossário se necessário. Mantenha o id original.",
        change_type: `Mude o formato desta questão de ${question.type === 'multiple_choice' ? 'Múltipla Escolha para Discursiva' : 'Discursiva para Múltipla Escolha'}. Mantenha o id original.`
      }[action];

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isRefinement: true,
          refinementAction: actionPrompt,
          questionToRefine: question
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao refinar no servidor. Tente novamente.');
      }

      const refinedData = await response.json();
      // A API pode retornar a questão diretamente ou dentro de { questions: [...] }
      const refinedQuestion: Question = refinedData.questions?.[0] ?? refinedData;

      if (!refinedQuestion?.id && !refinedQuestion?.content) {
        throw new Error('Resposta inválida da IA. Tente refinar novamente.');
      }

      setResultado({
        ...resultado,
        questions: resultado.questions.map(q => q.id === id ? { ...refinedQuestion, id } : q)
      });
    } catch (err: any) {
      console.error('[Refine]', err);
      setError(err?.message || 'Erro ao refinar a questão. Tente novamente.');
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
                setAdaptacoes={setAdaptacoes}
                selectedProfiles={selectedProfiles}
                setSelectedProfiles={setSelectedProfiles}
                questionTypes={questionTypes}
                setQuestionTypes={setQuestionTypes}
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
                      const parsed = JSON.parse(item.content);
                      setResultado(parsed);
                      setError('');
                      setHistoryLoaded(true);
                      setTimeout(() => {
                        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        setTimeout(() => setHistoryLoaded(false), 2500);
                      }, 100);
                    } catch (e) {
                      setError('Não foi possível carregar este item do histórico.');
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
                      {historyLoaded && (
                        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-100 px-4 py-2 rounded-xl text-xs font-bold animate-pulse">
                          <History size={14} />
                          Material do Histórico Carregado!
                        </div>
                      )}
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
      <FeedbackButton userEmail={user?.email || ''} userName={profile?.displayName || user?.displayName || ''} />
    </div>
  );
}
