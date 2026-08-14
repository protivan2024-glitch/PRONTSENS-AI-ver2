import { doc, getDoc, setDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { signInWithPopup } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { UserDoc } from '../types';
import { PERMANENT_ADMIN_EMAIL, PERMANENT_ADMIN_PASSWORD } from './seed';

export const SESSION_STORAGE_KEY = 'prontosens_session_user_id';

export async function hashPassword(password: string): Promise<string> {
  try {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    // Fallback simple hash for older environments
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      hash = (hash << 5) - hash + password.charCodeAt(i);
      hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(16);
  }
}

export function getPermanentAdminDoc(customId = 'admin_hse_permanent'): UserDoc {
  return {
    id: customId,
    name: 'Administrador HSE',
    email: PERMANENT_ADMIN_EMAIL,
    cpf: '00000000000',
    role: 'Administrador',
    status: 'approved',
    isPermanentAdmin: true,
    createdAt: 1700000000000,
    approvedAt: 1700000000000,
    approvedBy: 'system',
    authProvider: 'password'
  };
}

export async function ensurePermanentAdminInFirestore(): Promise<UserDoc> {
  const permDoc = getPermanentAdminDoc();
  try {
    const adminRef = doc(db, 'users', permDoc.id);
    const snap = await getDoc(adminRef);
    if (!snap.exists()) {
      await setDoc(adminRef, permDoc);
    } else {
      // Ensure role and status are never changed
      const current = snap.data() as UserDoc;
      if (current.role !== 'Administrador' || current.status !== 'approved') {
        await updateDoc(adminRef, {
          role: 'Administrador',
          status: 'approved',
          isPermanentAdmin: true
        });
      }
    }
    return permDoc;
  } catch (err) {
    console.warn('ensurePermanentAdminInFirestore warning:', err);
    return permDoc;
  }
}

export async function loginWithCredentials(
  identifier: string,
  passwordInput: string
): Promise<{ success: boolean; user?: UserDoc; error?: string; info?: string }> {
  const cleanId = identifier.trim().toLowerCase();
  const cleanDigits = identifier.replace(/\D/g, '');

  // 1. Permanent Admin Direct Verification
  const isPermEmail = cleanId === PERMANENT_ADMIN_EMAIL.toLowerCase();
  const isPermPassword = passwordInput === PERMANENT_ADMIN_PASSWORD;

  if (isPermEmail && isPermPassword) {
    const permUser = await ensurePermanentAdminInFirestore();
    localStorage.setItem(SESSION_STORAGE_KEY, permUser.id);
    return { success: true, user: permUser };
  }

  // 2. Query user by email or by CPF in Firestore
  try {
    let userDoc: UserDoc | null = null;

    if (cleanDigits.length === 11 && !cleanId.includes('@')) {
      const q = query(collection(db, 'users'), where('cpf', '==', cleanDigits));
      const snap = await getDocs(q);
      if (!snap.empty) {
        userDoc = { id: snap.docs[0].id, ...snap.docs[0].data() } as UserDoc;
      }
    } else {
      const q = query(collection(db, 'users'), where('email', '==', cleanId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        userDoc = { id: snap.docs[0].id, ...snap.docs[0].data() } as UserDoc;
      }
    }

    if (!userDoc) {
      if (isPermEmail && !isPermPassword) {
        return { success: false, error: 'Senha incorreta para o Administrador Permanente.' };
      }
      return { success: false, error: 'Usuário não encontrado. Verifique seu e-mail ou CPF, ou realize o Autocadastro.' };
    }

    // Check if user is permanent admin
    if (userDoc.email.toLowerCase() === PERMANENT_ADMIN_EMAIL.toLowerCase()) {
      if (!isPermPassword) {
        return { success: false, error: 'Senha incorreta para o Administrador Permanente.' };
      }
    } else {
      // Verify Password Hash
      const inputHash = await hashPassword(passwordInput);
      const isPassCorrect = userDoc.passwordHash === inputHash || userDoc.passwordHash === passwordInput;
      if (!isPassCorrect) {
        return { success: false, error: 'Senha incorreta.' };
      }
    }

    // Status Verification
    if (userDoc.status === 'pending') {
      return { 
        success: false, 
        info: 'Seu cadastro foi recebido com sucesso e está aguardando a aprovação do Administrador.' 
      };
    }

    if (userDoc.status === 'rejected') {
      return { 
        success: false, 
        error: 'Seu cadastro foi recusado pelo Administrador. Entre em contato com a equipe de suporte.' 
      };
    }

    // Approved -> save session
    localStorage.setItem(SESSION_STORAGE_KEY, userDoc.id);
    return { success: true, user: userDoc };
  } catch (err: any) {
    console.error('Login error in authService:', err);
    return { success: false, error: err.message || 'Erro ao realizar login. Verifique sua conexão.' };
  }
}

export async function registerNewUser(
  name: string,
  email: string,
  cpf: string,
  passwordInput: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanCpf = cpf.replace(/\D/g, '');

  if (!cleanName) {
    return { success: false, error: 'Informe seu nome completo.' };
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Informe um e-mail válido.' };
  }
  if (cleanCpf.length !== 11) {
    return { success: false, error: 'Informe um CPF válido com 11 dígitos.' };
  }
  if (passwordInput.length < 6) {
    return { success: false, error: 'A senha deve conter no mínimo 6 caracteres.' };
  }

  try {
    // Check if permanent admin
    if (cleanEmail === PERMANENT_ADMIN_EMAIL.toLowerCase()) {
      const permUser = await ensurePermanentAdminInFirestore();
      return { 
        success: true, 
        message: 'Conta de Administrador Permanente configurada com sucesso. Acesse a aba Entrar.' 
      };
    }

    // Check duplicate CPF
    const qCpf = query(collection(db, 'users'), where('cpf', '==', cleanCpf));
    const snapCpf = await getDocs(qCpf);
    if (!snapCpf.empty) {
      return { success: false, error: 'Este CPF já está cadastrado no sistema.' };
    }

    // Check duplicate Email
    const qEmail = query(collection(db, 'users'), where('email', '==', cleanEmail));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) {
      return { success: false, error: 'Este e-mail já está cadastrado no sistema.' };
    }

    const passwordHash = await hashPassword(passwordInput);
    const userId = 'u_' + cleanCpf;
    const userRef = doc(db, 'users', userId);

    const newUser: UserDoc = {
      id: userId,
      name: cleanName,
      email: cleanEmail,
      cpf: cleanCpf,
      passwordHash,
      role: 'Limitado',
      status: 'pending',
      isPermanentAdmin: false,
      createdAt: Date.now(),
      approvedAt: null,
      approvedBy: null,
      authProvider: 'password'
    };

    await setDoc(userRef, newUser);

    return { 
      success: true, 
      message: 'Cadastro realizado com sucesso! Aguarde a aprovação do Administrador para acessar a plataforma.' 
    };
  } catch (err: any) {
    console.error('Register error in authService:', err);
    return { success: false, error: err.message || 'Erro ao registrar usuário. Tente novamente.' };
  }
}

export async function loginWithGoogle(): Promise<{
  success: boolean;
  user?: UserDoc;
  info?: string;
  error?: string;
}> {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    const googleUser = res.user;
    const email = (googleUser.email || '').toLowerCase().trim();
    const isPerm = email === PERMANENT_ADMIN_EMAIL.toLowerCase();

    if (isPerm) {
      const permUser = await ensurePermanentAdminInFirestore();
      localStorage.setItem(SESSION_STORAGE_KEY, permUser.id);
      return { success: true, user: permUser };
    }

    // Search user in Firestore by email
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);

    if (snap.empty) {
      // Create pending user record
      const userId = 'u_g_' + googleUser.uid;
      const newUser: UserDoc = {
        id: userId,
        name: googleUser.displayName || 'Usuário Google',
        email: email,
        cpf: '',
        role: 'Limitado',
        status: 'pending',
        isPermanentAdmin: false,
        createdAt: Date.now(),
        approvedAt: null,
        approvedBy: null,
        authProvider: 'google'
      };
      await setDoc(doc(db, 'users', userId), newUser);
      return { 
        success: false, 
        info: 'Seu cadastro via Google foi registrado com sucesso e está aguardando a aprovação do Administrador.' 
      };
    } else {
      const existingUser = { id: snap.docs[0].id, ...snap.docs[0].data() } as UserDoc;
      if (existingUser.status === 'pending') {
        return { 
          success: false, 
          info: 'Seu cadastro via Google está aguardando a aprovação do Administrador.' 
        };
      }
      if (existingUser.status === 'rejected') {
        return { 
          success: false, 
          error: 'Seu acesso foi recusado pelo Administrador.' 
        };
      }
      localStorage.setItem(SESSION_STORAGE_KEY, existingUser.id);
      return { success: true, user: existingUser };
    }
  } catch (err: any) {
    console.error('Google Auth Error:', err);
    if (err.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'A janela de autenticação com o Google foi fechada antes de concluir.' };
    }
    if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') {
      return { 
        success: false, 
        error: 'Autenticação Google não habilitada no Firebase. Por favor, utilize o login por E-mail ou CPF e Senha.' 
      };
    }
    return { success: false, error: err.message || 'Erro ao autenticar com o Google.' };
  }
}

export async function logoutSession(): Promise<void> {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  try {
    await auth.signOut();
  } catch (err) {
    console.warn('Firebase auth signOut warning:', err);
  }
}
