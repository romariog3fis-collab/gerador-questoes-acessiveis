'use client';

import { useState } from 'react';
import { Loader2, Image as ImageIcon, Sparkles, X, History } from 'lucide-react';

interface ImagePromptProps {
  prompt: string;
}

const ImagePrompt = ({ prompt }: ImagePromptProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  // Usar uma semente estável robusta baseada no prompt + retryCount
  const stableSeed = Math.floor(Math.abs(prompt.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0)) % 1000000) + retryCount;
  
  // Sanitização rigorosa do prompt para evitar caracteres que quebram a URL ou o modelo
  const cleanPrompt = prompt
    .replace(/^[*_#\-+>`"\s\[\]]+|[*_#\-+>`"\s\[\]]+$/g, '') // Remove artefatos de formatação nas extremidades
    .replace(/[.;:!?,]$/, '') // Remove pontuação final redundante
    .substring(0, 450)
    .trim();

  // Usamos nossa rota de API interna para gerar a imagem de forma segura e estável
  const imageUrl = `/api/generate-image?prompt=${encodeURIComponent(cleanPrompt)}&width=1024&height=768&nologo=true&seed=${stableSeed}&model=flux`;
  
  const handleRetry = () => {
    setError(false);
    setLoading(true);
    setRetryCount(prev => prev + 1);
  };

  return (
    <div className="my-8 rounded-3xl overflow-hidden border border-slate-100 shadow-xl bg-slate-50 group transition-all hover:shadow-2xl hover:border-blue-100">
      <div className="p-4 bg-white border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
            <ImageIcon size={18} />
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ilustração Gerada por IA</span>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full border border-indigo-100 shadow-sm animate-pulse no-print">
          <Sparkles size={12} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">IA em Teste / Experimental</span>
        </div>
      </div>
      <div className="relative aspect-video bg-slate-100 overflow-hidden flex items-center justify-center">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-10 transition-opacity">
            <Loader2 className="animate-spin text-indigo-600 mb-2" size={32} />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Criando Imagem...</span>
          </div>
        )}
        
        {error ? (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 w-full h-full no-print">
            <div className="bg-red-50 text-red-400 p-4 rounded-full mb-4">
              <X size={32} />
            </div>
            <p className="text-xs font-bold text-slate-600 uppercase mb-2">Ops! A IA se distraiu...</p>
            <p className="text-[10px] text-slate-400 mb-6 max-w-xs">Não conseguimos gerar esta ilustração agora. O servidor pode estar ocupado ou requer autenticação.</p>
            <p className="text-[9px] text-amber-600 font-bold uppercase mb-4 bg-amber-50 px-2 py-1 rounded">DICA: VERIFIQUE SE A CHAVE API DO POLLINATIONS ESTÁ CONFIGURADA NA VERCEL</p>
            <button 
              onClick={handleRetry}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 mb-4"
            >
              <History size={14} />
              TENTAR NOVAMENTE
            </button>
            <a 
              href={imageUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] text-indigo-500 hover:underline font-medium"
            >
              Ver imagem em nova aba (Diagnóstico)
            </a>
          </div>
        ) : (
          <img 
            key={`${imageUrl}-${retryCount}`}
            src={imageUrl} 
            alt={prompt}
            className={`w-full h-full object-cover transition-all duration-1000 ${loading ? 'opacity-0 scale-110 blur-sm' : 'opacity-100 scale-100 blur-0'} group-hover:scale-105`}
            onLoad={() => setLoading(false)}
            onError={(e) => { 
                console.error("Erro no Pollinations:", imageUrl);
                setLoading(false); 
                setError(true); 
            }}
            loading="lazy"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none opacity-40" />
      </div>
      <div className="p-4 bg-white border-t border-slate-50">
        <div className="flex items-start gap-2">
          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 shrink-0" />
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic line-clamp-2 hover:line-clamp-none transition-all">
            "{cleanPrompt}"
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImagePrompt;
