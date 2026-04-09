'use client';

import React, { useRef } from 'react';
import { FileText, UploadCloud, X, Send, Loader2 } from 'lucide-react';

interface AdaptationFormProps {
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  material: string;
  setMaterial: (val: string) => void;
  etapaEnsino: string;
  setEtapaEnsino: (val: string) => void;
  ano: string;
  setAno: (val: string) => void;
  caixaAlta: boolean;
  setCaixaAlta: (val: boolean) => void;
  incluirDescricaoVisual: boolean;
  setIncluirDescricaoVisual: (val: boolean) => void;
  gerarImagensIA: boolean;
  setGerarImagensIA: (val: boolean) => void;
  adaptacoes: string;
  setAdaptacoes: React.Dispatch<React.SetStateAction<string>>;
  estilosAdaptacao: {
    destacarChave: boolean;
    dividirBlocos: boolean;
    listasMarcadores: boolean;
    titulosClaros: boolean;
    simplificarLinguagem: boolean;
  };
  setEstilosAdaptacao: (val: any) => void;
  generationsCount: number;
  MAX_GENERATIONS: number;
  isFullVersion: boolean;
  userAccessType?: string;
  userExpiresAt?: Date;
}

const AdaptationForm: React.FC<AdaptationFormProps> = ({
  loading, onSubmit, file, setFile, material, setMaterial, etapaEnsino, setEtapaEnsino,
  ano, setAno, caixaAlta, setCaixaAlta, incluirDescricaoVisual, setIncluirDescricaoVisual,
  gerarImagensIA, setGerarImagensIA, adaptacoes, setAdaptacoes, estilosAdaptacao, setEstilosAdaptacao,
  generationsCount, MAX_GENERATIONS, isFullVersion, userAccessType, userExpiresAt
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleEstilo = (key: keyof typeof estilosAdaptacao) => {
    setEstilosAdaptacao((prev: any) => ({ ...prev, [key]: !prev[key] }));
  };

  const adps = ["TDAH", "Dislexia", "Discalculia", "Autismo", "Deficiência Visual", "Deficiência Intelectual"];

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Upload de Arquivo */}
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-3 ml-1">Documento Base</label>
        <div 
          className={`group border-2 border-dashed rounded-[2rem] p-8 text-center transition-all cursor-pointer ${
            file ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50 bg-slate-50/30'
          }`}
          onClick={() => !file && fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={(e) => e.target.files && setFile(e.target.files[0])}
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
          />
          {file ? (
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-blue-100 shadow-sm">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="text-blue-600" size={20} />
                </div>
                <div className="text-left overflow-hidden">
                  <p className="text-sm font-bold text-slate-900 truncate">{file.name}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Pronto para processar</p>
                </div>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="py-2">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:scale-110 transition-transform">
                <UploadCloud className="text-slate-400 group-hover:text-blue-500 transition-colors" size={24} />
              </div>
              <p className="text-sm text-slate-600 font-bold">Clique ou arraste o arquivo</p>
              <p className="text-xs text-slate-400 mt-2">Avaliação original em PDF, Word ou Imagem</p>
            </div>
          )}
        </div>
      </div>

      {/* Texto Manual (Opcional se houver arquivo) */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-slate-700 ml-1 flex items-center justify-between">
          Ou cole o texto aqui
          {!file && !material.trim() && <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-lg border border-amber-100 uppercase font-black">Obrigatório</span>}
        </label>
        <textarea 
          value={material} 
          onChange={(e) => setMaterial(e.target.value)} 
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[120px] text-sm" 
          placeholder="Cole as questões da prova aqui se preferir não anexar o arquivo..." 
        />
      </div>

      {/* Contexto e Adaptação */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">Etapa de Ensino</label>
          <select required value={etapaEnsino} onChange={(e) => setEtapaEnsino(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm text-slate-700 appearance-none cursor-pointer">
            <option value="" disabled>Selecione...</option>
            <option value="Ensino Fundamental I (Anos Iniciais)">Fundamental I</option>
            <option value="Ensino Fundamental II (Anos Finais)">Fundamental II</option>
            <option value="Ensino Médio">Ensino Médio</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">Ano Escolar</label>
          <input type="text" required value={ano} onChange={(e) => setAno(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm text-slate-700" placeholder="Ex: 8º Ano" />
        </div>
      </div>

      {/* Tipo de Adaptação (DA REFERÊNCIA DO USUÁRIO) */}
      <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
        <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Estilo Pedagógico</label>
        {[
          { key: 'destacarChave', label: 'Destacar informações-chave', icon: '✨' },
          { key: 'dividirBlocos', label: 'Dividir texto em blocos menores', icon: '📦' },
          { key: 'listasMarcadores', label: 'Converter em listas com marcadores', icon: '📝' },
          { key: 'titulosClaros', label: 'Adicionar títulos e subtítulos claros', icon: '🔖' },
          { key: 'simplificarLinguagem', label: 'Simplificar a linguagem (Linguagem Simples)', icon: '🗣️' }
        ].map((item) => (
          <div 
            key={item.key} 
            onClick={() => toggleEstilo(item.key as any)}
            className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
              (estilosAdaptacao as any)[item.key] ? 'bg-white border-blue-200 shadow-sm transform translate-x-1' : 'bg-transparent border-slate-100 hover:bg-white hover:border-slate-200'
            }`}
          >
            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
              (estilosAdaptacao as any)[item.key] ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
            }`}>
              {(estilosAdaptacao as any)[item.key] && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
            </div>
            <span className="text-lg grayscale-0">{item.icon}</span>
            <span className={`text-xs font-bold transition-colors ${(estilosAdaptacao as any)[item.key] ? 'text-blue-900' : 'text-slate-600'}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Opções de IA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button type="button" onClick={() => setCaixaAlta(!caixaAlta)} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${caixaAlta ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
          <div className={`w-4 h-4 rounded border ${caixaAlta ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider">Letras Maiúsculas</span>
        </button>
        <button type="button" onClick={() => setIncluirDescricaoVisual(!incluirDescricaoVisual)} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${incluirDescricaoVisual ? 'bg-indigo-50 border-indigo-100 shadow-sm' : 'bg-slate-50 border-slate-100'}`}>
          <div className={`w-4 h-4 rounded border ${incluirDescricaoVisual ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider">Audiodescrição</span>
        </button>
      </div>

      <div className="space-y-2">
        <button type="button" onClick={() => setGerarImagensIA(!gerarImagensIA)} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all w-full ${gerarImagensIA ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
          <div className={`w-4 h-4 rounded border shrink-0 ${gerarImagensIA ? 'bg-amber-500 border-amber-500' : 'bg-white border-slate-300'}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider flex-1 text-left">Gerar Ilustrações com IA</span>
          <span className="text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">BETA</span>
        </button>
        {gerarImagensIA && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            <span className="text-amber-500 text-xs shrink-0 mt-0.5">⚠️</span>
            <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
              <strong>Recurso em fase de testes.</strong> A geração de imagens pode ser instável ou demorar alguns segundos. Em caso de falha, tente novamente.
            </p>
          </div>
        )}
      </div>

      {/* Necessidades AEE */}
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-3 ml-1">Perfil do Aluno (AEE)</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {adps.map((adap) => (
            <button key={adap} type="button" onClick={() => setAdaptacoes(prev => prev ? (prev.includes(adap) ? prev : `${prev}\n- ${adap}`) : `- ${adap}`)} className="bg-white text-slate-600 border border-slate-200 px-3 py-1.5 rounded-xl text-[10px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all">
              + {adap}
            </button>
          ))}
        </div>
        <textarea value={adaptacoes} onChange={(e) => setAdaptacoes(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[120px] text-sm" placeholder="Descreva as necessidades específicas..." />
      </div>

      {/* Submit */}
      <button 
        type="submit" 
        disabled={loading || (!isFullVersion && generationsCount >= MAX_GENERATIONS)}
        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-5 px-6 rounded-[2rem] transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-4 shadow-xl shadow-slate-200 active:scale-[0.98]"
      >
        {loading ? <><Loader2 className="animate-spin" size={22} /> Processando...</> : <><Send size={20} /> Adaptar Avaliação</>}
      </button>

      {!isFullVersion && (
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
              Créditos — {new Date().toLocaleDateString('pt-BR', { month: 'long' })}
            </p>
            <p className={`text-[11px] font-black ${generationsCount >= MAX_GENERATIONS ? 'text-red-500' : 'text-slate-700'}`}>
              {generationsCount} / {MAX_GENERATIONS}
            </p>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                generationsCount >= MAX_GENERATIONS ? 'bg-red-500' : generationsCount >= MAX_GENERATIONS - 1 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min((generationsCount / MAX_GENERATIONS) * 100, 100)}%` }}
            />
          </div>
          {generationsCount >= MAX_GENERATIONS && (
            <p className="text-[10px] text-red-500 font-bold mt-2 text-center">
              Limite atingido. Renova em 1° de {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}.
            </p>
          )}
        </div>
      )}
    </form>
  );
};

export default AdaptationForm;
