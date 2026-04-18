'use client';

import React from 'react';
import { CheckSquare, Square, Hash, Layers } from 'lucide-react';

export interface QuestionTypeConfig {
  enabled: boolean;
  quantity: number;
  alternatives?: number;
}

export interface QuestionTypesState {
  multipleChoice: QuestionTypeConfig;
  trueFalse: QuestionTypeConfig;
  fillBlanks: QuestionTypeConfig;
  matchColumns: QuestionTypeConfig;
  essay: QuestionTypeConfig;
}

interface QuestionTypesSelectorProps {
  state: QuestionTypesState;
  onChange: (newState: QuestionTypesState) => void;
}

const QuestionTypesSelector: React.FC<QuestionTypesSelectorProps> = ({ state, onChange }) => {
  const toggleType = (key: keyof QuestionTypesState) => {
    onChange({
      ...state,
      [key]: { ...state[key], enabled: !state[key].enabled }
    });
  };

  const updateQuantity = (key: keyof QuestionTypesState, val: number) => {
    onChange({
      ...state,
      [key]: { ...state[key], quantity: Math.max(0, val) }
    });
  };

  const updateAlternatives = (val: number) => {
    onChange({
      ...state,
      multipleChoice: { ...state.multipleChoice, alternatives: val }
    });
  };

  const types = [
    { key: 'multipleChoice', label: 'Múltipla Escolha', icon: '📝' },
    { key: 'trueFalse',      label: 'Verdadeiro ou Falso', icon: '✅' },
    { key: 'fillBlanks',     label: 'Completar Lacunas', icon: '✏️' },
    { key: 'matchColumns',   label: 'Relacionar Colunas', icon: '🔗' },
    { key: 'essay',          label: 'Discursiva/Subjetiva', icon: '📖' },
  ] as const;

  return (
    <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Configurar Questões</label>
        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-100">
          <Hash size={10} />
          <span className="text-[9px] font-black uppercase">Qtd 0 = Automático</span>
        </div>
      </div>

      <div className="space-y-3">
        {types.map((type) => {
          const config = state[type.key];
          return (
            <div 
              key={type.key}
              className={`p-4 rounded-2xl border transition-all ${
                config.enabled ? 'bg-white border-blue-200 shadow-sm' : 'bg-transparent border-slate-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => toggleType(type.key)}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                    config.enabled ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
                  }`}>
                    {config.enabled && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <span className="text-lg">{type.icon}</span>
                  <span className={`text-xs font-bold ${config.enabled ? 'text-blue-900' : 'text-slate-600'}`}>
                    {type.label}
                  </span>
                </button>

                {config.enabled && (
                  <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-2 duration-300">
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Quantidade</label>
                      <input 
                        type="number"
                        min="0"
                        max="20"
                        value={config.quantity}
                        onChange={(e) => updateQuantity(type.key, parseInt(e.target.value) || 0)}
                        className="w-14 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {type.key === 'multipleChoice' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Alternativas</label>
                        <select 
                          value={config.alternatives}
                          onChange={(e) => updateAlternatives(parseInt(e.target.value))}
                          className="w-12 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
                        >
                          {[2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QuestionTypesSelector;
