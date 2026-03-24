'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import Image from 'next/image';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, query, updateDoc } from 'firebase/firestore';
import { Loader2, LogOut, ShieldCheck, UserCheck, UserX, Clock, Users, Settings } from 'lucide-react';
import { motion } from 'motion/react';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  accessType?: 'unlimited' | 'limited';
  expiresAt?: any;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
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
            setProfile(docSnap.data() as UserProfile);
          } else {
            // Create new profile
            const isDefaultAdmin = currentUser.email === ADMIN_EMAIL;
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              role: isDefaultAdmin ? 'admin' : 'user',
              status: isDefaultAdmin ? 'approved' : 'pending',
            };
            
            try {
              await setDoc(userDocRef, {
                ...newProfile,
                createdAt: serverTimestamp(),
              });
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading, signIn, signOut } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-gray-600 font-medium">Verificando acesso...</p>
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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(usersList);
      setLoading(false);
    }, (error: any) => {
      if (error.code === 'cancelled' || error.code === 'unavailable') {
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

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
              Gestão de Educadores
            </h2>
            <p className="text-sm text-slate-500 mt-2">Controle o acesso e permissões dos usuários da plataforma.</p>
          </div>
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-4 py-2 text-center border-r border-slate-100">
              <p className="text-xl font-bold text-slate-900 leading-none">{users.length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">Total</p>
            </div>
            <div className="px-4 py-2 text-center">
              <p className="text-xl font-bold text-amber-600 leading-none">{users.filter(u => u.status === 'pending').length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">Pendentes</p>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
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
              {users.map((u) => (
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
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.uid, e.target.value as any)}
                      className="text-xs bg-slate-100 border-none rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-blue-500 font-bold text-slate-600 cursor-pointer appearance-none"
                      disabled={u.email === "romariog3.fis@gmail.com"}
                    >
                      <option value="user">Educador</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <select
                        value={u.accessType || 'none'}
                        onChange={(e) => updateAccessType(u.uid, e.target.value as any)}
                        className="text-xs bg-slate-100 border-none rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-blue-500 font-bold text-slate-600 cursor-pointer appearance-none"
                        disabled={u.email === "romariog3.fis@gmail.com"}
                      >
                        <option value="none">Gratuito</option>
                        <option value="limited">Premium (2d)</option>
                        <option value="unlimited">Full (Ilimitado)</option>
                      </select>
                      {u.accessType === 'limited' && u.expiresAt && (
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                          Expira: {u.expiresAt.toDate ? u.expiresAt.toDate().toLocaleDateString() : new Date(u.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
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
                          title="Recusar"
                        >
                          <UserX size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};
