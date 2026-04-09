'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquarePlus, X, Send, Loader2, CheckCircle, Star, Bug, Lightbulb, Heart, HelpCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface FeedbackButtonProps {
  userEmail?: string;
  userName?: string;
}

type FeedbackType = 'sugestao' | 'bug' | 'elogio' | 'outro';

const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'sugestao', label: 'Sugestão', icon: <Lightbulb size={16} />, color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' },
  { value: 'bug',      label: 'Problema', icon: <Bug size={16} />,       color: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
  { value: 'elogio',   label: 'Elogio',   icon: <Heart size={16} />,      color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' },
  { value: 'outro',    label: 'Outro',    icon: <HelpCircle size={16} />, color: 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' },
];

const FeedbackButton: React.FC<FeedbackButtonProps> = ({ userEmail, userName }) => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('sugestao');
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        type,
        rating,
        message: message.trim(),
        userEmail: userEmail || 'Anônimo',
        userName: userName || 'Anônimo',
        createdAt: serverTimestamp(),
        status: 'new',
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setOpen(false);
        setMessage('');
        setRating(0);
        setType('sugestao');
      }, 2500);
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Botão Flutuante */}
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl shadow-slate-300 font-bold text-xs uppercase tracking-widest no-print"
        title="Enviar sugestão ou feedback"
      >
        <MessageSquarePlus size={18} />
        <span className="hidden sm:inline">Feedback</span>
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 no-print"
            />

            {/* Painel */}
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              className="fixed bottom-0 sm:bottom-auto sm:right-6 sm:top-1/2 sm:-translate-y-1/2 left-0 right-0 sm:left-auto sm:w-[420px] z-50 no-print"
            >
              <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>💬</span> Sugestões & Feedback
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Sua opinião melhora a plataforma para todos.</p>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>

                {success ? (
                  <div className="p-12 flex flex-col items-center justify-center text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mb-4 border border-emerald-100"
                    >
                      <CheckCircle size={40} className="text-emerald-500" />
                    </motion.div>
                    <h3 className="text-xl font-black text-slate-900 mb-2">Obrigado! 🎉</h3>
                    <p className="text-sm text-slate-500">Seu feedback foi enviado com sucesso. Ele nos ajuda a melhorar!</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Tipo de Feedback */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Tipo de feedback</label>
                      <div className="grid grid-cols-2 gap-2">
                        {FEEDBACK_TYPES.map(ft => (
                          <button
                            key={ft.value}
                            type="button"
                            onClick={() => setType(ft.value)}
                            className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                              type === ft.value ? ft.color + ' ring-2 ring-offset-1 ring-current' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {ft.icon}
                            {ft.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Avaliação */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                        Como você avalia a plataforma?
                      </label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            onMouseEnter={() => setHoveredStar(star)}
                            onMouseLeave={() => setHoveredStar(0)}
                            onClick={() => setRating(star)}
                            className="p-1 transition-transform hover:scale-125"
                          >
                            <Star
                              size={28}
                              className={`transition-colors ${
                                star <= (hoveredStar || rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-100'
                              }`}
                            />
                          </button>
                        ))}
                        {rating > 0 && (
                          <span className="ml-2 text-xs text-slate-400 font-bold self-center">
                            {['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente'][rating]}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mensagem */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        Mensagem <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        required
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                        placeholder="Descreva sua sugestão, problema ou elogio com detalhes..."
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm resize-none"
                      />
                    </div>

                    {/* Info do usuário */}
                    {userEmail && (
                      <p className="text-[10px] text-slate-400 font-medium bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                        Enviado como: <strong>{userName || userEmail}</strong> ({userEmail})
                      </p>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={loading || !message.trim()}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <><Loader2 className="animate-spin" size={18} /> Enviando...</> : <><Send size={18} /> Enviar Feedback</>}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default FeedbackButton;
