import { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Cloud,
  HardDrive,
  Trash2,
  Sparkles,
  BookOpen,
  X,
  Loader2,
  Clock,
  Zap,
  ArrowRight
} from 'lucide-react';
import { listProjectsFromCloud, loadProjectFromCloud, deleteProjectFromCloud } from '../services/supabaseService';
import { listProjects, loadProject, deleteProject } from '../storage/db';
import { circuitExamples, type CircuitExample } from '../examples/circuits';

interface ProjectsHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onLoadExample: (example: CircuitExample) => void;
  onLoadProjectData: (projectData: any) => void;
  onExportJSON?: () => void;
  onImportJSON?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  userName?: string;
  userId?: string;
}

export default function ProjectsHubModal({
  isOpen,
  onClose,
  onNewProject,
  onLoadExample,
  onLoadProjectData,
  onExportJSON,
  onImportJSON,
  userName = 'Engenheiro',
  userId
}: ProjectsHubModalProps) {
  const [activeTab, setActiveTab] = useState<'recent' | 'examples'>('recent');
  const [cloudProjects, setCloudProjects] = useState<any[]>([]);
  const [localProjects, setLocalProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAllProjects = async () => {
    setLoading(true);
    try {
      const [cloudList, localList] = await Promise.all([
        listProjectsFromCloud(),
        listProjects(userId)
      ]);
      setCloudProjects(cloudList || []);
      setLocalProjects(localList || []);
    } catch (err) {
      console.error('Erro ao buscar projetos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAllProjects();
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleOpenCloud = async (id: string) => {
    setLoading(true);
    const data = await loadProjectFromCloud(id);
    setLoading(false);
    if (data) {
      onLoadProjectData(data);
      onClose();
    } else {
      alert('Erro ao carregar projeto da nuvem.');
    }
  };

  const handleOpenLocal = async (id: string) => {
    setLoading(true);
    const data = await loadProject(id, userId);
    setLoading(false);
    if (data) {
      onLoadProjectData(data);
      onClose();
    } else {
      alert('Erro ao carregar projeto local.');
    }
  };

  const handleDeleteCloud = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Excluir "${name}" da nuvem Supabase?`)) return;
    await deleteProjectFromCloud(id);
    fetchAllProjects();
  };

  const handleDeleteLocal = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Excluir "${name}" do armazenamento local?`)) return;
    await deleteProject(id, userId);
    fetchAllProjects();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Banner Superior com Boas-Vindas */}
        <div className="p-6 sm:p-8 bg-gradient-to-r from-indigo-900/60 via-slate-900 to-slate-950 border-b border-slate-800 relative overflow-hidden">
          <div className="floating-orb" style={{ width: 300, height: 300, top: '-50%', right: '-10%', background: 'rgba(99, 102, 241, 0.15)' }} />
          
          <div className="flex justify-between items-start relative z-10">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider mb-2">
                <Sparkles size={14} className="text-amber-400 animate-pulse" />
                <span>Simulador ESM Circuito • Workspace</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Olá, <span className="gradient-text">{userName}</span>! 👋
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-lg">
                Escolha um projeto recente para continuar de onde parou ou comece uma nova simulação em branco.
              </p>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X size={22} />
            </button>
          </div>

          {/* Ação Rápida: Novo Projeto, Importar e Exportar */}
          <div className="mt-6 flex flex-wrap gap-3 relative z-10">
            <button
              onClick={() => { onNewProject(); onClose(); }}
              className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black text-xs sm:text-sm transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
            >
              <Plus size={18} />
              <span>Novo Circuito em Branco</span>
            </button>

            {onExportJSON && (
              <button
                onClick={onExportJSON}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs transition-all active:scale-95"
              >
                <span>Exportar JSON</span>
              </button>
            )}

            {onImportJSON && (
              <label className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs transition-all cursor-pointer active:scale-95">
                <span>Importar JSON</span>
                <input type="file" accept=".json" onChange={(e) => { onImportJSON(e); onClose(); }} className="hidden" />
              </label>
            )}
          </div>
        </div>

        {/* Abas Principais */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/50">
          <button
            onClick={() => setActiveTab('recent')}
            className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'recent'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock size={16} />
            Meus Projetos Recentes ({cloudProjects.length + localProjects.length})
          </button>
          <button
            onClick={() => setActiveTab('examples')}
            className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'examples'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen size={16} />
            Sugestões de Exemplos ({circuitExamples.length})
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'recent' ? (
            <div>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                  <span className="text-xs">Carregando seus projetos...</span>
                </div>
              ) : cloudProjects.length === 0 && localProjects.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-slate-800 rounded-2xl p-6">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-3">
                    <FolderOpen size={24} />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm">Nenhum projeto salvo ainda</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Crie um circuito no editor e salve com <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px]">Ctrl+S</kbd> para acessá-lo na nuvem ou localmente.
                  </p>
                  <button
                    onClick={() => { onNewProject(); onClose(); }}
                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2 transition-all"
                  >
                    <Plus size={14} />
                    Começar Novo Circuito
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Seção 1: Projetos na Nuvem Supabase */}
                  {cloudProjects.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">
                        <Cloud size={14} />
                        <span>Sincronizados no Supabase Cloud ({cloudProjects.length})</span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {cloudProjects.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => handleOpenCloud(p.id)}
                            className="group p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/60 hover:bg-slate-900 cursor-pointer transition-all flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1">
                                  {p.name}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 shrink-0">
                                  <Cloud size={10} /> Nuvem
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Atualizado: {new Date(p.updatedAt).toLocaleString('pt-BR')}
                              </p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-800/50 flex justify-between items-center">
                              <span className="text-[11px] font-bold text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                Abrir no Simulador <ArrowRight size={12} />
                              </span>
                              <button
                                onClick={(e) => handleDeleteCloud(e, p.id, p.name)}
                                className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                                title="Excluir da Nuvem"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Seção 2: Projetos Locais (IndexedDB) */}
                  {localProjects.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        <HardDrive size={14} />
                        <span>Armazenados neste Navegador ({localProjects.length})</span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {localProjects.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => handleOpenLocal(p.id)}
                            className="group p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/60 hover:bg-slate-900 cursor-pointer transition-all flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1">
                                  {p.name}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                                  Local
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Modificado: {new Date(p.updatedAt).toLocaleString('pt-BR')}
                              </p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-800/50 flex justify-between items-center">
                              <span className="text-[11px] font-bold text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                Abrir Circuito <ArrowRight size={12} />
                              </span>
                              <button
                                onClick={(e) => handleDeleteLocal(e, p.id, p.name)}
                                className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                                title="Excluir Local"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Circuitos Didáticos & Prontos para Teste
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {circuitExamples.map((ex: CircuitExample, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => { onLoadExample(ex); onClose(); }}
                    className="group p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/60 hover:bg-slate-900 cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition-colors">
                          {ex.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {ex.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {ex.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/50 flex justify-between items-center">
                      <span className="text-[11px] text-slate-500 line-clamp-1 font-mono">
                        💡 {ex.educationalInfo}
                      </span>
                      <Zap size={14} className="text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
