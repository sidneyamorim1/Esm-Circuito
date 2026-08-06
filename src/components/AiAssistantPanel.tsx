import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  X,
  Sparkles,
  SearchCheck,
  BookOpen,
  Cpu,
  RefreshCw
} from 'lucide-react';
import { useStore } from '../state/useStore';
import {
  analyzeCircuit,
  explainCircuit,
  buildCircuitContext,
  generateCircuitFromPrompt,
  parseAiCircuitResponse,
  queryGeminiApi,
  queryAzureFoundryApi,
  DEFAULT_AZURE_FOUNDRY_ENDPOINT,
  type AiChatMessage
} from '../services/aiService';

const API_KEY_STORAGE_KEY = 'faustad-gemini-key';
const API_PROVIDER_KEY = 'faustad-ai-provider';
const AZURE_ENDPOINT_KEY = 'faustad-azure-endpoint';

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadCircuit: (name: string, components: any[], wires: any[]) => void;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    role: 'user' | 'admin';
    has_ai_access?: boolean;
  } | null;
}

export default function AiAssistantPanel({ isOpen, onClose, onLoadCircuit, currentUser }: AiAssistantPanelProps) {
  const { components, wires } = useStore();
  
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Olá! Sou o **ESM AI** (agente Azure AI Foundry `proj-eletronica`), seu assistente especialista em circuitos elétricos! ⚡\n\nComo posso te ajudar hoje? Escolha uma ação rápida abaixo ou faça uma pergunta.',
      timestamp: new Date()
    }
  ]);
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey] = useState(() => (localStorage.getItem(API_KEY_STORAGE_KEY) || import.meta.env?.VITE_AZURE_FOUNDRY_KEY || '').trim());
  const [aiProvider] = useState<'gemini' | 'azure_foundry'>(() => 
    (localStorage.getItem(API_PROVIDER_KEY) as any) || 'azure_foundry'
  );
  const [azureEndpoint] = useState(() => 
    localStorage.getItem(AZURE_ENDPOINT_KEY) || import.meta.env?.VITE_AZURE_FOUNDRY_ENDPOINT || DEFAULT_AZURE_FOUNDRY_ENDPOINT
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;


  const handleSendMessage = async (customPrompt?: string, forceLocal: boolean = false) => {
    const prompt = (customPrompt || inputText).trim();
    if (!prompt || isLoading) return;

    if (!customPrompt) setInputText('');

    const userMsg: AiChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: prompt,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    if (!currentUser) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: '🔒 **Acesso Restrito ao Agente Azure AI Foundry**:\n\nVocê precisa fazer login no sistema para conversar com o assistente.',
          timestamp: new Date()
        }
      ]);
      setIsLoading(false);
      return;
    }

    const localPermissions: Record<string, boolean> = JSON.parse(localStorage.getItem('faustad_local_ai_permissions') || '{}');
    const isAllowed = currentUser.role === 'admin' || Boolean(currentUser.has_ai_access) || Boolean(localPermissions[currentUser.id]);

    if (!isAllowed) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: `🔒 **Acesso à IA Não Habilitado**:\n\nOlá, **${currentUser.name}**! Seu usuário (*${currentUser.email}*) ainda não possui permissão para utilizar o Agente Azure AI Foundry.\n\nPeça ao Administrador do sistema para liberar seu acesso no **Painel Admin** (Menu Usuários -> IA: Ativo).`,
          timestamp: new Date()
        }
      ]);
      setIsLoading(false);
      return;
    }

    const runLocalEngine = () => {
      const pLower = prompt.toLowerCase();
      let aiText = '';

      if (pLower.includes('analis') || pLower.includes('diagnos') || pLower.includes('erro')) {
        const diag = analyzeCircuit(components, wires);
        aiText = `### 🔍 Diagnóstico do Circuito\n\n**${diag.summary}**\n\n`;

        if (diag.issues.length > 0) {
          aiText += `#### 🚨 Pontos de Atenção:\n`;
          diag.issues.forEach(issue => {
            const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
            aiText += `- ${icon} **${issue.title}**: ${issue.description}\n`;
          });
        }

        if (diag.suggestions.length > 0) {
          aiText += `\n#### 💡 Sugestões de Correção:\n`;
          diag.suggestions.forEach(sug => {
            aiText += `- ${sug}\n`;
          });
        }
      } else if (pLower.includes('explic') || pLower.includes('como funciona') || pLower.includes('teoria')) {
        aiText = explainCircuit(components, wires);
      } else {
        const generated = generateCircuitFromPrompt(prompt);
        if (generated) {
          aiText = `⚡ Criei o circuito **${generated.name}** para você!\n\nClique no botão abaixo para carregar este circuito diretamente no canvas.`;
          setMessages(prev => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              sender: 'ai',
              text: aiText,
              timestamp: new Date(),
              action: {
                label: `Inserir ${generated.name}`,
                type: 'load_template',
                data: generated
              }
            }
          ]);
          setIsLoading(false);
          return;
        } else {
          aiText = `Para o circuito ("${prompt}"), você pode montar facilmente no editor:\n\n` +
                   `1. Clique no botão **P** (Biblioteca de Dispositivos) à esquerda.\n` +
                   `2. Adicione os componentes necessários (ex: Fonte DC, Resistor, Diodo Zener, GND).\n` +
                   `3. Use a ferramenta **Fio (W)** para interligar os terminais.\n\n` +
                   `💡 *Dica: Configure sua chave do Azure Foundry no ícone 🔑 acima para IA avançada por texto livre!*`;
        }
      }

      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: aiText,
          timestamp: new Date()
        }
      ]);
      setIsLoading(false);
    };

    try {
      const currentKey = apiKey.trim() || (localStorage.getItem(API_KEY_STORAGE_KEY) || '').trim() || import.meta.env?.VITE_AZURE_FOUNDRY_KEY || '';
      const currentProvider = aiProvider || localStorage.getItem(API_PROVIDER_KEY) || 'azure_foundry';
      const currentEndpoint = azureEndpoint.trim() || (localStorage.getItem(AZURE_ENDPOINT_KEY) || '').trim() || import.meta.env?.VITE_AZURE_FOUNDRY_ENDPOINT || DEFAULT_AZURE_FOUNDRY_ENDPOINT;

      if (currentProvider === 'azure_foundry' && !forceLocal) {
        const circuitCtx = buildCircuitContext(components, wires);
        
        // Em produção, usar a Netlify Serverless Function (chave fica no servidor)
        // Em desenvolvimento, usar o proxy do Vite
        const isDev = import.meta.env.DEV;
        let aiText: string;

        if (!isDev) {
          // PRODUÇÃO: Netlify Function — API key fica no servidor
          const proxyRes = await fetch('/api/ai-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              circuitContext: circuitCtx,
              chatHistory: messages.filter(m => m.id !== 'welcome').slice(-6).map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text
              }))
            }),
          });
          
          const proxyData = await proxyRes.json();
          
          if (!proxyRes.ok || proxyData.error) {
            throw new Error(proxyData.error || `Erro do servidor (HTTP ${proxyRes.status})`);
          }
          
          aiText = proxyData.response;
        } else {
          // DESENVOLVIMENTO: Vite proxy direto
          aiText = await queryAzureFoundryApi(currentKey, currentEndpoint, prompt, circuitCtx, '', messages);
        }

        // Tentar parsear circuito gerado pela IA (bloco circuit-json)
        const aiGenerated = parseAiCircuitResponse(aiText);
        // Fallback: tentar gerar pelo motor local de templates
        const localGenerated = !aiGenerated ? generateCircuitFromPrompt(prompt) : null;
        const circuitData = aiGenerated || localGenerated;
        // Se a IA gerou circuito, usar o texto limpo (sem o bloco JSON)
        const displayText = aiGenerated ? aiGenerated.cleanText || aiText : aiText;

        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: displayText,
            timestamp: new Date(),
            action: circuitData ? {
              label: `Inserir ${circuitData.name}`,
              type: 'load_template' as const,
              data: circuitData
            } : undefined
          }
        ]);
        setIsLoading(false);
        return;
      } else if (currentKey && !forceLocal) {
        const circuitCtx = buildCircuitContext(components, wires);
        const aiText = await queryGeminiApi(currentKey, prompt, circuitCtx, messages);
        // Tentar parsear circuito gerado pela IA
        const aiGenerated = parseAiCircuitResponse(aiText);
        const localGenerated = !aiGenerated ? generateCircuitFromPrompt(prompt) : null;
        const circuitData = aiGenerated || localGenerated;
        const displayText = aiGenerated ? aiGenerated.cleanText || aiText : aiText;
        
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: displayText,
            timestamp: new Date(),
            action: circuitData ? {
              label: `Inserir ${circuitData.name}`,
              type: 'load_template' as const,
              data: circuitData
            } : undefined
          }
        ]);
        setIsLoading(false);
        return;
      } else {
        runLocalEngine();
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: `⚠️ **Agente Azure AI Foundry**:\n\n${err.message || 'Falha ao se comunicar com o agente.'}`,
          timestamp: new Date()
        }
      ]);
      setIsLoading(false);
    }
  };

  const handleAnalyzeClick = () => {
    handleSendMessage('Analise e diagnostique detalhadamente o circuito que está montado na minha board agora. Identifique erros de montagem, componentes faltantes, valores inadequados, riscos de queimar componentes e sugira correções específicas.');
  };

  const handleExplainClick = () => {
    handleSendMessage('Explique detalhadamente como funciona o circuito que está montado na minha board agora. Descreva o papel de cada componente, o fluxo de corrente, as tensões em cada ponto e os princípios teóricos envolvidos (Lei de Ohm, Kirchhoff, etc).');
  };

  const handleGenerateLedClick = () => {
    handleSendMessage('Monte um circuito com LED e resistor em bateria de 9V');
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col transition-all duration-300 select-none">
      
      {/* Header do Painel */}
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-md shadow-inner">
            <Bot size={18} className="text-cyan-300" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <span>ESM IA</span>
              <Sparkles size={12} className="text-amber-300 animate-pulse" />
            </h2>
            <span className="text-[9px] text-indigo-100 font-mono">Copiloto Eletrônico</span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>


      {/* Ações Rápidas (Chips) */}
      <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-1.5 overflow-x-auto scrollbar-none">
        <button
          onClick={handleAnalyzeClick}
          className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-all shrink-0 cursor-pointer"
        >
          <SearchCheck size={12} />
          <span>Diagnosticar</span>
        </button>

        <button
          onClick={handleExplainClick}
          className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold hover:bg-cyan-100 dark:hover:bg-cyan-900 transition-all shrink-0 cursor-pointer"
        >
          <BookOpen size={12} />
          <span>Explicar</span>
        </button>

        <button
          onClick={handleGenerateLedClick}
          className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold hover:bg-amber-100 dark:hover:bg-amber-900 transition-all shrink-0 cursor-pointer"
        >
          <Cpu size={12} />
          <span>Gerar LED</span>
        </button>
      </div>

      {/* Área de Mensagens do Chat */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] p-3 rounded-2xl text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-br-none shadow-md'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none shadow-sm'
              }`}
            >
              <div className="whitespace-pre-wrap font-sans">
                {msg.text}
              </div>

              {msg.action && (
                <button
                  onClick={() => {
                    if (msg.action?.type === 'load_template') {
                      onLoadCircuit(
                        msg.action.data.name,
                        msg.action.data.components,
                        msg.action.data.wires
                      );
                    }
                  }}
                  className="mt-2.5 w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-[11px] transition-colors flex items-center justify-center space-x-1 shadow-sm"
                >
                  <Sparkles size={12} />
                  <span>{msg.action.label}</span>
                </button>
              )}
            </div>

            <span className="text-[9px] text-slate-400 mt-1 px-1 font-mono">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 p-3 bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 max-w-[70%]">
            <RefreshCw size={14} className="text-indigo-500 animate-spin" />
            <span className="text-xs font-bold text-slate-500 animate-pulse">Analisando...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Caixa de Entrada de Texto */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2">
        <input
          type="text"
          placeholder="Pergunte sobre circuitos..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isLoading}
          className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
          title="Enviar"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
