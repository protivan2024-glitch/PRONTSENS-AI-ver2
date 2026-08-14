import React, { useState } from 'react';
import { HseLogo } from './HseLogo';
import { 
  loginWithCredentials, 
  registerNewUser, 
  loginWithGoogle 
} from '../lib/authService';
import { auth } from '../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Mail, Lock, User, CreditCard, LogIn, UserPlus, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';

interface AuthModalProps {
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  
  // Login form state
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCpf, setRegCpf] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Auto-mask CPF
  const formatCpf = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d+$/.test(val.replace(/[.-]/g, ''))) {
      setIdentifier(formatCpf(val));
    } else {
      setIdentifier(val);
    }
  };

  const handleRegCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegCpf(formatCpf(e.target.value));
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!identifier.trim()) {
      setErrorMsg('Por favor, informe seu E-mail ou CPF.');
      return;
    }
    if (!loginPassword) {
      setErrorMsg('Por favor, digite sua senha.');
      return;
    }

    setLoading(true);

    try {
      const res = await loginWithCredentials(identifier, loginPassword);
      if (res.success) {
        if (onSuccess) onSuccess();
      } else if (res.info) {
        setInfoMsg(res.info);
      } else if (res.error) {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Erro ao realizar login. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  // Google Login handler
  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      const res = await loginWithGoogle();
      if (res.success) {
        if (onSuccess) onSuccess();
      } else if (res.info) {
        setInfoMsg(res.info);
      } else if (res.error) {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      setErrorMsg(err.message || 'Erro ao autenticar com o Google.');
    } finally {
      setLoading(false);
    }
  };

  // Register handler
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    setLoading(true);

    try {
      const res = await registerNewUser(regName, regEmail, regCpf, regPassword);
      if (res.success) {
        setInfoMsg(res.message || 'Cadastro realizado com sucesso! Aguarde a aprovação do Administrador.');
        setTab('login');
        setRegName('');
        setRegEmail('');
        setRegCpf('');
        setRegPassword('');
      } else {
        setErrorMsg(res.error || 'Erro ao realizar cadastro.');
      }
    } catch (err: any) {
      console.error('Registration Error:', err);
      setErrorMsg(err.message || 'Erro ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  // Password reset
  const handleForgotPassword = async () => {
    if (!identifier || !identifier.includes('@')) {
      setErrorMsg('Digite seu endereço de E-mail completo no campo acima para redefinir sua senha.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, identifier.trim());
      setInfoMsg(`Instruções de redefinição de senha enviadas para ${identifier.trim()}. Verifique sua caixa de entrada.`);
    } catch (err: any) {
      setErrorMsg('Caso este e-mail esteja cadastrado, você receberá instruções de redefinição.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100 my-8">
        
        {/* Header Branding */}
        <div className="bg-[#3F3F3F] p-6 text-center text-white relative">
          <div className="flex justify-center mb-3">
            <HseLogo variant="light" className="h-10" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">ProntoSens AI</h2>
          <p className="text-xs text-lime-400 font-medium mt-1">HSE Consultoria Especializada</p>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-gray-200 bg-gray-50/50">
          <button
            type="button"
            onClick={() => { setTab('login'); setErrorMsg(null); setInfoMsg(null); }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 border-b-2 ${
              tab === 'login'
                ? 'border-[#3F3F3F] text-[#3F3F3F] bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Entrar
          </button>

          <button
            type="button"
            onClick={() => { setTab('register'); setErrorMsg(null); setInfoMsg(null); }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 border-b-2 ${
              tab === 'register'
                ? 'border-[#3F3F3F] text-[#3F3F3F] bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Autocadastro
          </button>
        </div>

        <div className="p-6">

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  E-mail ou CPF
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={handleIdentifierChange}
                    placeholder="Digite seu e-mail ou CPF"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-gray-700">Senha</label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-lime-600 hover:text-lime-700 font-semibold"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Sua senha"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#3F3F3F] hover:bg-[#2f2f2f] active:bg-[#1f1f1f] text-white font-bold text-sm rounded-xl transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Entrar no Sistema
                  </>
                )}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-gray-400 font-medium">ou acesse com</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-2.5 bg-white border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Entrar com Conta Google
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Seu nome completo"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">CPF</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={regCpf}
                    onChange={handleRegCpfChange}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Senha (Mín. 6 caracteres)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Crie uma senha segura"
                    minLength={6}
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#A6CE39] hover:bg-[#95ba32] active:bg-[#84a62a] text-gray-900 font-bold text-sm rounded-xl transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Enviar Solicitação de Cadastro
                  </>
                )}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
