'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import Image from 'next/image';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, query, updateDoc, where, getDocs, deleteDoc, orderBy, addDoc } from 'firebase/firestore';
import { Loader2, LogOut, ShieldCheck, UserCheck, UserX, Clock, Users, Settings, Plus, Trash2, Mail, X, BarChart2, Activity, TrendingUp, Award, Search, Filter } from 'lucide-react';
import { motion } from 'motion/react';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  accessType?: 'unlimited' | 'limited';
  expiresAt?: any;
  currentSessionId?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setSessionConflict: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionConflict, setSessionConflict] = useState(false);

  const ADMIN_EMAIL = "romariog3.fis@gmail.com";

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        // Listen for profile changes
        unsubProfile = onSnapshot(userDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setProfile(data);

            // Verificação de Sessão Única
            const localSessionId = localStorage.getItem('ga_session_id');
            
            if (!localSessionId) {
              // Primeiro acesso neste dispositivo ou LocalStorage limpo
              const newSessionId = crypto.randomUUID();
              localStorage.setItem('ga_session_id', newSessionId);
              updateDoc(userDocRef, { currentSessionId: newSessionId });
            } else if (data.currentSessionId && data.currentSessionId !== localSessionId) {
              // Conflito detectado: Outro dispositivo assumiu a sessão
              setSessionConflict(true);
            } else if (!data.currentSessionId) {
              // Caso o campo não exista no banco (migração), associa o atual
              updateDoc(userDocRef, { currentSessionId: localSessionId });
            }
          } else {
            // Check if email is pre-authorized
            const preAuthQuery = query(
              collection(db, 'pre_authorized_emails'),
              where('email', '==', currentUser.email)
            );
            const preAuthSnap = await getDocs(preAuthQuery);
            const isPreAuthorized = !preAuthSnap.empty;

            const isDefaultAdmin = currentUser.email === ADMIN_EMAIL;
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              role: isDefaultAdmin ? 'admin' : 'user',
              status: (isDefaultAdmin || isPreAuthorized) ? 'approved' : 'pending',
            };
            
            try {
              await setDoc(userDocRef, {
                ...newProfile,
                createdAt: serverTimestamp(),
              });

              // Clean up pre-authorization if it existed
              if (isPreAuthorized) {
                const deletePromises = preAuthSnap.docs.map(doc => deleteDoc(doc.ref));
                await Promise.all(deletePromises);
              }

              setProfile(newProfile);
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, `users/${currentUser.uid}`);
            }
          }
          setLoading(false);
        }, (error: any) => {
          if (error.code === 'permission-denied' && !auth.currentUser) {
            // Ignore permission denied error during logout
            return;
          }
          if (error.code === 'cancelled' || error.code === 'unavailable') {
            // Benign timeout or transient connection error, SDK will reconnect automatically
            return;
          }
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, []);

  const signIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      localStorage.removeItem('ga_session_id');
      await logout();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    signIn,
    signOut,
    sessionConflict,
    setSessionConflict,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading, signIn, signOut, sessionConflict, setSessionConflict } = useAuth() as any;
  const [showAdmin, setShowAdmin] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-gray-600 font-medium">Verificando acesso...</p>
      </div>
    );
  }

  if (sessionConflict) {
    const reclaimSession = async () => {
      if (!user) return;
      const newSessionId = crypto.randomUUID();
      localStorage.setItem('ga_session_id', newSessionId);
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, { currentSessionId: newSessionId });
        setSessionConflict(false);
      } catch (error) {
        console.error("Erro ao retomar sessão:", error);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 font-sans no-print">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10 text-center border border-red-100">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-8 animate-bounce">
            <Users size={32} className="text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Sessão Encerrada</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Sua conta foi acessada em outro dispositivo. Para continuar usando neste aparelho, você precisa assumir o controle da sessão.
          </p>
          <div className="bg-amber-50 p-4 rounded-xl mb-8 flex items-start gap-3 text-left border border-amber-100">
            <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-medium leading-relaxed uppercase tracking-tighter">
              Ao clicar abaixo, o outro dispositivo será desconectado e este passará a ser o acesso ativo.
            </p>
          </div>
          <button
            onClick={reclaimSession}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg active:scale-95 mb-4"
          >
            Usar neste dispositivo (Retomar Controle)
          </button>
          <button
            onClick={signOut}
            className="text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
          >
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10 text-center border border-slate-100">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-8 rotate-3">
            <ShieldCheck size={32} className="text-blue-600 -rotate-3" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Bem-vindo</h1>
          <p className="text-slate-500 mb-10 text-sm leading-relaxed">
            Acesse a plataforma profissional de geração de questões acessíveis para educadores.
          </p>
          <button
            onClick={signIn}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-slate-200 active:scale-[0.98]"
          >
            <Image 
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
              alt="Google" 
              width={20} 
              height={20} 
              referrerPolicy="no-referrer"
              className="bg-white rounded-full p-0.5"
            />
            Entrar com Google
          </button>
          <p className="mt-8 text-xs text-slate-400 uppercase tracking-widest font-medium">
            Seguro & Privado
          </p>
        </div>
      </div>
    );
  }

  if (profile?.status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10 text-center border border-slate-100">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-8 animate-pulse">
            <Clock size={32} className="text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Análise de Perfil</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Seu acesso está sendo revisado por nossa equipe. Você receberá uma notificação assim que for aprovado.
          </p>
          <div className="bg-slate-50 p-5 rounded-2xl mb-10 text-sm text-slate-600 text-left border border-slate-100">
            <div className="flex justify-between mb-2">
              <span className="text-slate-400">Usuário</span>
              <span className="font-semibold">{profile.displayName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Email</span>
              <span className="font-semibold">{profile.email}</span>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 mx-auto transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  if (profile?.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10 text-center border border-slate-100">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <UserX size={32} className="text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Acesso Indisponível</h1>
          <p className="text-slate-500 mb-10 text-sm leading-relaxed">
            Infelizmente, seu pedido de acesso não pôde ser aprovado no momento. Entre em contato com o suporte para mais informações.
          </p>
          <button
            onClick={signOut}
            className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 mx-auto transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfcfc] font-sans">
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-slate-200">
              GA
            </div>
            <div>
              <span className="font-bold text-slate-900 block leading-none">Gerador Acessível</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1 block">Educação Inclusiva</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {profile?.role === 'admin' && (
              <button
                onClick={() => setShowAdmin(!showAdmin)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  showAdmin 
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Users size={18} />
                <span className="hidden md:inline">{showAdmin ? 'Voltar ao App' : 'Painel Admin'}</span>
              </button>
            )}
            
            <div className="flex items-center gap-4 pl-6 border-l border-slate-100">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-900 leading-none">{profile?.displayName}</p>
                <p className="text-[10px] text-slate-400 leading-none mt-1.5 uppercase tracking-widest font-bold">
                  {profile?.role === 'admin' ? 'Administrador' : 
                   profile?.accessType === 'unlimited' ? 'Plano Full' : 
                   (profile?.accessType === 'limited' && profile?.expiresAt && new Date() <= (profile.expiresAt.toDate ? profile.expiresAt.toDate() : new Date(profile.expiresAt))) ? 'Acesso Premium' : 
                   (profile?.accessType === 'limited' ? 'Acesso Expirado' : 'Modo Gratuito')}
                </p>
              </div>
              <button
                onClick={signOut}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="Sair"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative">
        {showAdmin && profile?.role === 'admin' ? <AdminPanel /> : children}
      </main>
    </div>
  );
};

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'analytics'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [preAuthEmails, setPreAuthEmails] = useState<{id: string, email: string}[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [filterPlan, setFilterPlan] = useState<'all' | 'unlimited' | 'limited' | 'none'>('all');

  useEffect(() => {
    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({ 
        uid: doc.id, 
        ...doc.data() 
      } as UserProfile));
      setUsers(usersList);
      setLoading(false);
    }, (error: any) => {
      if (error.code === 'cancelled' || error.code === 'unavailable') return;
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const qPreAuth = query(collection(db, 'pre_authorized_emails'));
    const unsubscribePreAuth = onSnapshot(qPreAuth, (snapshot) => {
      const emailsList = snapshot.docs.map(doc => ({ id: doc.id, email: doc.data().email }));
      setPreAuthEmails(emailsList);
    }, (error: any) => {
      if (error.code === 'cancelled' || error.code === 'unavailable') return;
      handleFirestoreError(error, OperationType.LIST, 'pre_authorized_emails');
    });

    return () => {
      unsubscribeUsers();
      unsubscribePreAuth();
    };
  }, []);

  const addPreAuthEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('addPreAuthEmail function started with email:', newEmail);
    if (!newEmail.trim()) {
      console.log('Email is empty, returning.');
      return;
    }
    
    setIsAdding(true);
    setAdminError(null);
    try {
      const email = newEmail.trim().toLowerCase();
      console.log('Formatted email:', email);
      
      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('E-mail inválido (formato incorreto)');
      }

      console.log('Attempting to add to Firestore...');
      await addDoc(collection(db, 'pre_authorized_emails'), {
        email: email,
        createdAt: serverTimestamp()
      });
      
      setNewEmail('');
    } catch (error: any) {
      let message = 'Erro ao cadastrar e-mail.';
      if (error.code === 'permission-denied') {
        message = 'Você não tem permissão no Firebase para cadastrar e-mails. Verifique as Regras do Firestore.';
      } else if (error.message) {
        message = error.message;
      }
      setAdminError(message);
    } finally {
      setIsAdding(false);
    }
  };

  const removePreAuthEmail = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'pre_authorized_emails', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `pre_authorized_emails/${id}`);
    }
  };

  const updateStatus = async (uid: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'users', uid), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const updateRole = async (uid: string, role: 'admin' | 'user') => {
    try {
      await updateDoc(doc(db, 'users', uid), { role });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const updateAccessType = async (uid: string, accessType: 'unlimited' | 'limited' | 'none') => {
    try {
      let expiresAt = null;
      if (accessType === 'limited') {
        const date = new Date();
        date.setDate(date.getDate() + 2);
        expiresAt = date;
      }
      await updateDoc(doc(db, 'users', uid), { 
        accessType: accessType === 'none' ? null : accessType, 
        expiresAt 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const deleteUser = async (uid: string) => {
    if (window.confirm('Tem certeza que deseja excluir permanentemente este usuário? Esta ação não pode ser desfeita.')) {
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="p-20 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
        <p className="text-slate-400 font-medium">Carregando usuários...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden"
      >
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <div className="bg-blue-50 text-blue-600 p-2 rounded-xl">
                <Users size={24} />
              </div>
              Painel do Administrador
            </h2>
            <p className="text-sm text-slate-500 mt-2">Gerencie usuários e visualize métricas de uso da plataforma.</p>
          </div>
          <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'users' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Users size={14} />
              Educadores
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'analytics' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <BarChart2 size={14} />
              Analytics
            </button>
          </div>
        </div>

        {activeTab === 'analytics' ? (
          <AnalyticsPanel users={users} />
        ) : (
          <>

        {/* Seção de Pré-autorização */}
        <div className="p-8 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Mail size={20} className="text-blue-600" />
            Pré-autorizar Novos E-mails
          </h3>
          
          {adminError && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm font-medium flex items-center gap-2"
            >
              <X size={16} />
              {adminError}
            </motion.div>
          )}
          
          <form onSubmit={addPreAuthEmail} className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1 relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Digite o e-mail que deseja pré-autorizar..."
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
              />
            </div>
            <button 
              type="submit"
              disabled={isAdding}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200 disabled:opacity-50"
            >
              {isAdding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              Cadastrar E-mail
            </button>
          </form>

          {preAuthEmails.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {preAuthEmails.map((item) => (
                <div 
                  key={item.id}
                  className="bg-blue-50/50 border border-blue-100 px-4 py-2.5 rounded-xl flex items-center gap-3 group animate-in fade-in zoom-in duration-300"
                >
                  <span className="text-sm font-semibold text-blue-900">{item.email}</span>
                  <button 
                    onClick={() => removePreAuthEmail(item.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    title="Remover pré-autorização"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {preAuthEmails.length === 0 && (
            <p className="text-sm text-slate-400 italic">Nenhum e-mail aguardando pré-autorização.</p>
          )}
        </div>
        
        <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
          {/* Barra de Pesquisa e Filtros */}
          <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row gap-4 items-start md:items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter: Status */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1">
              {(['all', 'approved', 'pending', 'rejected'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    filterStatus === s
                      ? s === 'all' ? 'bg-slate-900 text-white'
                        : s === 'approved' ? 'bg-emerald-500 text-white'
                        : s === 'pending' ? 'bg-amber-400 text-white'
                        : 'bg-red-500 text-white'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {s === 'all' ? 'Todos' : s === 'approved' ? 'Ativos' : s === 'pending' ? 'Pendentes' : 'Bloqueados'}
                </button>
              ))}
            </div>

            {/* Filter: Plano */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1">
              {(['all', 'unlimited', 'limited', 'none'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPlan(p)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    filterPlan === p
                      ? p === 'all' ? 'bg-slate-900 text-white'
                        : p === 'unlimited' ? 'bg-blue-600 text-white'
                        : p === 'limited' ? 'bg-purple-600 text-white'
                        : 'bg-slate-400 text-white'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {p === 'all' ? 'Planos' : p === 'unlimited' ? 'Full' : p === 'limited' ? 'Premium' : 'Gratuito'}
                </button>
              ))}
            </div>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/30 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-bold">
                <th className="px-8 py-5">Identificação</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5">Cargo</th>
                <th className="px-8 py-5">Plano</th>
                <th className="px-8 py-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users
                .filter(u => {
                  const q = searchQuery.toLowerCase();
                  const matchSearch = !q || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
                  const matchStatus = filterStatus === 'all' || u.status === filterStatus;
                  const matchPlan = filterPlan === 'all' ||
                    (filterPlan === 'unlimited' && u.accessType === 'unlimited') ||
                    (filterPlan === 'limited' && u.accessType === 'limited') ||
                    (filterPlan === 'none' && (!u.accessType || (u.accessType !== 'unlimited' && u.accessType !== 'limited')));
                  return matchSearch && matchStatus && matchPlan;
                })
                .map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50/50 transition-all group">
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900">{u.displayName}</span>
                      <span className="text-xs text-slate-400 font-medium">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      u.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                      u.status === 'rejected' ? 'bg-red-50 text-red-600 border border-red-100' :
                      'bg-amber-50 text-amber-600 border border-amber-100'
                    }`}>
                      {u.status === 'approved' ? 'Ativo' : u.status === 'rejected' ? 'Bloqueado' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    {u.email === "romariog3.fis@gmail.com" ? (
                      <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl font-bold">Admin</span>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => updateRole(u.uid, 'user')}
                          className={`text-[11px] px-3 py-1.5 rounded-xl font-bold transition-all ${
                            u.role !== 'admin' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >Educador</button>
                        <button
                          onClick={() => updateRole(u.uid, 'admin')}
                          className={`text-[11px] px-3 py-1.5 rounded-xl font-bold transition-all ${
                            u.role === 'admin' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >Admin</button>
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    {u.email === "romariog3.fis@gmail.com" ? (
                      <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1.5 rounded-xl font-bold">Full (Ilimitado)</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => updateAccessType(u.uid, 'none')}
                            className={`text-[11px] px-3 py-1.5 rounded-xl font-bold transition-all border ${
                              !u.accessType || (u.accessType !== 'unlimited' && u.accessType !== 'limited')
                                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-700'
                            }`}
                          >Gratuito</button>
                          <button
                            onClick={() => updateAccessType(u.uid, 'limited')}
                            className={`text-[11px] px-3 py-1.5 rounded-xl font-bold transition-all border ${
                              u.accessType === 'limited'
                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-purple-400 hover:text-purple-600'
                            }`}
                          >Premium</button>
                          <button
                            onClick={() => updateAccessType(u.uid, 'unlimited')}
                            className={`text-[11px] px-3 py-1.5 rounded-xl font-bold transition-all border ${
                              u.accessType === 'unlimited'
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                            }`}
                          >Full</button>
                        </div>
                        {u.accessType === 'limited' && u.expiresAt && (() => {
                          const expDate = u.expiresAt.toDate ? u.expiresAt.toDate() : new Date(u.expiresAt);
                          const isExpired = expDate < new Date();
                          const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          return (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg inline-block ${
                              isExpired ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>
                              {isExpired
                                ? `Expirou em ${expDate.toLocaleDateString('pt-BR')}`
                                : `Expira em ${expDate.toLocaleDateString('pt-BR')} (${daysLeft}d)`
                              }
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {u.status !== 'approved' && (
                        <button
                          onClick={() => updateStatus(u.uid, 'approved')}
                          className="w-9 h-9 flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm"
                          title="Aprovar"
                        >
                          <UserCheck size={18} />
                        </button>
                      )}
                      {u.status !== 'rejected' && u.email !== "romariog3.fis@gmail.com" && (
                        <button
                          onClick={() => updateStatus(u.uid, 'rejected')}
                          className="w-9 h-9 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm"
                          title="Bloquear"
                        >
                          <UserX size={18} />
                        </button>
                      )}
                      {u.email !== "romariog3.fis@gmail.com" && (
                        <button
                          onClick={() => deleteUser(u.uid)}
                          className="w-9 h-9 flex items-center justify-center bg-slate-100 text-slate-400 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm"
                          title="Excluir Usuário Permanentemente"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

// --- ANALYTICS PANEL COMPONENT ---
const AnalyticsPanel: React.FC<{ users: UserProfile[] }> = ({ users }) => {
  const [recentActivity, setRecentActivity] = useState<{userName: string; adaptationType: string; createdAt: any; etapaEnsino?: string}[]>([]);
  const [totalGenerations, setTotalGenerations] = useState(0);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoadingAnalytics(true);
      let allGenerations: {userName: string; adaptationType: string; createdAt: any; etapaEnsino?: string}[] = [];
      let total = 0;

      for (const user of users) {
        try {
          const genQuery = query(
            collection(db, `users/${user.uid}/generations`),
            orderBy('createdAt', 'desc')
          );
          const genSnap = await getDocs(genQuery);
          total += genSnap.size;
          genSnap.docs.forEach(d => {
            allGenerations.push({
              userName: user.displayName || user.email,
              adaptationType: d.data().adaptationType || 'Geral',
              createdAt: d.data().createdAt,
              etapaEnsino: d.data().metadata?.etapaEnsino || '',
            });
          });
        } catch (e) {
          // silently skip if no generations for a user
        }
      }

      // Sort by date desc, take top 15
      allGenerations.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      });

      setRecentActivity(allGenerations.slice(0, 15));
      setTotalGenerations(total);
      setLoadingAnalytics(false);
    };

    if (users.length > 0) fetchAnalytics();
    else setLoadingAnalytics(false);
  }, [users]);

  const approved = users.filter(u => u.status === 'approved').length;
  const pending = users.filter(u => u.status === 'pending').length;
  const unlimited = users.filter(u => u.accessType === 'unlimited').length;
  const limited = users.filter(u => u.accessType === 'limited').length;
  const free = users.filter(u => !u.accessType || (u.accessType !== 'unlimited' && u.accessType !== 'limited')).length;

  // Count generations per user
  const userGenCounts: Record<string, number> = {};
  recentActivity.forEach(g => {
    userGenCounts[g.userName] = (userGenCounts[g.userName] || 0) + 1;
  });
  const topUser = Object.entries(userGenCounts).sort((a, b) => b[1] - a[1])[0];

  const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) => (
    <div className={`bg-white border rounded-2xl p-6 flex items-start gap-4 shadow-sm`}>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
        <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold mt-1.5">{label}</p>
      </div>
    </div>
  );

  const BarSegment = ({ count, total, color, label }: { count: number; total: number; color: string; label: string }) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[11px] font-bold text-slate-500 w-20 shrink-0">{label}</span>
        <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-bold text-slate-700 w-8 text-right">{count}</span>
      </div>
    );
  };

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-8 space-y-8">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total de Usuários" value={users.length} color="bg-blue-50 text-blue-600" />
        <StatCard icon={UserCheck} label="Usuários Ativos" value={approved} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Clock} label="Pendentes" value={pending} color="bg-amber-50 text-amber-600" />
        <StatCard icon={Activity} label="Adaptações Geradas" value={loadingAnalytics ? '...' : totalGenerations} color="bg-indigo-50 text-indigo-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Distribuição de Acesso */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-5 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" />
            Distribuição de Planos
          </h3>
          <BarSegment count={unlimited} total={users.length} color="bg-blue-500" label="Full" />
          <BarSegment count={limited} total={users.length} color="bg-purple-500" label="Premium" />
          <BarSegment count={free} total={users.length} color="bg-slate-400" label="Gratuito" />
          <BarSegment count={pending} total={users.length} color="bg-amber-400" label="Pendente" />
        </div>

        {/* Usuário mais ativo */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-5 uppercase tracking-widest flex items-center gap-2">
            <Award size={16} className="text-amber-500" />
            Usuário Mais Ativo
          </h3>
          {loadingAnalytics ? (
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin text-blue-500" size={20} />
              <span className="text-sm text-slate-400">Carregando...</span>
            </div>
          ) : topUser ? (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100">
                <span className="text-2xl">🏆</span>
              </div>
              <div>
                <p className="font-black text-slate-900">{topUser[0]}</p>
                <p className="text-sm text-slate-500 mt-0.5">{topUser[1]} adaptação{topUser[1] > 1 ? 'ões' : ''} gerada{topUser[1] > 1 ? 's' : ''}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma atividade ainda.</p>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-xl font-black text-slate-900">{totalGenerations}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">Total de adaptações</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-slate-900">{users.length > 0 ? (totalGenerations / users.length).toFixed(1) : 0}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">Média por usuário</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Atividade Recente */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <Activity size={16} className="text-indigo-500" />
            Atividade Recente (Últimas 15 adaptações)
          </h3>
        </div>
        {loadingAnalytics ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-blue-500 mb-3" size={32} />
            <p className="text-sm text-slate-400">Carregando atividade...</p>
          </div>
        ) : recentActivity.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-slate-400">Nenhuma atividade registrada ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-[0.15em] font-bold">
                  <th className="px-6 py-4">Usuário</th>
                  <th className="px-6 py-4">Tipo de Adaptação</th>
                  <th className="px-6 py-4">Etapa de Ensino</th>
                  <th className="px-6 py-4">Data e Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentActivity.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/30 transition-all">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-800 text-sm">{item.userName}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-100">
                        {item.adaptationType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-500 font-medium">{item.etapaEnsino || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-400 font-medium">{formatDate(item.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
