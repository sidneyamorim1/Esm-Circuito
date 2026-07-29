import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Users,
  X,
  Mail,
  Lock,
  User,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Crown
} from 'lucide-react';
import { signUpUser, listUsersFromProfiles, updateUserPassword } from '../services/supabaseService';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminModal({ isOpen, onClose }: AdminModalProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [users, setUsers] = useState<Array<{ id: string; email: string; role: string; createdAt: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    const list = await listUsersFromProfiles();
    setUsers(list);
    setLoadingUsers(false);
  };

  useEffect(() => {
    if (isOpen && activeTab === 'list') {
      fetchUsers();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUserForPassword) {
      setError('Selecione um usuário para alterar a senha.');
      return;
    }

    const cleanPassword = newPassword.trim();
    if (cleanPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setPasswordLoading(true);
    setError('');
    setSuccess('');

    const res = await updateUserPassword(selectedUserForPassword.id, cleanPassword);
    setPasswordLoading(false);

    if (!res.success) {
      setError(res.error || 'Não foi possível alterar a senha.');
      return;
    }

    setSuccess(`Senha de ${selectedUserForPassword.email} alterada com sucesso.`);
    setNewPassword('');
    setSelectedUserForPassword(null);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      setError('Preencha nome, e-mail e senha.');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Informe um e-mail válido.');
      return;
    }

    if (cleanPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const res = await signUpUser(cleanName, cleanEmail, cleanPassword, role);
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setSuccess(`Usuário ${cleanEmail} cadastrado com sucesso no Supabase (${role === 'admin' ? 'Administrador' : 'Usuário padrão'})!`);
    setName('');
    setEmail('');
    setPassword('');
    setRole('user');
    fetchUsers();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Painel Administrativo
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Admin
                </span>
              </h2>
              <p className="text-xs text-slate-400">Gerencie contas de usuários e acesso à plataforma</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/30">
          <button
            onClick={() => { setActiveTab('create'); setError(''); setSuccess(''); }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'create'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus size={16} />
            Cadastrar Novo Usuário
          </button>
          <button
            onClick={() => { setActiveTab('list'); setError(''); setSuccess(''); }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'list'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={16} />
            Usuários Cadastrados ({users.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'create' ? (
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nome Completo
                </label>
                <div className="relative">
                  <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Nome do novo usuário"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  E-mail do Usuário
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="usuario@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Senha Inicial
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nível de Permissão (Role)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('user')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                      role === 'user'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <User size={16} />
                    Usuário Padrão
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                      role === 'admin'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Crown size={16} />
                    Administrador
                  </button>
                </div>
              </div>

              {success && (
                <div className="flex items-start gap-2.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3.5 py-3 text-xs font-medium rounded-xl">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 border border-red-500/30 bg-red-500/10 text-red-300 px-3.5 py-3 text-xs font-medium rounded-xl">
                  <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold py-3 text-sm rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Cadastrando...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    <span>Cadastrar Usuário no Supabase</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Usuários Registrados na Tabela Profiles
                </span>
                <button
                  onClick={fetchUsers}
                  disabled={loadingUsers}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  <RefreshCw size={14} className={loadingUsers ? 'animate-spin' : ''} />
                  <span>Atualizar</span>
                </button>
              </div>

              {selectedUserForPassword && (
                <form onSubmit={handleChangePassword} className="space-y-3 p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                        Alterar senha
                      </div>
                      <div className="text-sm font-semibold text-slate-200">
                        {selectedUserForPassword.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedUserForPassword(null); setNewPassword(''); }}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Limpar
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Nova senha
                    </label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="Mínimo 6 caracteres"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold py-2.5 text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {passwordLoading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Atualizando senha...</span>
                      </>
                    ) : (
                      <>
                        <Lock size={18} />
                        <span>Atualizar senha</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {loadingUsers ? (
                <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
                  <Loader2 size={20} className="animate-spin" />
                  <span>Carregando lista de usuários...</span>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                  Nenhum perfil encontrado na tabela profiles.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  {users.map((u) => (
                    <div key={u.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-900/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                          u.role === 'admin'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-indigo-500/20 text-indigo-400'
                        }`}>
                          {u.role === 'admin' ? <Crown size={14} /> : <User size={14} />}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200">{u.email}</div>
                          <div className="text-[10px] text-slate-500">ID: {u.id}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                          u.role === 'admin'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {u.role}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedUserForPassword({ id: u.id, email: u.email })}
                          className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
                        >
                          Senha
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
