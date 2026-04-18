'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Brain, FileText, ChevronDown, ChevronUp, Loader2, ArrowRight } from 'lucide-react';
import ImagePrompt from './ImagePrompt';
import { Question } from '../types';

interface QuestionCardProps {
  question: Question;
  index: number;
  caixaAlta?: boolean;
  onRefine: (id: string, action: 'simplify' | 'accessible' | 'change_type') => void;
  refiningId?: string | null;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, index, caixaAlta, onRefine, refiningId }) => {
  const [showGabarito, setShowGabarito] = useState(false);
  const isRefining = refiningId === question.id;

  const bloomColor = (level: string) => {
    switch (level) {
      case 'Lembrar': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'Entender': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'Aplicar': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'Analisar': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'Avaliar': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'Criar': return 'bg-rose-50 text-rose-600 border-rose-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-[2rem] border transition-all relative overflow-hidden ${
        isRefining ? 'ring-2 ring-blue-500 shadow-xl scale-[1.01]' : 'border-slate-100 shadow-sm hover:shadow-md'
      }`}
    >
      {/* Header com Nível de Bloom */}
      <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-900 font-bold">
            {question.originalNumber || index + 1}
          </div>
          <div className={`px-3 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${bloomColor(question.bloomLevel)}`}>
            Taxonomia: {question.bloomLevel}
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{question.type === 'multiple_choice' ? 'Objetiva' : 'Subjetiva'}</span>
        </div>
      </div>

      {/* Conteúdo da Questão */}
      <div className="p-8">
        <div className={`prose prose-slate max-w-none prose-p:leading-relaxed ${caixaAlta ? 'prose-strong:bg-yellow-200 prose-strong:px-1 prose-strong:rounded' : 'prose-strong:text-blue-600'}`}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[rehypeKatex]}
          >
            {question.content}
          </ReactMarkdown>
        </div>

        {/* Renderização Especial por Tipo */}
        <div className="mt-6 space-y-4">
          {/* Múltipla Escolha Estruturada (se o IA enviar options) */}
          {question.type === 'multiple_choice' && question.options && (
            <div className="space-y-2">
              {question.options.map((opt) => (
                <div key={opt.letter} className="flex gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/30">
                  <span className="font-black text-blue-600 w-5">{opt.letter})</span>
                  <div className="text-sm border-l border-slate-200 pl-3 overflow-x-auto">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                    >
                      {opt.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Verdadeiro ou Falso */}
          {question.type === 'true_false' && (
            <div className="space-y-3">
              {question.assertions && question.assertions.length > 0 ? (
                question.assertions.map((assertion: any, index: number) => (
                  <div key={index} className="flex items-start gap-4 p-3 rounded-xl border border-slate-100 bg-slate-50/30">
                    <div className="flex gap-2 shrink-0 pt-0.5">
                      {['V', 'F'].map((label) => (
                        <div key={label} className="flex items-center justify-center w-8 h-8 rounded-full border border-slate-300 bg-white text-xs font-black text-slate-400">
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="text-sm font-medium text-slate-700 pt-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {assertion.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))
              ) : (
                /* Fallback para questões antigas sem o array "assertions" */
                <div className="flex gap-4 mt-4">
                  {['V', 'F'].map((label) => (
                    <div key={label} className="flex items-center gap-2 p-3 px-6 rounded-2xl border border-slate-200 bg-white font-black text-slate-400">
                      <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                      {label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completar Lacunas */}
          {question.type === 'fill_blanks' && (
            <div className="p-4 bg-amber-50/30 border border-amber-100/50 rounded-2xl">
              <p className="text-[10px] font-black uppercase text-amber-600 mb-2 tracking-widest">Complete as lacunas acima</p>
              <div className="flex flex-wrap gap-2">
                {question.blanks?.map((_, i) => (
                  <div key={i} className="h-8 w-24 border-b-2 border-slate-300 bg-white/50 rounded-t-lg" />
                ))}
              </div>
            </div>
          )}

          {/* Relacionar Colunas */}
          {question.type === 'match_columns' && question.pairs && (
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                {question.pairs.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                    <span className="w-6 h-6 flex items-center justify-center bg-slate-900 text-white rounded-lg text-[10px] font-black shrink-0">{i + 1}</span>
                    <div className="text-xs font-medium overflow-x-auto">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {p.left}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {/* Embaralha as respostas para o aluno relacionar */}
                {[...question.pairs].sort(() => Math.random() - 0.5).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                    <span className="w-6 h-6 border-2 border-slate-200 bg-white rounded-lg shrink-0" />
                    <div className="text-xs font-medium text-slate-600 overflow-x-auto">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {p.right}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Imagem de Apoio se houver (Trava de segurança: ignorar prompts curtos ou que citam material original) */}
        {question.imagePrompt && question.imagePrompt.length > 20 && !question.imagePrompt.toLowerCase().includes('material original') && (
          <ImagePrompt prompt={question.imagePrompt} />
        )}

        {/* Recursos de Acessibilidade */}
        {(question.glossary?.length || question.steps?.length) && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
            {question.glossary && question.glossary.length > 0 && (
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2 uppercase tracking-widest">
                  <Brain size={14} className="text-blue-500" />
                  Glossário
                </h4>
                <div className="space-y-2">
                  {question.glossary.map((g, idx) => (
                    <p key={idx} className="text-[11px] text-slate-600 leading-relaxed">
                      <strong className="text-slate-800">{g.word}</strong>: {g.meaning}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {question.steps && question.steps.length > 0 && (
              <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100/50">
                <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2 uppercase tracking-widest">
                  <ArrowRight size={14} className="text-blue-600" />
                  Passo a Passo
                </h4>
                <div className="space-y-2">
                  {question.steps.map((step, idx) => (
                    <div key={idx} className="flex gap-2 text-[11px] text-slate-600 leading-relaxed">
                      <span className="font-bold text-blue-600">{idx + 1}.</span>
                      <p>{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gabarito (Expansível) */}
        <div className="mt-8 border-t border-slate-50 pt-6 no-print">
          <button 
            onClick={() => setShowGabarito(!showGabarito)}
            className="flex items-center gap-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors uppercase tracking-widest"
          >
            {showGabarito ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Ver Gabarito e Justificativa
          </button>
          
          <AnimatePresence>
            {showGabarito && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="bg-emerald-600 text-white p-1 rounded-lg">
                      <Sparkles size={14} />
                    </div>
                    <div>
                      <div className="text-sm font-black text-emerald-900 leading-tight flex items-center gap-1">
                        Resposta: 
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {question.type === 'true_false' ? (question.isTrue ? 'Verdadeiro' : 'Falso') : (question.answer || '')}
                        </ReactMarkdown>
                      </div>
                      {question.type === 'fill_blanks' && question.blanks && (
                        <p className="text-[11px] font-bold text-emerald-700 mt-1">
                          Lacunas: {question.blanks.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-emerald-700 leading-relaxed italic border-t border-emerald-200/50 pt-3">{question.justification}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer com Botões de Refinamento */}
      <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-50 flex flex-wrap gap-2 no-print">
        <button
          disabled={isRefining}
          onClick={() => onRefine(question.id, 'accessible')}
          className="flex-1 min-w-[140px] bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold py-2.5 px-4 rounded-xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isRefining ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
          Tornar Acessível
        </button>
        <button
          disabled={isRefining}
          onClick={() => onRefine(question.id, 'simplify')}
          className="flex-1 min-w-[140px] bg-white hover:bg-amber-50 text-amber-600 border border-amber-100 font-bold py-2.5 px-4 rounded-xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isRefining ? <Loader2 className="animate-spin" size={12} /> : <Brain size={12} />}
          Simplificar
        </button>
        <button
          disabled={isRefining}
          onClick={() => onRefine(question.id, 'change_type')}
          className="flex-1 min-w-[140px] bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 font-bold py-2.5 px-4 rounded-xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isRefining ? <Loader2 className="animate-spin" size={12} /> : <FileText size={12} />}
          Mudar Tipo
        </button>
      </div>

      {/* Overlay de carregamento durante refinamento */}
      {isRefining && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-20">
          <div className="bg-white p-6 rounded-3xl shadow-2xl border border-blue-100 flex flex-col items-center">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={32} />
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">IA Refinando Questão...</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default QuestionCard;
