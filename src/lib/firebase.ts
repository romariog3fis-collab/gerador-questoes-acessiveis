import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, updateDoc, serverTimestamp, getDocFromServer, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Set log level to error to suppress benign stream cancellation warnings
setLogLevel('error');

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  friendlyMessage: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  let friendlyMessage = "Ocorreu um erro ao acessar o banco de dados.";
  
  if (error?.code) {
    switch (error.code) {
      case 'permission-denied':
        friendlyMessage = "Você não tem permissão para realizar esta ação.";
        break;
      case 'not-found':
        friendlyMessage = "O documento solicitado não foi encontrado.";
        break;
      case 'unavailable':
        friendlyMessage = "O serviço está temporariamente indisponível. Verifique sua conexão.";
        break;
      case 'deadline-exceeded':
        friendlyMessage = "A operação expirou. Tente novamente.";
        break;
      case 'resource-exhausted':
        friendlyMessage = "Limite de cota atingido. Tente novamente mais tarde.";
        break;
      case 'unauthenticated':
        friendlyMessage = "Usuário não autenticado. Por favor, faça login.";
        break;
      case 'already-exists':
        friendlyMessage = "Este registro já existe.";
        break;
      case 'failed-precondition':
        friendlyMessage = "A operação não pôde ser concluída devido ao estado atual do sistema.";
        break;
      case 'internal':
        friendlyMessage = "Erro interno no servidor do banco de dados.";
        break;
      case 'invalid-argument':
        friendlyMessage = "Argumento inválido fornecido para a operação.";
        break;
    }
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    friendlyMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
