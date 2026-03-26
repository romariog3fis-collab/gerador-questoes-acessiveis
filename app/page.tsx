'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import mammoth from 'mammoth';
import 'katex/dist/katex.min.css';
import { Loader2, Send, FileText, UploadCloud, X, Download, History, Calendar, Copy, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useAuth } from '../src/components/AuthWrapper';
import { db, handleFirestoreError, OperationType } from '../src/lib/firebase';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { motion } from 'motion/react';

interface HistoryItem {
  id: string;
  adaptationType: string;
  createdAt: Timestamp;
  content: string;
}

const ImagePrompt = ({ prompt }: { prompt: string }) => {
  const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;
  
  return (
    <div className="my-8 rounded-3xl overflow-hidden border border-slate-100 shadow-xl bg-slate-50 group transition-all hover:shadow-2xl hover:border-blue-100">
      <div className="p-4 bg-white border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
            <ImageIcon size={18} />
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ilustração Gerada por IA</span>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full animate-pulse">
          <Sparkles size={12} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">IA Criativa</span>
        </div>
      </div>
      <div className="relative aspect-video bg-slate-200 overflow-hidden">
        <img 
          src={imageUrl} 
          alt={prompt}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      </div>
      <div className="p-4 bg-slate-50/50">
        <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
          "{prompt}"
        </p>
      </div>
    </div>
  );
};

export default function Home() {
  const [material, setMaterial] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [ano, setAno] = useState('');
  const [etapaEnsino, setEtapaEnsino] = useState('');
  const [adaptacoes, setAdaptacoes] = useState('');
  const [caixaAlta, setCaixaAlta] = useState(false);
  const [gerarImagens, setGerarImagens] = useState(false);
  
  const [resultado, setResultado] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generationsCount, setGenerationsCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const MAX_GENERATIONS = 2;

  const { user, profile, isAdmin, loading: authLoading, signIn, signOut } = useAuth();
  
  const userAccessType = profile?.accessType || null;
  const userExpiresAt = profile?.expiresAt ? (profile.expiresAt.toDate ? profile.expiresAt.toDate() : new Date(profile.expiresAt)) : null;
  const isFullVersion = profile?.role === 'admin' || userAccessType === 'unlimited' || (userAccessType === 'limited' && userExpiresAt && new Date() <= userExpiresAt);
  const isAuthReady = !authLoading;

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const path = `users/${user.uid}/generations`;
    try {
      const q = query(
        collection(db, path),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const querySnapshot = await getDocs(q);
      const items: HistoryItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as HistoryItem);
      });
      setHistory(items);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user, fetchHistory]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const storedData = localStorage.getItem('gerador_questoes_usage');
    if (storedData) {
      try {
        const { date, count } = JSON.parse(storedData);
        if (date === today) {
          setGenerationsCount(count);
        } else {
          localStorage.setItem('gerador_questoes_usage', JSON.stringify({ date: today, count: 0 }));
          setGenerationsCount(0);
        }
      } catch (e) {
        localStorage.setItem('gerador_questoes_usage', JSON.stringify({ date: today, count: 0 }));
      }
    } else {
      localStorage.setItem('gerador_questoes_usage', JSON.stringify({ date: today, count: 0 }));
    }
  }, []);

  const handleDownloadDoc = () => {
    if (!resultRef.current) return;
    const htmlContent = resultRef.current.innerHTML;
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Questões Adaptadas</title></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + htmlContent + footer;
    
    const blob = new Blob(['\ufeff', sourceHTML], {
      type: 'application/msword'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    let filename = 'questoes_adaptadas.doc';
    if (file) {
      const originalName = file.name;
      const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
      filename = `${nameWithoutExt}_ADAPTADA.doc`;
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFullVersion && generationsCount >= MAX_GENERATIONS) {
      setError('Limite diário atingido. Você atingiu o limite de 2 gerações por dia na conta degustação. Faça login com uma conta Full para continuar.');
      return;
    }

    setLoading(true);
    setError('');
    setResultado('');

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Chave da API do Gemini não encontrada.');
      }

      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `
Você é um especialista em educação inclusiva e design instrucional, focado em criar materiais de avaliação adaptados para alunos com Necessidades Educacionais Especiais (NEE). Sua tarefa é transformar materiais brutos em questões claras, objetivas e acessíveis.

Rigor de Conteúdo e Estrutura (MUITO IMPORTANTE):
- Baseie-se exclusivamente nos arquivos/textos fornecidos.
- FIDELIDADE À ESTRUTURA ORIGINAL: Você DEVE manter a QUANTIDADE EXATA de questões do material original. Se o material tem 10 questões, você deve adaptar e retornar exatamente 10 questões. Não resuma ou agrupe questões.
- FIDELIDADE AO ESTILO: Você DEVE manter o ESTILO EXATO das questões do material original. Se as questões originais são objetivas (múltipla escolha), as adaptadas DEVEM ser objetivas. Se são subjetivas, as adaptadas DEVEM ser subjetivas.
- Se o material for complexo demais para o nível de adaptação solicitado, simplifique o conceito central mantendo a fidelidade científica/acadêmica.

DIRETRIZ DE FORMATAÇÃO DE TEXTO E RECURSOS:
- Se a opção "Caixa Alta" estiver ativada, você DEVE escrever TODO o conteúdo (enunciados, alternativas, glossário, gabarito, etc.) em LETRAS MAIÚSCULAS. Caso contrário, use a capitalização padrão.
- Se a opção "Recursos Visuais" estiver ativada, você DEVE incluir um "Prompt para Geração de Imagem: [prompt em inglês]" descrevendo detalhadamente a cena visual da questão, para que o professor possa gerar imagens de apoio. O prompt deve ser em inglês, fotorrealista ou no estilo mais adequado para a questão.

Regras de Redação para Acessibilidade:
- Nível de Adaptação: Sempre declare no início de cada questão qual técnica foi usada (ex: Redução de Carga Cognitiva).
- Enunciados: Use frases curtas, ordem direta (Sujeito + Verbo + Complemento) e destaque o comando em negrito (ex: Marque, Identifique, Escreva).
- Evite Negativas: Nunca use "não é correto", "exceto" ou "todas as anteriores".
- Matemática e Cálculos (CRÍTICO): Se a adaptação pedir redução de cálculos ou carga cognitiva, É ESTRITAMENTE PROIBIDO pedir qualquer tipo de cálculo matemático. Transforme a questão INTEIRAMENTE para IDENTIFICAÇÃO VISUAL ou RECONHECIMENTO DE CONCEITO. 
  * Exemplo Errado: "Calcule a força..." ou "Qual é o valor de X?"
  * Exemplo Correto: "Observe a imagem. O que a seta empurrando a caixa representa? (A) Força (B) Temperatura"
  O objetivo é avaliar o entendimento do conceito, NUNCA a habilidade de cálculo. As alternativas devem conter palavras ou descrições visuais, não números para calcular. Use LaTeX ($$) apenas se precisar mostrar a fórmula como uma imagem conceitual.

ESTRUTURA PARA IMAGENS (CRÍTICO):
- Se a opção "Recursos Visuais" estiver ativada, você DEVE SEMPRE gerar um prompt descritivo para cada questão.
- O formato DEVE ser exatamente: [PROMPT_IMAGEM: descrição detalhada em inglês da cena visual que ilustra a questão]
- **REGRA DE OURO**: NÃO TRADUZA a palavra "PROMPT_IMAGEM". Use sempre este termo exato entre colchetes, mesmo se o texto estiver em CAIXA ALTA.
- Coloque este código e o prompt SEMPRE logo abaixo do enunciado da questão.

Estrutura da Saída (Questão Objetiva):
- Fonte: Identificar o material.
- Nível de Adaptação: [Descrição].
- Enunciado: [Texto direto].
- [PROMPT_IMAGEM: prompt em inglês] (Apenas se a opção estiver ativada).
- Alternativas: Apenas 3 ou 4 (A, B, C, D).
- Recursos de Acessibilidade: Incluir obrigatoriamente Glossário (palavras difíceis) e Passo a Passo (guia mental).
- Gabarito e Justificativa: Letra correta + explicação simples do porquê está certa e por que as outras estão erradas.

Estrutura da Saída (Questão Subjetiva):
- Mesma estrutura de Fonte/Adaptação/Recursos/Prompt de Imagem.
- Enunciado: Pergunta direta com espaço para resposta: R: _________________.
- Gabarito: Resposta esperada + Critérios de Correção (o que não pode faltar na resposta do aluno).

Restrições:
- Não gere conteúdo fora do material anexado.
- Não use linguagem infantilizada para alunos mais velhos, apenas simplifique a estrutura sintática.
- Formate tudo com Markdown para garantir escaneabilidade (listas, negritos e divisórias).
      `;

      const prompt = `
Por favor, crie as questões com base nas seguintes informações e no arquivo anexado.

DIRETRIZES CRÍTICAS:
1. Verifique o arquivo anexado e conte exatamente quantas questões existem nele. Você DEVE gerar a adaptação para TODAS as questões encontradas. Não omita nenhuma.
2. Verifique o estilo das questões no arquivo anexado (objetiva ou subjetiva) e MANTENHA O MESMO ESTILO na sua adaptação.

- Material de Suporte Adicional (Texto): ${material}
- Etapa de Ensino: ${etapaEnsino}
- Ano Escolar: ${ano}
- Necessidades de Adaptação: ${adaptacoes}
${adaptacoes.toLowerCase().includes('cálculo') || adaptacoes.toLowerCase().includes('cognitiva') || adaptacoes.toLowerCase().includes('discalculia') ? 'ATENÇÃO MÁXIMA: O USUÁRIO PEDIU REDUÇÃO DE CÁLCULOS OU CARGA COGNITIVA. VOCÊ ESTÁ TERMINANTEMENTE PROIBIDO DE INCLUIR QUALQUER CÁLCULO MATEMÁTICO. TRANSFORME TODAS AS QUESTÕES EM IDENTIFICAÇÃO DE IMAGENS OU CONCEITOS BÁSICOS DO DIA A DIA. AS ALTERNATIVAS DEVEM SER PALAVRAS, NÃO NÚMEROS.' : ''}
- Usar Caixa Alta (Letras Maiúsculas): ${caixaAlta ? 'SIM - TODO O TEXTO DEVE ESTAR EM MAIÚSCULAS' : 'NÃO'}
- Recursos Visuais (Prompts para Imagens): ${gerarImagens ? 'SIM - INCLUIR PROMPT EM INGLÊS PARA GERAÇÃO DE IMAGEM' : 'NÃO'}
      `;

      let parts: any[] = [];
      
      if (file) {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        
        if (fileExtension === 'docx') {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          parts.push({ text: `Conteúdo do documento anexado:\n${result.value}` });
        } else if (fileExtension === 'txt') {
          const text = await file.text();
          parts.push({ text: `Conteúdo do documento anexado:\n${text}` });
        } else {
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          let mimeType = file.type;
          if (!mimeType) {
            if (fileExtension === 'pdf') mimeType = 'application/pdf';
            else if (fileExtension === 'png') mimeType = 'image/png';
            else if (fileExtension === 'jpg' || fileExtension === 'jpeg') mimeType = 'image/jpeg';
            else mimeType = 'application/pdf';
          }

          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            }
          });
        }
      }

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      setResultado(response.text || '');
      
      if (user && response.text) {
        const path = `users/${user.uid}/generations`;
        try {
          await addDoc(collection(db, path), {
            userId: user.uid,
            adaptationType: adaptacoes.split('\n').filter(line => line.trim().startsWith('-')).map(line => line.replace('- ', '')).join(', ') || 'Adaptação Geral',
            createdAt: serverTimestamp(),
            content: response.text.substring(0, 500)
          });
          fetchHistory();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      }

      if (!isFullVersion) {
        const newCount = generationsCount + 1;
        setGenerationsCount(newCount);
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('gerador_questoes_usage', JSON.stringify({ date: today, count: newCount }));
      }
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao gerar as questões.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-4 md:p-8 lg:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Geração de Questões <span className="text-blue-600">Acessíveis</span>
            </h1>
            <p className="text-slate-500 text-lg leading-relaxed">
              Transforme materiais didáticos em avaliações inclusivas com o poder da inteligência artificial, 
              garantindo que nenhum aluno fique para trás.
            </p>
          </motion.div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Formulário */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-5 bg-white p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100"
          >
            <h2 className="text-xl font-bold mb-8 flex items-center gap-3 text-slate-900">
              <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl">
                <FileText size={22} />
              </div>
              Configuração do Material
            </h2>
            
            <form onSubmit={handleGenerate} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3 ml-1">Documento Base</label>
                <div 
                  className={`group border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                    file 
                      ? 'border-blue-500 bg-blue-50/50' 
                      : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50 bg-slate-50/30'
                  }`}
                  onClick={() => !file && fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setFile(e.target.files[0]);
                      }
                    }}
                    accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                  />
                  {file ? (
                    <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="text-blue-600" size={20} />
                        </div>
                        <div className="text-left overflow-hidden">
                          <p className="text-sm font-bold text-slate-900 truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Pronto para processar</p>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); setFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="py-2">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:scale-110 transition-transform">
                        <UploadCloud className="text-slate-400 group-hover:text-blue-500 transition-colors" size={24} />
                      </div>
                      <p className="text-sm text-slate-600 font-bold">Clique ou arraste o arquivo</p>
                      <p className="text-xs text-slate-400 mt-2">PDF, DOCX, TXT ou Imagens</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3 ml-1">Contexto Adicional</label>
                <textarea 
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all min-h-[120px] text-sm text-slate-700 placeholder:text-slate-400"
                  placeholder="Instruções específicas, resumos ou partes do texto que não estão no arquivo..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3 ml-1">Etapa de Ensino</label>
                  <select
                    required
                    value={etapaEnsino}
                    onChange={(e) => setEtapaEnsino(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm text-slate-700 appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Selecione...</option>
                    <option value="Ensino Fundamental I (Anos Iniciais)">Fundamental I</option>
                    <option value="Ensino Fundamental II (Anos Finais)">Fundamental II</option>
                    <option value="Ensino Médio">Ensino Médio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3 ml-1">Ano Escolar</label>
                  <input 
                    type="text" 
                    required
                    value={ano}
                    onChange={(e) => setAno(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm text-slate-700 placeholder:text-slate-400"
                    placeholder="Ex: 8º Ano"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div 
                  className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${
                    caixaAlta ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                  }`}
                  onClick={() => setCaixaAlta(!caixaAlta)}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                    caixaAlta ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
                  }`}>
                    {caixaAlta && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <span className={`text-sm font-bold transition-colors ${caixaAlta ? 'text-blue-900' : 'text-slate-600'}`}>
                    Usar CAIXA ALTA (Maiúsculas)
                  </span>
                </div>

                <div 
                  className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${
                    gerarImagens ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                  }`}
                  onClick={() => setGerarImagens(!gerarImagens)}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                    gerarImagens ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'
                  }`}>
                    {gerarImagens && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <span className={`text-sm font-bold transition-colors ${gerarImagens ? 'text-indigo-900' : 'text-slate-600'}`}>
                    Incluir Prompts para Imagens
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3 ml-1">Necessidades de Adaptação</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    "TDAH",
                    "Dislexia",
                    "Discalculia",
                    "Autismo",
                    "Deficiência Visual",
                    "Deficiência Intelectual"
                  ].map((adap) => (
                    <button
                      key={adap}
                      type="button"
                      onClick={() => setAdaptacoes(prev => prev ? (prev.includes(adap) ? prev : `${prev}\n- ${adap}`) : `- ${adap}`)}
                      className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                    >
                      + {adap}
                    </button>
                  ))}
                </div>
                <textarea 
                  required
                  value={adaptacoes}
                  onChange={(e) => setAdaptacoes(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all min-h-[140px] text-sm text-slate-700 placeholder:text-slate-400"
                  placeholder="Descreva as necessidades específicas do aluno ou selecione as sugestões acima..."
                />
              </div>

              <button 
                type="submit" 
                disabled={loading || (!isFullVersion && generationsCount >= MAX_GENERATIONS)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-5 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-xl shadow-slate-200 active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={22} />
                    Processando Material...
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    Gerar Questões Adaptadas
                  </>
                )}
              </button>
              {!isFullVersion && (
                <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                  <p className="text-sm font-bold text-slate-600">
                    Conta Degustação: <span className={generationsCount >= MAX_GENERATIONS ? 'text-red-500' : 'text-blue-600'}>{generationsCount}</span> de {MAX_GENERATIONS} gerações diárias.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">
                    Acesso limitado para testes
                  </p>
                </div>
              )}
              {isFullVersion && userAccessType === 'unlimited' && (
                <div className="mt-6 p-4 bg-blue-50 rounded-2xl border border-blue-100 text-center">
                  <p className="text-sm font-bold text-blue-700">✨ Plano Full Ativado - Ilimitado</p>
                </div>
              )}
              {isFullVersion && userAccessType === 'limited' && userExpiresAt && (
                <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 text-center">
                  <p className="text-sm font-bold text-amber-700">⏱️ Acesso Premium até {userExpiresAt.toLocaleDateString('pt-BR')}</p>
                </div>
              )}
            </form>

            {/* Histórico Recente */}
            {user && (
              <div className="mt-10 pt-10 border-t border-slate-100">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-900">
                  <History size={20} className="text-blue-600" />
                  Gerações Recentes
                </h3>
                {history.length > 0 ? (
                  <div className="space-y-4">
                    {history.map((item) => (
                      <motion.div 
                        key={item.id} 
                        whileHover={{ x: 5 }}
                        className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-white transition-all cursor-pointer group shadow-sm hover:shadow-md" 
                        onClick={() => setResultado(item.content)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest truncate max-w-[180px]">
                            {item.adaptationType}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Calendar size={10} />
                            {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR') : 'Agora'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 group-hover:text-slate-700 transition-colors leading-relaxed">
                          {item.content.replace(/[#*`]/g, '').substring(0, 100)}...
                        </p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhum histórico</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Resultado */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="lg:col-span-7 bg-white p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col h-full min-h-[700px]"
          >
            <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl">
                  <Send size={22} className="rotate-45" />
                </div>
                Material Adaptado
              </h2>
              {resultado && !loading && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(resultado);
                      alert('Copiado para a área de transferência!');
                    }} 
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95 text-sm"
                    title="Copiar texto"
                  >
                    <Copy size={18} />
                    <span>Copiar</span>
                  </button>
                  <button 
                    onClick={handleDownloadDoc} 
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-emerald-100 active:scale-95 text-sm"
                  >
                    <Download size={18} />
                    Exportar .DOC
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100"
                >
                  <p className="font-bold mb-2 flex items-center gap-2">
                    <X size={18} />
                    Erro na geração
                  </p>
                  <p className="text-sm leading-relaxed">{error}</p>
                </motion.div>
              )}

              {!resultado && !loading && !error && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6 py-20">
                  <div className="w-24 h-24 bg-slate-50 rounded-3xl flex items-center justify-center border border-slate-100 shadow-inner">
                    <FileText size={40} className="text-slate-200" />
                  </div>
                  <div className="text-center">
                    <p className="text-slate-900 font-bold mb-1">Aguardando entrada</p>
                    <p className="text-sm text-slate-400 max-w-xs mx-auto">Configure o material ao lado para gerar sua avaliação adaptada.</p>
                  </div>
                </div>
              )}

              {loading && (
                <div className="h-full flex flex-col items-center justify-center space-y-8 py-20">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <Loader2 className="text-blue-600 animate-pulse" size={24} />
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-900 font-bold text-lg mb-2">Processando com IA</p>
                    <p className="text-sm text-slate-400 animate-pulse font-medium">Isso pode levar alguns segundos...</p>
                  </div>
                </div>
              )}

              {resultado && !loading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col h-full"
                >
                  <div ref={resultRef} className="prose prose-slate max-w-none prose-headings:font-extrabold prose-h2:text-slate-900 prose-h3:text-slate-800 prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-900 prose-img:rounded-2xl">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({ children }) => {
                          const childrenArray = Array.isArray(children) ? children : [children];
                          const content = childrenArray
                            .map(child => typeof child === 'string' ? child : (child?.props?.children?.toString() || ''))
                            .join('')
                            .trim();
                          
                          const upperContent = content.toUpperCase();
                          // Detecta variações de tags que a IA costuma usar
                          const isPromptTag = upperContent.includes('[PROMPT_IMAGEM:') || 
                                             upperContent.includes('PROMPT PARA GERAÇÃO DE IMAGEM:') ||
                                             upperContent.includes('PROMPT DE IMAGEM:');

                          if (isPromptTag) {
                            let prompt = '';
                            if (upperContent.includes('[PROMPT_IMAGEM:')) {
                              const match = content.match(/\[PROMPT_IMAGEM:\s*(.*?)\]/i);
                              prompt = match ? match[1] : '';
                            } else {
                              // Fallback para quando a IA esquece os colchetes or traduz a tag
                              prompt = content
                                .replace(/PROMPT PARA GERAÇÃO DE IMAGEM:/i, '')
                                .replace(/PROMPT DE IMAGEM:/i, '')
                                .replace(/\[PROMPT_IMAGEM:/i, '')
                                .replace(/\]/g, '')
                                .trim();
                            }
                            
                            if (prompt && prompt.length > 5) {
                              return <ImagePrompt prompt={prompt} />;
                            }
                          }
                          return <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>;
                        }
                      }}
                    >
                      {resultado}
                    </ReactMarkdown>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
