import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  X,
  Sparkles,
  SearchCheck,
  BookOpen,
  Key,
  CheckCircle2,
  Cpu,
  RefreshCw
} from 'lucide-react';
import { useStore } from '../state/useStore';
import {
  analyzeCircuit,
  explainCircuit,
  generateCircuitFromPrompt,
  queryGeminiApi,
  queryAzureFoundryApi,
  type AiChatMessage
} from '../services/aiService';

const API_KEY_STORAGE_KEY = 'faustad-gemini-key';
const API_PROVIDER_KEY = 'faustad-ai-provider';
const AZURE_ENDPOINT_KEY = 'faustad-azure-endpoint';

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadCircuit: (name: string, components: any[], wires: any[]) => void;
}

export default function AiAssistantPanel({ isOpen, onClose, onLoadCircuit }: AiAssistantPanelProps) {
  const { components, wires } = useStore();
  
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Olá! Sou o **ESM AI**, seu assistente especialista em circuitos elétricos! ⚡\n\nComo posso te ajudar hoje? Escolha uma ação rápida abaixo ou faça uma pergunta.',
      timestamp: new Date()
    }
  ]);
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) || '');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'azure_foundry'>(() => 
    (localStorage.getItem(API_PROVIDER_KEY) as any) || 'gemini'
  );
  const [azureEndpoint, setAzureEndpoint] = useState(() => 
    localStorage.getItem(AZURE_ENDPOINT_KEY) || ''
  );
  const [keySaved, setKeySaved] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleSaveApiKey = () => {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
    localStorage.setItem(API_PROVIDER_KEY, aiProvider);
    localStorage.setItem(AZURE_ENDPOINT_KEY, azureEndpoint.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
    setShowKeyConfig(false);
  };

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
                   `💡 *Dica: Configure sua chave no ícone 🔑 acima para IA avançada por texto livre!*`;
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
      const currentKey = apiKey.trim() || (localStorage.getItem(API_KEY_STORAGE_KEY) || '').trim();
      const currentProvider = aiProvider || localStorage.getItem(API_PROVIDER_KEY) || 'gemini';
      const currentEndpoint = azureEndpoint.trim() || (localStorage.getItem(AZURE_ENDPOINT_KEY) || '').trim();

      if (currentProvider === 'azure_foundry' && currentKey && currentEndpoint && !forceLocal) {
        const circuitCtx = `Componentes (${components.length}): ${components.map(c => c.name).join(', ')}. Conexões (${wires.length}).`;
        const aiText = await queryAzureFoundryApi(currentKey, currentEndpoint, prompt, circuitCtx);
        const generated = generateCircuitFromPrompt(prompt);

        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: aiText,
            timestamp: new Date(),
            action: generated ? {
              label: `Inserir ${generated.name}`,
              type: 'load_template',
              data: generated
            } : undefined
          }
        ]);
        setIsLoading(false);
      } else if (currentKey && !forceLocal) {
        const circuitCtx = `Componentes (${components.length}): ${components.map(c => c.name).join(', ')}. Conexões (${wires.length}).`;
        const aiText = await queryGeminiApi(currentKey, prompt, circuitCtx);
        const generated = generateCircuitFromPrompt(prompt);
        
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: aiText,
            timestamp: new Date(),
            action: generated ? {
              label: `Inserir ${generated.name}`,
              type: 'load_template',
              data: generated
            } : undefined
          }
        ]);
        setIsLoading(false);
      } else {
        runLocalEngine();
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: `⚠️ **Erro na Comunicação com o Provedor de IA**:\n\n*${err.message || 'Falha na conexão'}*\n\nPor favor, verifique as configurações no ícone de chave 🔑 no topo da janela.`,
          timestamp: new Date()
        }
      ]);
      setIsLoading(false);
    }
  };

  const handleAnalyzeClick = () => {
    handleSendMessage('Analisar e diagnosticar meu circuito atual');
  };

  const handleExplainClick = () => {
    handleSendMessage('Explicar como funciona o circuito atual');
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
              <span>Faustad AI</span>
              <Sparkles size={12} className="text-amber-300 animate-pulse" />
            </h2>
            <span className="text-[9px] text-indigo-100 font-mono">Copiloto Eletrônico</span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowKeyConfig(!showKeyConfig)}
            className={`p-1.5 rounded-lg transition-colors ${showKeyConfig ? 'bg-white/30 text-white' : 'hover:bg-white/10 text-indigo-100'}`}
            title="Configurar Gemini API Key (Opcional)"
          >
            <Key size={15} />
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Configuração de API Key Opcional */}
      {/* Configuração de API Key Opcional */}
      {showKeyConfig && (
        <div className="p-3 bg-indigo-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-200">
            <span>🔑 Provedor de Inteligência Artificial</span>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => setAiProvider('gemini')}
              className={`flex-1 py-1 px-2 rounded border text-[10px] font-bold ${
                aiProvider === 'gemini'
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              Google Gemini (Grátis)
            </button>
            <button
              onClick={() => setAiProvider('azure_foundry')}
              className={`flex-1 py-1 px-2 rounded border text-[10px] font-bold ${
                aiProvider === 'azure_foundry'
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              Microsoft Foundry / Azure
            </button>
          </div>

          {aiProvider === 'gemini' ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                <span>API Key do Google AI Studio</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 underline font-bold"
                >
                  Obter Grátis ↗
                </a>
              </div>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono text-[11px] outline-none focus:border-indigo-500"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">
                  Endpoint do Microsoft Azure Foundry / OpenAI
                </label>
                <input
                  type="text"
                  placeholder="https://seu-recurso.openai.azure.com/..."
                  value={azureEndpoint}
                  onChange={(e) => setAzureEndpoint(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono text-[10px] outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">
                  API Key (Chave do Microsoft Foundry)
                </label>
                <input
                  type="password"
                  placeholder="Sua chave do Microsoft Foundry"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono text-[11px] outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          <button
            onClick={handleSaveApiKey}
            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-xs transition-colors flex items-center justify-center space-x-1"
          >
            {keySaved ? <CheckCircle2 size={13} className="text-green-300" /> : <span>Salvar Configuração</span>}
          </button>
        </div>
      )}

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
