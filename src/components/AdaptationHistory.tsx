'use client';

import React from 'react';
import { motion } from 'motion/react';
import { History, Calendar, FileText, ChevronRight } from 'lucide-react';
import { HistoryItem } from '../types';

interface AdaptationHistoryProps {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  isLoading?: boolean;
}

const AdaptationHistory: React.FC<AdaptationHistoryProps> = ({ history, onSelect, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-50 rounded-2xl border border-slate-100" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-10 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-sm">
          <History size={24} className="text-slate-200" />
        </div>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhum histórico</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history.map((item) => (
        <motion.div 
          key={item.id} 
          whileHover={{ x: 5 }}
          whileTap={{ scale: 0.98 }}
          className="p-5 bg-white rounded-[2rem] border border-slate-100 hover:border-blue-200 hover:shadow-xl transition-all cursor-pointer group shadow-sm flex items-center gap-4" 
          onClick={() => onSelect(item)}
        >
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
            <FileText size={20} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest truncate max-w-[150px]">
                {item.adaptationType}
              </span>
              <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 shrink-0">
                <Calendar size={10} />
                {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR') : 'Agora'}
              </span>
            </div>
            <p className="text-xs text-slate-500 line-clamp-1 group-hover:text-slate-700 transition-colors leading-relaxed">
              {item.metadata?.ano && `${item.metadata.ano} - `}
              {typeof item.content === 'string' && item.content.startsWith('{') 
                ? 'Material Estruturado' 
                : (typeof item.content === 'string' ? item.content.replace(/[#*`]/g, '').substring(0, 80) : 'Material Adaptado')}
              ...
            </p>
          </div>
          
          <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 shrink-0 transition-colors" />
        </motion.div>
      ))}
    </div>
  );
};

export default AdaptationHistory;
