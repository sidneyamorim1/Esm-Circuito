import React, { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useStore } from '../state/useStore';
import CircuitCanvas from '../circuit/canvas/CircuitCanvas';
import Pcb3dViewer from '../circuit/pcb/Pcb3dViewer';
import { circuitExamples, type CircuitExample } from '../examples/circuits';
import { saveProject } from '../storage/db';
import { simulationManager } from '../simulation/workers/workerInterface';
import { updateComponentTerminals } from '../utils/circuitUtils';
import {
  Play,
  Pause,
  Trash2,
  Sun,
  Moon,
  Grid,
  Save,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minus,
  HelpCircle,
  Search,
  ChevronDown,
  Sliders,
  ChevronRight,
  Info,
  TrendingUp,
  BookOpen,
  MousePointer2,
  Cable,
  X,
  Plus,
  Type,
  AlertTriangle,
  LogIn,
  LogOut,
  Bot,
  Sparkles,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  Cloud,
  Mail,
  Lock,
  ShieldCheck,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import AiAssistantPanel from '../components/AiAssistantPanel';
import AdminModal from '../components/AdminModal';
import ProjectsHubModal from '../components/ProjectsHubModal';
import {
  signInUser,
  signOutUser,
  getCurrentUser,
  onAuthStateChange,
  requestPasswordReset,
  saveProjectToCloud,
  loadProjectFromCloud,
  listProjectsFromCloud,
  deleteProjectFromCloud
} from '../services/supabaseService';
import { isSupabaseConfigured } from '../lib/supabase';

interface OscDataPoint {
  time: number;
  ch1?: number;
  ch2?: number;
}

interface OscStats {
  min: number;
  max: number;
  last: number;
  peakToPeak: number;
}

type OscSignal = 'voltage' | 'current';
type OscChannelKey = 'ch1' | 'ch2';
type OscTriggerEdge = 'rising' | 'falling';
type OscMeasurementKey = 'last' | 'min' | 'max' | 'peakToPeak';

interface OscChannelConfig {
  componentId: string;
  signal: OscSignal;
  enabled: boolean;
  scale: number;
  offset: number;
}

interface AuthSession {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

const OSC_MEASUREMENT_OPTIONS: { key: OscMeasurementKey; label: string }[] = [
  { key: 'last', label: 'Atual' },
  { key: 'peakToPeak', label: 'Vpp' },
  { key: 'min', label: 'Min' },
  { key: 'max', label: 'Max' }
];

export default function App() {
  const {
    theme,
    setTheme,
    gridVisible,
    toggleGrid,
    snapToGrid,
    toggleSnapToGrid,
    viewport,
    setViewport,
    resetViewport,
    isSimulating,
    setIsSimulating,
    simulationSpeed,
    currentAnimationSpeed,
    setCurrentAnimationSpeed,
    timestep,
    setTimestep,
    project,
    setProjectName,
    loadProject,
    components,
    wires,
    texts,
    selectedComponentId,
    setSelectedComponentId,
    selectedWireId,
    setSelectedWireId,
    selectedTextId,
    activeTool,
    setActiveTool,
    clearCircuit,
    undo,
    redo,
    removeComponent,
    removeWire,
    projectDevices,
    addProjectDevice,
    removeProjectDevice,
    copySelection,
    pasteSelection,
    duplicateSelection
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'schematic' | 'pcb3d'>('schematic');
  const [boardColor, setBoardColor] = useState('#1b4d3e');
  const [boardDimensions, setBoardDimensions] = useState({ width: 16, height: 12 });
  const [collapsedPanels, setCollapsedPanels] = useState({
    left: false,
    right: false,
    bottom: false
  });

  // Estado para IndexedDB e Projetos
  const [showProjectsHub, setShowProjectsHub] = useState(true);
  const [showExamplesModal, setShowExamplesModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [examplesTab, setExamplesTab] = useState<'examples' | 'cloud'>('examples');
  const [cloudProjects, setCloudProjects] = useState<Array<{ id: string; name: string; createdAt: string; updatedAt: string }>>([]);
  const [loadingCloudProjects, setLoadingCloudProjects] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPickDevicesModal, setShowPickDevicesModal] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const lastAuthUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isSupabaseConfigured()) {
      getCurrentUser().then((user) => {
        if (user) {
          setAuthSession({ id: user.id, name: user.name, email: user.email, role: user.role });
        }
      });

      const { unsubscribe } = onAuthStateChange((user) => {
        if (user) {
          setAuthSession({ id: user.id, name: user.name, email: user.email, role: user.role });
        } else {
          setAuthSession(null);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    const currentUserId = authSession?.id || null;
    if (currentUserId && lastAuthUserIdRef.current !== currentUserId) {
      clearCircuit();
      setProjectName('Novo Circuito');
    }

    lastAuthUserIdRef.current = currentUserId;
    setCloudProjects([]);
    setExamplesTab('examples');
  }, [authSession?.id]);

  // Estados locais para Osciloscópio
  const [oscTimeWindow, setOscTimeWindow] = useState(0.12);
  const [oscChannels, setOscChannels] = useState<Record<OscChannelKey, OscChannelConfig>>({
    ch1: { componentId: '', signal: 'voltage', enabled: true, scale: 5, offset: 0 },
    ch2: { componentId: '', signal: 'current', enabled: true, scale: 0.01, offset: 0 }
  });
  const [oscTrigger, setOscTrigger] = useState({
    enabled: true,
    channel: 'ch1' as OscChannelKey,
    level: 0,
    edge: 'rising' as OscTriggerEdge
  });
  const [oscCaptureRunning, setOscCaptureRunning] = useState(true);
  const [oscWindowOpen, setOscWindowOpen] = useState(false);
  const [oscWindowMinimized, setOscWindowMinimized] = useState(false);
  const [oscWindowPosition, setOscWindowPosition] = useState({ x: 16, y: 72 });
  const [oscDragOffset, setOscDragOffset] = useState<{ x: number; y: number } | null>(null);

  // Controle de empilhamento de janelas e canal dos cursores (separadamente)
  const [topWindow, setTopWindow] = useState<'osc' | 'fgen'>('osc');
  const [oscCursor1Channel, setOscCursor1Channel] = useState<OscChannelKey>('ch1');
  const [oscCursor2Channel, setOscCursor2Channel] = useState<OscChannelKey>('ch2');
  const [fgenWindowOpen, setFgenWindowOpen] = useState(false);
  const [fgenWindowMinimized, setFgenWindowMinimized] = useState(false);
  const [fgenWindowPosition, setFgenWindowPosition] = useState({ x: 760, y: 72 });
  const [fgenDragOffset, setFgenDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [fgenComponentId, setFgenComponentId] = useState<string | null>(null);



  const [oscKnobDrag, setOscKnobDrag] = useState<{
    type: 'vertical-scale' | 'vertical-offset' | 'horizontal' | 'trigger';
    channelKey?: OscChannelKey;
    startX: number;
    startY: number;
    startValue: number;
  } | null>(null);
  const [oscPoints, setOscPoints] = useState<OscDataPoint[]>([]);
  const [oscFramePoints, setOscFramePoints] = useState<OscDataPoint[]>([]);
  const [oscFrameStartTime, setOscFrameStartTime] = useState<number>(0);
  const [oscTriggerTime, setOscTriggerTime] = useState<number | null>(null);
  const [oscLockedTriggerTime, setOscLockedTriggerTime] = useState<number | null>(null);
  const [oscVisibleMeasurements, setOscVisibleMeasurements] = useState<OscMeasurementKey[]>(['last', 'peakToPeak']);
  const [oscDisplayStats, setOscDisplayStats] = useState<Record<OscChannelKey, OscStats | null>>({ ch1: null, ch2: null });
  // Cursores do osciloscópio (posições em fração 0..1 da janela de exibição)
  const [oscCursorsEnabled, setOscCursorsEnabled] = useState(false);
  const [oscCursorX1, setOscCursorX1] = useState(0.3);   // cursor vertical 1 (fração 0..1)
  const [oscCursorX2, setOscCursorX2] = useState(0.7);   // cursor vertical 2 (fração 0..1)
  const [oscCursorDrag, setOscCursorDrag] = useState<{ cursor: 'x1' | 'x2'; startMouseX: number; startFrac: number } | null>(null);
  const selectedComponent = components.find(c => c.id === selectedComponentId);
  const componentsRef = useRef(components);
  const oscChannelsRef = useRef(oscChannels);
  const oscTimeWindowRef = useRef(oscTimeWindow);
  const oscTriggerRef = useRef(oscTrigger);
  const oscLastDisplayUpdateRef = useRef(0);
  const oscLastTriggerValueRef = useRef<number | null>(null);
  const oscPendingTriggerTimeRef = useRef<number | null>(null);
  const oscLockedTriggerTimeRef = useRef<number | null>(null);
  const oscTriggerTimeRef = useRef<number | null>(null);

  const getOscWindowBounds = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = viewportWidth < 640 ? 8 : 16;
    const width = Math.min(920, Math.max(320, viewportWidth - margin * 2));
    const height = Math.min(620, Math.max(320, viewportHeight - margin * 2));

    return {
      width,
      height,
      margin,
      x: Math.max(margin, Math.round((viewportWidth - width) / 2)),
      y: Math.max(margin, Math.round((viewportHeight - height) / 2))
    };
  };

  const openOscilloscopeWindow = () => {
    const bounds = getOscWindowBounds();
    setOscWindowPosition({ x: bounds.x, y: bounds.y });
    setOscWindowOpen(true);
    setOscWindowMinimized(false);
  };

  const clampOscWindowPosition = (x: number, y: number) => {
    const bounds = getOscWindowBounds();
    return {
      x: Math.min(Math.max(bounds.margin, x), Math.max(bounds.margin, window.innerWidth - bounds.width - bounds.margin)),
      y: Math.min(Math.max(bounds.margin, y), Math.max(bounds.margin, window.innerHeight - bounds.height - bounds.margin))
    };
  };
  useEffect(() => {
    componentsRef.current = components;
  }, [components]);
  useEffect(() => {
    oscChannelsRef.current = oscChannels;
  }, [oscChannels]);
  useEffect(() => {
    oscTimeWindowRef.current = oscTimeWindow;
  }, [oscTimeWindow]);
  useEffect(() => {
    oscTriggerRef.current = oscTrigger;
    oscLastTriggerValueRef.current = null;
    oscPendingTriggerTimeRef.current = null;
    oscLockedTriggerTimeRef.current = null;
    oscTriggerTimeRef.current = null;
    setOscTriggerTime(null);
    setOscLockedTriggerTime(null);
  }, [oscTrigger]);

  useEffect(() => {
    if (isSimulating) {
      oscLastTriggerValueRef.current = null;
      oscPendingTriggerTimeRef.current = null;
      oscLockedTriggerTimeRef.current = null;
      oscTriggerTimeRef.current = null;
      setOscTriggerTime(null);
      setOscLockedTriggerTime(null);

      const comps = componentsRef.current;
      const scopeComp = comps.find(c => c.type === 'oscilloscope');

      // Só abre a janela do osciloscópio se ele estiver presente no esquema elétrico
      if (scopeComp) {
        openOscilloscopeWindow();
        setOscChannels(prev => ({
          ch1: { ...prev.ch1, componentId: prev.ch1.componentId || scopeComp.id },
          ch2: { ...prev.ch2, componentId: prev.ch2.componentId || scopeComp.id }
        }));
      }
    }
  }, [isSimulating]);

  useEffect(() => {
    if (!oscDragOffset) return;

    const handleMove = (event: MouseEvent) => {
      setOscWindowPosition(clampOscWindowPosition(
        event.clientX - oscDragOffset.x,
        event.clientY - oscDragOffset.y
      ));
    };

    const handleUp = () => setOscDragOffset(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [oscDragOffset]);

  // Drag do painel do Gerador de Funções
  useEffect(() => {
    if (!fgenDragOffset) return;

    const handleMove = (event: MouseEvent) => {
      setFgenWindowPosition({
        x: event.clientX - fgenDragOffset.x,
        y: event.clientY - fgenDragOffset.y
      });
    };

    const handleUp = () => setFgenDragOffset(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [fgenDragOffset]);

  useEffect(() => {
    if (!oscKnobDrag) return;

    const handleMove = (event: MouseEvent) => {
      const deltaY = oscKnobDrag.startY - event.clientY;
      const deltaX = event.clientX - oscKnobDrag.startX;
      const delta = deltaY + deltaX;

      if (oscKnobDrag.type === 'vertical-scale') {
        const channelKey = oscKnobDrag.channelKey ?? 'ch1';
        // Arraste para DIREITA ou CIMA (delta > 0): aumenta o valor de V/Div (gira horário)
        const factor = Math.exp(delta / 120);
        const nextScale = Math.max(1e-6, oscKnobDrag.startValue * factor);
        setOscChannels(prev => ({
          ...prev,
          [channelKey]: { ...prev[channelKey], scale: nextScale }
        }));
      } else if (oscKnobDrag.type === 'vertical-offset') {
        const channelKey = oscKnobDrag.channelKey ?? 'ch1';
        const currentScale = oscChannelsRef.current[channelKey]?.scale ?? 1;
        // Arraste para DIREITA ou CIMA (delta > 0): aumenta o offset (gira horário)
        setOscChannels(prev => ({
          ...prev,
          [channelKey]: {
            ...prev[channelKey],
            offset: oscKnobDrag.startValue + delta * 0.03 * currentScale
          }
        }));
      } else if (oscKnobDrag.type === 'horizontal') {
        // Arraste para DIREITA ou CIMA (delta > 0): aumenta o valor de Sec/Div (gira horário)
        const factor = Math.exp(delta / 120);
        const nextWindow = Math.max(0.0001, Math.min(5.0, oscKnobDrag.startValue * factor));
        setOscTimeWindow(nextWindow);
      } else if (oscKnobDrag.type === 'trigger') {
        const triggerChannel = oscTriggerRef.current.channel;
        const currentScale = oscChannelsRef.current[triggerChannel]?.scale ?? 1;
        // Arraste para DIREITA ou CIMA (delta > 0): aumenta o nível de disparo (gira horário)
        setOscTrigger(prev => ({
          ...prev,
          level: oscKnobDrag.startValue + delta * 0.03 * currentScale
        }));
      }
    };

    const handleUp = () => setOscKnobDrag(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [oscKnobDrag]);

  // Arraste dos cursores do osciloscópio
  useEffect(() => {
    if (!oscCursorDrag) return;

    const handleMove = (event: MouseEvent) => {
      const svgEl = document.querySelector('.osc-svg-display');
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      if (oscCursorDrag.cursor === 'x1') setOscCursorX1(frac);
      else setOscCursorX2(frac);
    };

    const handleUp = () => setOscCursorDrag(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [oscCursorDrag]);

  // Função para obter tensão na posição do cursor (fração 0..1)
  const getOscCursorValue = (frac: number, channelKey: OscChannelKey): number | null => {
    const isLocked = oscTrigger.enabled && oscLockedTriggerTime !== null && oscFramePoints.length >= 2;
    const renderPoints = isLocked ? oscFramePoints : oscPoints;
    if (renderPoints.length < 2) return null;

    const startTime = isLocked ? oscFrameStartTime : getOscViewStartTime(renderPoints);
    const targetTime = startTime + frac * oscTimeWindow;

    let closest: OscDataPoint | null = null;
    let closestDist = Infinity;
    for (const p of renderPoints) {
      if (p[channelKey] === undefined) continue;
      const dist = Math.abs(p.time - targetTime);
      if (dist < closestDist) {
        closestDist = dist;
        closest = p;
      }
    }
    return closest ? (closest[channelKey] ?? null) : null;
  };

  useEffect(() => {
    const scope = components.find(c => c.type === 'oscilloscope');
    if (!scope) return;

    setOscChannels(prev => {
      if (prev.ch1.componentId || prev.ch2.componentId) return prev;
      return {
        ch1: { ...prev.ch1, componentId: scope.id, signal: 'voltage', scale: 5, offset: 0 },
        ch2: { ...prev.ch2, componentId: scope.id, signal: 'voltage', scale: 5, offset: 0 }
      };
    });
  }, [components]);
  
  const selectedText = texts.find(t => t.id === selectedTextId);

  // Inicializa o tema ao montar o componente
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Atalhos Globais de Teclado (Ctrl+C, Ctrl+V, Ctrl+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteSelection();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedComponentId) removeComponent(selectedComponentId);
        else if (selectedWireId) removeWire(selectedWireId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySelection, pasteSelection, duplicateSelection, undo, redo, selectedComponentId, selectedWireId, removeComponent, removeWire]);

  // Autosave a cada 10 segundos se houver alterações
  useEffect(() => {
    const interval = setInterval(() => {
      if (components.length > 0 || wires.length > 0) {
        const projData = {
          format: 'electronic-simulator-project',
          version: '1.0.0',
          project,
          settings: { gridSize: 20, snapToGrid, simulationSpeed, currentAnimationSpeed, timestep },
          components,
          wires,
          texts,
          viewport,
          projectDevices
        };
        saveProject(projData, authSession?.id);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [components, wires, texts, viewport, project, snapToGrid, simulationSpeed, currentAnimationSpeed, timestep, projectDevices, authSession?.id]);

  // Escuta os eventos da simulação física para popular o Osciloscópio
  useEffect(() => {
    const handleSimTick = (e: Event) => {
      if (!oscCaptureRunning) return;

      const customEvent = e as CustomEvent;
      const { time, results } = customEvent.detail;

      const channels = oscChannelsRef.current;
      const point: OscDataPoint = { time };

      (['ch1', 'ch2'] as OscChannelKey[]).forEach((channelKey) => {
        const channel = channels[channelKey];
        if (!channel.enabled || !channel.componentId) return;

        const compState = results.componentStates[channel.componentId];
        if (!compState) return;

        const component = componentsRef.current.find(c => c.id === channel.componentId);
        if (component?.type === 'oscilloscope') {
          const customKey = channelKey === 'ch1' ? 'ch1Voltage' : 'ch2Voltage';
          point[channelKey] = compState.custom?.[customKey] ?? 0;
          return;
        }

        point[channelKey] = compState[channel.signal] || 0;
      });

      if (point.ch1 === undefined && point.ch2 === undefined) return;

      const trigger = oscTriggerRef.current;
      const triggerValue = point[trigger.channel];
      if (trigger.enabled && triggerValue !== undefined) {
        const previousValue = oscLastTriggerValueRef.current;
        const crossedRising = previousValue !== null && (
          (previousValue < trigger.level && triggerValue >= trigger.level) ||
          (previousValue <= trigger.level && triggerValue > trigger.level)
        );
        const crossedFalling = previousValue !== null && (
          (previousValue > trigger.level && triggerValue <= trigger.level) ||
          (previousValue >= trigger.level && triggerValue < trigger.level)
        );

        if (
          (trigger.edge === 'rising' && crossedRising) ||
          (trigger.edge === 'falling' && crossedFalling)
        ) {
          const pendingTime = oscPendingTriggerTimeRef.current;
          const isReadyForNextCapture =
            pendingTime === null || time >= pendingTime + (oscTimeWindowRef.current * 0.75);

          if (isReadyForNextCapture) {
            oscPendingTriggerTimeRef.current = time;
            setOscTriggerTime(time);
          }
        }
        oscLastTriggerValueRef.current = triggerValue;
      }

      setOscPoints(prev => {
        const cutoff = time - (oscTimeWindowRef.current * 6);
        const nextPoints = [...prev, point].filter(sample => sample.time >= cutoff).slice(-1500);

        const pendingTime = oscPendingTriggerTimeRef.current;
        const postTriggerTime = oscTimeWindowRef.current * 0.75;

        // Quando acumuladas todas as amostras do quadro de disparo, atualiza a tela com o quadro 100% completo
        if (trigger.enabled && pendingTime !== null && time >= pendingTime + postTriggerTime) {
          const startTime = Math.max(0, pendingTime - oscTimeWindowRef.current * 0.25);
          const endTime = pendingTime + postTriggerTime;
          const frame = nextPoints.filter(p => p.time >= startTime && p.time <= endTime);

          if (frame.length >= 2) {
            setOscFramePoints(frame);
            setOscFrameStartTime(startTime);
            setOscLockedTriggerTime(pendingTime);
            oscLockedTriggerTimeRef.current = pendingTime;
          }
          oscPendingTriggerTimeRef.current = null;
        }

        const lockedTime = oscLockedTriggerTimeRef.current;
        if (lockedTime !== null && time > lockedTime + (oscTimeWindowRef.current * 4)) {
          oscLockedTriggerTimeRef.current = null;
          setOscLockedTriggerTime(null);
        }

        return nextPoints;
      });
    };

    window.addEventListener('circuit-simulation-tick', handleSimTick);
    return () => window.removeEventListener('circuit-simulation-tick', handleSimTick);
  }, [oscCaptureRunning]);

  // Limpa o osciloscópio quando inicia uma nova simulação
  useEffect(() => {
    if (isSimulating) {
      oscPendingTriggerTimeRef.current = null;
      oscLockedTriggerTimeRef.current = null;
      setOscLockedTriggerTime(null);
      setOscPoints([]);
    }
  }, [isSimulating]);

  useEffect(() => {
    if (oscPoints.length === 0) {
      oscLastDisplayUpdateRef.current = 0;
      setOscDisplayStats({ ch1: null, ch2: null });
      return;
    }

    const now = Date.now();
    if (now - oscLastDisplayUpdateRef.current < 500) return;
    oscLastDisplayUpdateRef.current = now;

    const endTime = oscPoints[oscPoints.length - 1].time;
    const preTrigger = oscTimeWindow * 0.25;
    let startTime = Math.max(0, endTime - oscTimeWindow);

    if (
      oscTrigger.enabled &&
      oscLockedTriggerTime !== null &&
      oscLockedTriggerTime >= endTime - oscTimeWindow * 4
    ) {
      startTime = Math.max(0, oscLockedTriggerTime - preTrigger);
    }

    const endVisible = startTime + oscTimeWindow;
    const getSamples = (channelKey: OscChannelKey) => {
      const visibleSamples = oscPoints
        .filter(sample => sample[channelKey] !== undefined && sample.time >= startTime && sample.time <= endVisible)
        .map(sample => sample[channelKey] ?? 0);

      if (visibleSamples.length > 0) return visibleSamples;

      return oscPoints
        .filter(sample => sample[channelKey] !== undefined)
        .slice(-24)
        .map(sample => sample[channelKey] ?? 0);
    };

    const getStats = (channelKey: OscChannelKey): OscStats | null => {
      const samples = getSamples(channelKey);
      if (samples.length === 0) return null;

      const min = Math.min(...samples);
      const max = Math.max(...samples);
      const recent = samples.slice(-12);
      const last = recent.reduce((sum, value) => sum + value, 0) / recent.length;

      return {
        min,
        max,
        last,
        peakToPeak: max - min
      };
    };

    setOscDisplayStats({
      ch1: getStats('ch1'),
      ch2: getStats('ch2')
    });
  }, [oscPoints, oscTimeWindow, oscTrigger.enabled, oscLockedTriggerTime]);

  // Carregar lista de projetos da nuvem Supabase
  const handleFetchCloudProjects = async () => {
    setLoadingCloudProjects(true);
    const list = await listProjectsFromCloud();
    setCloudProjects(list);
    setLoadingCloudProjects(false);
  };

  useEffect(() => {
    if (showExamplesModal && examplesTab === 'cloud') {
      handleFetchCloudProjects();
    }
  }, [showExamplesModal, examplesTab]);

  // Salvar projeto manualmente (Local + Nuvem Supabase)
  const handleSaveProject = async () => {
    const projData = {
      format: 'electronic-simulator-project',
      version: '1.0.0',
      project,
      settings: { gridSize: 20, snapToGrid, simulationSpeed, currentAnimationSpeed, timestep },
      components,
      wires,
      texts,
      viewport,
      projectDevices
    };
    await saveProject(projData, authSession?.id);
    let msg = 'Projeto salvo no armazenamento local!';

    if (isSupabaseConfigured() && authSession) {
      const res = await saveProjectToCloud(projData as any);
      if (res.success) {
        msg = '⚡ Projeto salvo localmente e sincronizado na nuvem (Supabase) com sucesso!';
      } else {
        msg += `\n(Aviso Supabase: ${res.error})`;
      }
    }

    alert(msg);
  };

  const handleLoadCloudProject = async (id: string) => {
    const projectCloud = await loadProjectFromCloud(id);
    if (!projectCloud) {
      alert('Não foi possível carregar este projeto da nuvem.');
      return;
    }

    const updatedComponents = (projectCloud.components || []).map(comp => updateComponentTerminals(comp));
    loadProject({
      ...projectCloud,
      components: updatedComponents
    });
    setShowExamplesModal(false);
  };

  const handleDeleteCloudProject = async (id: string, name: string) => {
    if (!confirm(`Deseja excluir o projeto "${name}" da nuvem?`)) return;
    const ok = await deleteProjectFromCloud(id);
    if (ok) {
      handleFetchCloudProjects();
    } else {
      alert('Erro ao excluir projeto da nuvem.');
    }
  };

  // Carregar circuito de exemplo
  const handleLoadExample = (example: CircuitExample) => {
    // Para carregar o exemplo com segurança e sem quebrar as pontas dos fios:
    // Nós mapeamos e recalculamos os terminais absolutos
    const updatedComponents = example.components.map(comp => updateComponentTerminals(comp));
    
    loadProject({
      project: {
        id: `example-${Date.now()}`,
        name: example.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      components: updatedComponents,
      wires: example.wires,
      viewport: { x: 10, y: 10, zoom: 1 },
      projectDevices: example.components.map(c => c.type).filter((val, i, arr) => arr.indexOf(val) === i)
    });
    
    // Notifica o SimulationManager
    simulationManager.reset();
    simulationManager.updateCircuit(updatedComponents, example.wires);
    
    setShowExamplesModal(false);
  };

  // Exportar circuito como arquivo JSON
  const handleExportJSON = () => {
    const projData = {
      format: 'electronic-simulator-project',
      version: '1.0.0',
      project,
      settings: { gridSize: 20, snapToGrid, simulationSpeed, currentAnimationSpeed, timestep },
      components,
      wires,
      texts,
      viewport,
      projectDevices
    };
    const blob = new Blob([JSON.stringify(projData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Importar circuito via arquivo JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.format !== 'electronic-simulator-project') {
          alert('Arquivo inválido. Formato incompatível.');
          return;
        }
        
        // Corrige terminais de componentes importados
        const comps = (parsed.components || []).map((c: any) => updateComponentTerminals(c));

        loadProject({
          project: parsed.project || project,
          components: comps,
          wires: parsed.wires || [],
          texts: parsed.texts || [],
          viewport: parsed.viewport || viewport,
          projectDevices: parsed.projectDevices || comps.map((c: any) => c.type).filter((val: string, i: number, arr: string[]) => arr.indexOf(val) === i)
        });

        simulationManager.reset();
        simulationManager.updateCircuit(comps, parsed.wires || []);
        
        alert('Circuito importado com sucesso!');
      } catch {
        alert('Erro ao analisar o arquivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  // Formata o valor com o prefixo apropriado (ex: 1000 -> 1k)
  const formatValue = (val: number, unit?: string) => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M${unit || ''}`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}k${unit || ''}`;
    if (abs < 1 && abs > 0) {
      if (abs >= 1e-3) return `${sign}${(abs * 1e3).toFixed(2)}m${unit || ''}`;
      if (abs >= 1e-6) return `${sign}${(abs * 1e6).toFixed(2)}μ${unit || ''}`;
      if (abs >= 1e-9) return `${sign}${(abs * 1e9).toFixed(2)}n${unit || ''}`;
      if (abs >= 1e-12) return `${sign}${(abs * 1e12).toFixed(2)}p${unit || ''}`;
    }
    return `${sign}${abs.toFixed(2)}${unit || ''}`;
  };

  const componentLibrary = [
    { type: 'ground', name: 'Terra (GND)', category: 'sources', desc: 'Referência de 0V' },
    { type: 'source_dc', name: 'Fonte DC (Bateria)', category: 'sources', desc: 'Fonte de Tensão Contínua' },
    { type: 'source_ac', name: 'Fonte AC (Gerador)', category: 'sources', desc: 'Gerador de Tensão Senoidal' },
    { type: 'source_pulse', name: 'Gerador de Pulso', category: 'sources', desc: 'Fonte de ondas quadradas/pulsos' },
    { type: 'source_current', name: 'Fonte de Corrente', category: 'sources', desc: 'Fonte de Corrente Constante' },
    
    { type: 'junction', name: 'Nó de Junção', category: 'passives', desc: 'Ponto de conexão de fios' },
    { type: 'resistor', name: 'Resistor', category: 'passives', desc: 'Limita o fluxo de corrente' },
    { type: 'pot', name: 'Potenciômetro', category: 'passives', desc: 'Resistor de 3 terminais ajustável manualmente' },
    { type: 'capacitor', name: 'Capacitor Eletrolítico', category: 'passives', desc: 'Capacitor eletrolítico polarizado' },
    { type: 'capacitor_ceramic', name: 'Capacitor Cerâmico', category: 'passives', desc: 'Capacitor de disco não polarizado' },
    { type: 'capacitor_polyester', name: 'Capacitor Poliéster', category: 'passives', desc: 'Capacitor tipo caixa não polarizado' },
    { type: 'inductor', name: 'Indutor', category: 'passives', desc: 'Armazena energia em campo magnético' },
    { type: 'switch', name: 'Interruptor (Switch)', category: 'passives', desc: 'Chave liga/desliga simples' },
    
    { type: 'motor_dc', name: 'Motor DC', category: 'electromechanical', desc: 'Motor de Corrente Contínua' },
    { type: 'relay', name: 'Relé SPDT', category: 'electromechanical', desc: 'Relé eletromecânico simples (Polo único, duplo contato)' },

    { type: 'led', name: 'LED', category: 'semiconductors', desc: 'Diodo Emissor de Luz' },
    { type: 'diodo', name: 'Diodo Retificador', category: 'semiconductors', desc: 'Permite fluxo unidirecional de corrente' },
    { type: 'zener', name: 'Diodo Zener', category: 'semiconductors', desc: 'Diodo regulador de tensão Zener' },
    { type: 'ldr', name: 'LDR (Fotoresistor)', category: 'semiconductors', desc: 'Sensor de luz com resistência variável' },
    { type: 'transistor_bjt_npn', name: 'Transistor NPN', category: 'semiconductors', desc: 'Transistor Bipolar de Junção NPN' },
    { type: 'transistor_bjt_pnp', name: 'Transistor PNP', category: 'semiconductors', desc: 'Transistor Bipolar de Junção PNP' },

    { type: 'logic_and', name: 'Porta AND (7408)', category: 'digital', desc: 'Porta lógica digital AND' },
    { type: 'logic_or', name: 'Porta OR (7432)', category: 'digital', desc: 'Porta lógica digital OR' },
    { type: 'logic_not', name: 'Porta NOT (7404)', category: 'digital', desc: 'Inversor lógico digital NOT' },

    { type: 'function_generator', name: 'Gerador de Funções', category: 'instruments', desc: 'Gerador de Sinais (Senoidal, Quadrado, Triangular, Dente de Serra)' },
    { type: 'probe_dc', name: 'Ponta de Prova DC', category: 'instruments', desc: 'Ponta de medição pontual de tensão contínua (0V a 1000V DC)' },
    { type: 'probe_ac', name: 'Ponta de Prova AC', category: 'instruments', desc: 'Ponta de medição de tensão alternada (Pico e RMS AC)' },
    { type: 'voltmeter', name: 'Voltímetro', category: 'instruments', desc: 'Medidor de tensão entre dois pontos' },
    { type: 'ammeter', name: 'Amperímetro', category: 'instruments', desc: 'Medidor de corrente em série' },
    { type: 'oscilloscope', name: 'Osciloscópio 2 Canais', category: 'instruments', desc: 'Instrumento com pontas CH1/G1 e CH2/G2' }
  ];

  const categories = [
    { id: 'all', label: 'Todos' },
    { id: 'sources', label: 'Fontes' },
    { id: 'passives', label: 'Passivos' },
    { id: 'electromechanical', label: 'Eletromecânicos' },
    { id: 'semiconductors', label: 'Diodos e Sensores' },
    { id: 'digital', label: 'Digitais (Portas)' },
    { id: 'instruments', label: 'Instrumentos' }
  ];

  const filteredComponents = componentLibrary.filter(comp => {
    const matchesSearch = comp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          comp.desc.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || comp.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const updateOscChannel = (channelKey: OscChannelKey, patch: Partial<OscChannelConfig>) => {
    setOscChannels(prev => ({
      ...prev,
      [channelKey]: { ...prev[channelKey], ...patch }
    }));
  };

  const getOscChannelName = (channelKey: OscChannelKey) => channelKey === 'ch1' ? 'CH1' : 'CH2';
  const getOscChannelColor = (channelKey: OscChannelKey) => channelKey === 'ch1' ? '#f59e0b' : '#22c55e';
  const getOscSignalUnit = (signal: OscSignal) => signal === 'voltage' ? 'V' : 'A';

  const getOscLiveValue = (channelKey: OscChannelKey) => {
    const channel = oscChannels[channelKey];
    if (channel.componentId) {
      const component = components.find(c => c.id === channel.componentId);
      if (component) {
        if (component.type === 'oscilloscope') {
          const customKey = channelKey === 'ch1' ? 'ch1Voltage' : 'ch2Voltage';
          return component.simulationState?.custom?.[customKey] ?? 0;
        }
        if (component.type === 'probe_ac') {
          return component.simulationState?.custom?.vPeak ?? component.simulationState?.voltage ?? 0;
        }
        return component.simulationState?.[channel.signal] ?? 0;
      }
    }

    // Padrão: lê os terminais de entrada CH1 / CH2 do Osciloscópio no esquema elétrico
    const scopeComp = components.find(c => c.type === 'oscilloscope');
    if (scopeComp) {
      const customKey = channelKey === 'ch1' ? 'ch1Voltage' : 'ch2Voltage';
      return scopeComp.simulationState?.custom?.[customKey] ?? 0;
    }

    return 0;
  };

  const getOscY = (channelKey: OscChannelKey, value: number) => {
    const height = 180;
    const channel = oscChannels[channelKey];
    const pixelsPerDiv = height / 8;
    const scale = Math.max(channel.scale, 1e-12);
    return (height / 2) - ((value - channel.offset) / scale) * pixelsPerDiv;
  };

  const getOscViewStartTime = (data: OscDataPoint[]) => {
    if (data.length === 0) return 0;

    const endTime = data[data.length - 1].time;
    const triggerTime = oscLockedTriggerTime;
    const preTrigger = oscTimeWindow * 0.25;

    if (
      oscTrigger.enabled &&
      triggerTime !== null &&
      triggerTime >= endTime - oscTimeWindow * 4
    ) {
      return Math.max(0, triggerTime - preTrigger);
    }

    return Math.max(0, endTime - oscTimeWindow);
  };

  const getOscVisibleSamples = (channelKey: OscChannelKey) => {
    if (oscPoints.length === 0) return [];

    const startTime = getOscViewStartTime(oscPoints);
    const endTime = startTime + oscTimeWindow;
    const visibleSamples = oscPoints
      .filter(sample => sample[channelKey] !== undefined && sample.time >= startTime && sample.time <= endTime)
      .map(sample => sample[channelKey] ?? 0);

    if (visibleSamples.length > 0) return visibleSamples;

    return oscPoints
      .filter(sample => sample[channelKey] !== undefined)
      .slice(-24)
      .map(sample => sample[channelKey] ?? 0);
  };

  const getOscStats = (channelKey: OscChannelKey): OscStats | null => {
    const samples = getOscVisibleSamples(channelKey);
    if (samples.length === 0) {
      const live = getOscLiveValue(channelKey);
      if (live !== null && live !== undefined) {
        return { min: live, max: live, last: live, peakToPeak: 0 };
      }
      return null;
    }

    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const recent = samples.slice(-12);
    const last = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    return {
      min,
      max,
      last,
      peakToPeak: max - min
    };
  };

  const toggleOscMeasurement = (measurement: OscMeasurementKey) => {
    setOscVisibleMeasurements(prev => {
      if (prev.includes(measurement)) {
        return prev.length === 1 ? prev : prev.filter(item => item !== measurement);
      }

      return [...prev, measurement];
    });
  };

  const getOscMeasurementValue = (
    stats: ReturnType<typeof getOscStats>,
    measurement: OscMeasurementKey,
    unit: string
  ) => {
    if (!stats) return '--';
    return formatValue(stats[measurement], unit);
  };

  const getScaleKnobRotation = (scale: number) => {
    const logVal = Math.log10(Math.max(1e-6, scale));
    const ratio = Math.max(0, Math.min(1, (logVal - (-5)) / (3 - (-5))));
    return -135 + ratio * 270;
  };

  const getOffsetKnobRotation = (offset: number, scale: number) => {
    const range = Math.max(1, scale * 8);
    const clamped = Math.max(-range, Math.min(range, offset));
    const ratio = (clamped - (-range)) / (2 * range);
    return -135 + ratio * 270;
  };

  const getTimeKnobRotation = (timeWindow: number) => {
    const logVal = Math.log10(Math.max(0.0001, timeWindow));
    const ratio = Math.max(0, Math.min(1, (logVal - (-4)) / (0.7 - (-4))));
    return -135 + ratio * 270;
  };

  const getTriggerKnobRotation = (level: number, channelKey: OscChannelKey) => {
    const scale = oscChannels[channelKey]?.scale ?? 1;
    const range = Math.max(1, scale * 8);
    const clamped = Math.max(-range, Math.min(range, level));
    const ratio = (clamped - (-range)) / (2 * range);
    return -135 + ratio * 270;
  };

  // Renderiza gráfico SVG do Osciloscópio com interpolação suave de curva
  const renderOscPath = (data: OscDataPoint[], channelKey: OscChannelKey) => {
    const isLocked = oscTrigger.enabled && oscLockedTriggerTime !== null && oscFramePoints.length >= 2;
    const renderPoints = isLocked ? oscFramePoints : data;
    if (renderPoints.length < 2) return '';
    const width = 500;

    const startTime = isLocked ? oscFrameStartTime : getOscViewStartTime(renderPoints);
    const endTime = startTime + oscTimeWindow;
    const samples = renderPoints.filter(d => d[channelKey] !== undefined && d.time >= startTime && d.time <= endTime);
    if (samples.length < 2) return '';

    const pts = samples.map(d => {
      const value = d[channelKey] ?? 0;
      const x = ((d.time - startTime) / oscTimeWindow) * width;
      const y = getOscY(channelKey, value);
      return { x, y };
    });

    if (pts.length === 2) {
      return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
    }

    // Calcula a amplitude total para determinar o threshold de transição abrupta
    const yValues = pts.map(p => p.y);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yRange = yMax - yMin;
    // Threshold: se a mudança entre dois pontos for > 20% da amplitude total, é transição abrupta (onda quadrada/pulso)
    const sharpThreshold = yRange * 0.20;

    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    const tension = 0.25;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dy = Math.abs(p2.y - p1.y);

      // Detecta se o ponto anterior ou próximo também são abruptos
      const prevAbrupt = i > 0 && Math.abs(p1.y - pts[i - 1].y) > sharpThreshold;
      const nextAbrupt = i < pts.length - 2 && Math.abs(pts[i + 2].y - p2.y) > sharpThreshold;

      if (dy > sharpThreshold || prevAbrupt || nextAbrupt) {
        // Transição abrupta: usa linha reta (onda quadrada/dente de serra/triangular)
        path += ` L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      } else {
        // Transição suave: usa Catmull-Rom Bezier (senoidal e similares)
        const p0 = pts[Math.max(0, i - 1)];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;

        path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }
    }

    return path;
  };

  const persistSession = (session: AuthSession) => {
    setAuthSession(session);
  };

  const resetAuthForm = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthError('');
    setAuthSuccess('');
  };

  const handleLogin = async () => {
    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();

    if (!email || !password) {
      setAuthError('Informe seu e-mail e senha.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');

    if (!isSupabaseConfigured()) {
      setAuthLoading(false);
      setAuthError('A autenticação não está configurada. Contate o administrador.');
      return;
    }

    const { user, error } = await signInUser(email, password);
    setAuthLoading(false);

    if (error) {
      setAuthError(error.includes('Invalid login credentials') ? 'E-mail ou senha incorretos.' : error);
      return;
    }

    if (user) {
      persistSession({ id: user.id, name: user.name, email: user.email, role: user.role });
      resetAuthForm();
    }
  };

  const handlePasswordReset = async () => {
    const email = authEmail.trim().toLowerCase();

    if (!email) {
      setAuthError('Informe seu e-mail para recuperar a senha.');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      setAuthError('Informe um e-mail válido para recuperar a senha.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setAuthError('A autenticação não está configurada. Contate o administrador.');
      return;
    }

    setPasswordResetLoading(true);
    setAuthError('');
    setAuthSuccess('');

    const redirectTo = `${window.location.origin}/`;
    const { success, error } = await requestPasswordReset(email, redirectTo);
    setPasswordResetLoading(false);

    if (!success) {
      setAuthError(error || 'Não foi possível enviar o e-mail de recuperação.');
      return;
    }

    setAuthSuccess('Enviamos um link de recuperação para o seu e-mail.');
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      await signOutUser();
    }
    clearCircuit();
    setProjectName('Novo Circuito');
    setCloudProjects([]);
    setAuthSession(null);
    setShowAdminModal(false);
    setShowProjectsHub(true);
  };

  if (!authSession) {
    const isCloud = isSupabaseConfigured();
    return (
      <div className="h-screen login-bg text-slate-100 flex items-start sm:items-center justify-center px-3 sm:px-4 py-3 sm:py-8 relative overflow-y-auto">
        {/* Animated floating orbs */}
        <div className="floating-orb" style={{ width: 400, height: 400, top: '10%', left: '-5%', background: 'rgba(99, 102, 241, 0.15)' }} />
        <div className="floating-orb" style={{ width: 300, height: 300, bottom: '5%', right: '-3%', background: 'rgba(6, 182, 212, 0.1)', animationDelay: '4s' }} />
        <div className="floating-orb" style={{ width: 200, height: 200, top: '40%', right: '20%', background: 'rgba(139, 92, 246, 0.08)', animationDelay: '8s' }} />
        
        {/* Circuit grid lines */}
        <div className="login-circuit-lines" />

        <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] overflow-hidden rounded-xl sm:rounded-2xl glass-card shadow-2xl my-auto">
          {/* Left Panel — Brand & Features */}
          <section className="p-5 sm:p-10 flex flex-col justify-between gap-5 sm:gap-10 border-b lg:border-b-0 lg:border-r border-white/5">
            <div>
              <div className="flex items-center gap-3 mb-5 sm:mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-indigo-500 to-cyan-500 text-white font-black text-lg sm:text-xl flex items-center justify-center rounded-xl shadow-lg shadow-indigo-500/20 shrink-0">
                    E
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-xl font-black tracking-tight">ESM Circuito</h1>
                    <p className="text-xs text-slate-400">Simulador Eletrônico & PCB</p>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight max-w-lg">
                <span className="gradient-text">Projete, simule</span> e visualize seus circuitos em tempo real.
              </h2>
              <p className="mt-3 sm:mt-5 text-xs sm:text-sm leading-5 sm:leading-6 text-slate-400 max-w-xl">
                Plataforma completa com editor esquemático, simulação SPICE, osciloscópio digital de 2 canais, visualização 3D de PCB e salvamento no banco Supabase.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs text-slate-300">
              <div className="feature-card rounded-xl p-3 sm:p-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center mb-2 sm:mb-2.5">
                  <TrendingUp size={16} className="text-indigo-400" />
                </div>
                <div className="font-bold text-white text-[11px] sm:text-xs leading-tight mb-1">Simulação SPICE</div>
                <p className="hidden sm:block text-slate-400 text-[11px] leading-relaxed">Análise transiente em tempo real com osciloscópio e medições.</p>
              </div>
              <div className="feature-card rounded-xl p-3 sm:p-4">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center mb-2 sm:mb-2.5">
                  <Grid size={16} className="text-cyan-400" />
                </div>
                <div className="font-bold text-white text-[11px] sm:text-xs leading-tight mb-1">PCB 3D</div>
                <p className="hidden sm:block text-slate-400 text-[11px] leading-relaxed">Visualize sua placa de circuito impresso em 3 dimensões.</p>
              </div>
            </div>
          </section>

          {/* Right Panel — Auth Form (Acesso Restrito - Login) */}
          <section className="p-5 sm:p-8 flex flex-col justify-center">
            <div className="mb-5 sm:mb-6">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider mb-1">
                <LogIn size={16} />
                <span>Acesso Restrito</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Entrar na Plataforma</h3>
              <p className="text-xs text-slate-400 mt-1">Informe suas credenciais para acessar o simulador de circuitos.</p>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                  Endereço de E-mail
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full login-input rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white outline-none placeholder-slate-500 transition-all border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="exemplo@email.com"
                    disabled={authLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full login-input rounded-xl pl-10 pr-10 py-2.5 text-sm text-white outline-none placeholder-slate-500 transition-all border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Sua senha de acesso"
                    disabled={authLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleLogin();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={authLoading || passwordResetLoading || !isCloud}
                  className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {passwordResetLoading ? 'Enviando recuperação...' : 'Esqueci minha senha'}
                </button>
              </div>

              {authSuccess && (
                <div className="flex items-start gap-2.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3.5 py-3 text-xs font-medium rounded-xl">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>{authSuccess}</span>
                </div>
              )}

              {authError && (
                <div className="flex items-start gap-2.5 border border-red-500/30 bg-red-500/10 text-red-300 px-3.5 py-3 text-xs font-medium rounded-xl">
                  <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={authLoading || !isCloud}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black py-3 text-sm rounded-xl transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/35 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <span>Entrar no Simulador</span>
                )}
              </button>

            </form>
          </section>
        </div>
      </div>
    );
  }

  const burnedComponents = components.filter(c => c.simulationState?.isBurned);
  const hasBurnedComponents = burnedComponents.length > 0;
  const scopeButtonClass = 'h-7 rounded-[3px] border border-[#9b9b91] bg-[linear-gradient(#fafaf5,#c9cac1)] text-[8px] font-black uppercase text-slate-700 shadow-[0_2px_0_#8f8f86] active:translate-y-px active:shadow-none';
  const clearOscilloscopeCapture = () => {
    oscPendingTriggerTimeRef.current = null;
    oscLockedTriggerTimeRef.current = null;
    setOscLockedTriggerTime(null);
    setOscPoints([]);
  };
  const scopeSoftButtons = [
    { label: 'F1', menu: 'Atual', measurement: 'last' as OscMeasurementKey, action: () => toggleOscMeasurement('last') },
    { label: 'F2', menu: 'Pico a pico', measurement: 'peakToPeak' as OscMeasurementKey, action: () => toggleOscMeasurement('peakToPeak') },
    { label: 'F3', menu: 'Mín', measurement: 'min' as OscMeasurementKey, action: () => toggleOscMeasurement('min') },
    { label: 'F4', menu: 'Máx', measurement: 'max' as OscMeasurementKey, action: () => toggleOscMeasurement('max') },
    { label: 'F5', menu: 'Limpar', action: () => setOscVisibleMeasurements(['last']) }
  ];
  const handleAutoTuneOscilloscope = (customPoints?: OscDataPoint[], depth = 0) => {
    setOscCaptureRunning(true);
    const points = customPoints || oscPoints;

    if (points.length < 5 && depth < 3) {
      setTimeout(() => {
        setOscPoints(latestPoints => {
          handleAutoTuneOscilloscope(latestPoints, depth + 1);
          return latestPoints;
        });
      }, 200);
      return;
    }

    if (points.length === 0) return;

    let ch1Min = Infinity, ch1Max = -Infinity, ch1Count = 0;
    let ch2Min = Infinity, ch2Max = -Infinity, ch2Count = 0;

    points.forEach(p => {
      if (p.ch1 !== undefined && isFinite(p.ch1)) {
        ch1Min = Math.min(ch1Min, p.ch1);
        ch1Max = Math.max(ch1Max, p.ch1);
        ch1Count++;
      }
      if (p.ch2 !== undefined && isFinite(p.ch2)) {
        ch2Min = Math.min(ch2Min, p.ch2);
        ch2Max = Math.max(ch2Max, p.ch2);
        ch2Count++;
      }
    });

    const snapToNiceScale = (val: number): number => {
      if (val <= 0 || !isFinite(val)) return 1;
      const exponent = Math.floor(Math.log10(val));
      const fraction = val / Math.pow(10, exponent);

      let niceFraction: number;
      if (fraction < 1.5) niceFraction = 1;
      else if (fraction < 3.5) niceFraction = 2;
      else if (fraction < 7.5) niceFraction = 5;
      else niceFraction = 10;

      return niceFraction * Math.pow(10, exponent);
    };

    const ch1Vpp = ch1Count > 0 ? ch1Max - ch1Min : 0;
    const ch2Vpp = ch2Count > 0 ? ch2Max - ch2Min : 0;
    const currentChannels = oscChannelsRef.current;

    setOscChannels(prev => {
      const next = { ...prev };

      if (prev.ch1.enabled && ch1Count > 0 && isFinite(ch1Min) && isFinite(ch1Max)) {
        const mid = (ch1Max + ch1Min) / 2;
        const scale = ch1Vpp > 1e-9 ? snapToNiceScale(ch1Vpp / 4.5) : (prev.ch1.signal === 'voltage' ? 5 : 0.01);
        next.ch1 = { ...prev.ch1, scale, offset: mid };
      }

      if (prev.ch2.enabled && ch2Count > 0 && isFinite(ch2Min) && isFinite(ch2Max)) {
        const mid = (ch2Max + ch2Min) / 2;
        const scale = ch2Vpp > 1e-9 ? snapToNiceScale(ch2Vpp / 4.5) : (prev.ch2.signal === 'voltage' ? 5 : 0.01);
        next.ch2 = { ...prev.ch2, scale, offset: mid };
      }

      return next;
    });

    const primaryChannel: OscChannelKey = (ch2Vpp > ch1Vpp && currentChannels.ch2.enabled) ? 'ch2' : 'ch1';
    const primaryMin = primaryChannel === 'ch1' ? ch1Min : ch2Min;
    const primaryMax = primaryChannel === 'ch1' ? ch1Max : ch2Max;
    const primaryCount = primaryChannel === 'ch1' ? ch1Count : ch2Count;

    let estimatedPeriod = 0;
    if (primaryCount >= 6 && primaryMax > primaryMin) {
      const mid = (primaryMax + primaryMin) / 2;
      const validSamples = points.filter(p => p[primaryChannel] !== undefined && p.time !== undefined);

      const crossings: number[] = [];
      for (let i = 1; i < validSamples.length; i++) {
        const p1 = validSamples[i - 1];
        const p2 = validSamples[i];
        const v1 = p1[primaryChannel]!;
        const v2 = p2[primaryChannel]!;
        if (v1 < mid && v2 >= mid) {
          const tCross = p1.time + (p2.time - p1.time) * ((mid - v1) / (v2 - v1 || 1e-9));
          crossings.push(tCross);
        }
      }

      if (crossings.length >= 2) {
        const periods: number[] = [];
        for (let i = 1; i < crossings.length; i++) {
          const dt = crossings[i] - crossings[i - 1];
          if (dt > 0) periods.push(dt);
        }
        if (periods.length > 0) {
          estimatedPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
        }
      }
    }

    if (estimatedPeriod > 0) {
      setOscTimeWindow(Math.max(0.0001, Math.min(2.0, estimatedPeriod * 3)));
    } else {
      const times = points.map(p => p.time).filter(t => t !== undefined);
      if (times.length >= 2) {
        const duration = Math.max(...times) - Math.min(...times);
        if (duration > 0) {
          setOscTimeWindow(Math.max(0.001, Math.min(1.0, duration)));
        } else {
          setOscTimeWindow(0.02);
        }
      } else {
        setOscTimeWindow(0.02);
      }
    }

    const primaryMid = primaryCount > 0 && isFinite(primaryMin) && isFinite(primaryMax)
      ? (primaryMax + primaryMin) / 2
      : 0;

    oscPendingTriggerTimeRef.current = null;
    oscLockedTriggerTimeRef.current = null;
    setOscLockedTriggerTime(null);

    setOscTrigger({
      enabled: true,
      channel: primaryChannel,
      level: primaryMid,
      edge: 'rising'
    });
  };

  const handleScopePanelAction = (action: string) => {
    if (action === 'acquire') {
      setOscCaptureRunning(prev => !prev);
    } else if (action === 'display') {
      openOscilloscopeWindow();
    } else if (action === 'measure') {
      clearOscilloscopeCapture();
    } else if (action === 'cursor') {
      setOscCursorsEnabled(prev => !prev);
    } else if (action === 'utility') {
      setOscChannels(prev => ({
        ch1: { ...prev.ch1, scale: 5, offset: 0 },
        ch2: { ...prev.ch2, scale: 5, offset: 0 }
      }));
    } else if (action === 'save') {
      setOscCaptureRunning(false);
    } else if (action === 'auto') {
      handleAutoTuneOscilloscope();
    } else if (action === 'menu') {
      setOscTrigger(prev => ({ ...prev, channel: prev.channel === 'ch1' ? 'ch2' : 'ch1' }));
    }
  };
  const scopePanelButtons = [
    { label: 'Aquisição', action: 'acquire' },
    { label: 'Exibição', action: 'display' },
    { label: 'Medição', action: 'measure' },
    { label: 'Cursores', action: 'cursor' },
    { label: 'Utilidades', action: 'utility' },
    { label: 'Salvar', action: 'save' },
    { label: 'Autoajuste', action: 'auto' },
    { label: 'Menu', action: 'menu' }
  ];

  return (
    <div className="flex flex-col w-full h-full overflow-hidden text-slate-800 dark:text-slate-200 transition-colors duration-200 select-none">
      
      {hasBurnedComponents && (
        <div className="bg-red-600 text-white px-4 py-2 text-sm font-bold flex items-center justify-center space-x-2 shadow-md z-50 animate-pulse">
          <AlertTriangle size={18} className="text-yellow-300" />
          <span>Atenção: Simulação encontrou falhas críticas! {burnedComponents[0].simulationState?.burnMessage} ({burnedComponents.length} componente(s) danificados)</span>
        </div>
      )}

      {/* 4.1 Barra Superior (Header Sleek, Compacto e Sem Cortes) */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 z-10 gap-3 h-14 overflow-hidden">
        {/* Esquerda: Logo + Nome do Projeto + Botão Projetos + Salvar */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-black text-base shadow-md shadow-indigo-500/20 shrink-0">
            E
          </div>

          <input
            type="text"
            value={project.name}
            onChange={(e) => setProjectName(e.target.value)}
            className="font-extrabold text-xs sm:text-sm bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-indigo-500 focus:outline-none px-1 transition-colors dark:text-slate-100 w-32 sm:w-44 md:w-52 truncate shrink-0"
            title="Clique para renomear"
          />

          {/* Central de Projetos */}
          <button
            onClick={() => setShowProjectsHub(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs transition-all shadow-md shadow-indigo-500/20 active:scale-95 shrink-0"
            title="Abrir Central de Projetos"
          >
            <FolderOpen size={14} />
            <span>Projetos</span>
          </button>

          {/* Salvar */}
          <button
            onClick={handleSaveProject}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all shrink-0"
            title="Salvar Projeto (Ctrl+S)"
          >
            <Save size={15} />
          </button>
        </div>

        {/* Centro: Ferramentas (Cursor, Fio, Texto) + Visualização (ISIS, 3D) */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {/* Cursor, Fio, Texto */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl p-1 border border-slate-200 dark:border-slate-700/60 shadow-inner">
            <button
              onClick={() => { setActiveTool('select'); setSelectedComponentId(null); setSelectedWireId(null); }}
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTool === 'select'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
              title="Cursor (V)"
            >
              <MousePointer2 size={13} />
              <span>Cursor</span>
            </button>
            <button
              onClick={() => setActiveTool('wire')}
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTool === 'wire'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
              title="Fio (W)"
            >
              <Cable size={13} />
              <span>Fio</span>
            </button>
            <button
              onClick={() => setActiveTool('text')}
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTool === 'text'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
              title="Texto (T)"
            >
              <Type size={13} />
              <span>Texto</span>
            </button>
          </div>

          {/* Visualização (Esquema vs Placa 3D) */}
          <div className="flex items-center bg-indigo-50 dark:bg-slate-950 rounded-xl p-1 border border-indigo-100 dark:border-slate-800 shadow-inner">
            <button
              onClick={() => setViewMode('schematic')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'schematic'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold border border-slate-200/50 dark:border-slate-800/50'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Esquema (ISIS)
            </button>
            <button
              onClick={() => setViewMode('pcb3d')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'pcb3d'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold border border-slate-200/50 dark:border-slate-800/50'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Placa 3D
            </button>
          </div>
        </div>

        {/* Direita: Simular + IA + Admin + Ações de Usuário */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Botão Principal de Simulação */}
          <button
            onClick={() => {
              if (isSimulating) {
                setIsSimulating(false);
                useStore.getState().clearSimulationState();
              } else {
                const hasScope = components.some(c => c.type === 'oscilloscope');
                if (hasScope) {
                  openOscilloscopeWindow();
                }
                const hasFgen = components.find(c => c.type === 'function_generator');
                if (hasFgen) {
                  setFgenComponentId(hasFgen.id);
                  setFgenWindowOpen(true);
                  setFgenWindowMinimized(false);
                }
                setIsSimulating(true);
              }
            }}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-white font-extrabold text-xs transition-all shadow-md active:scale-95 ${
              isSimulating
                ? 'bg-red-600 hover:bg-red-700 glow-effect-red'
                : 'bg-emerald-600 hover:bg-emerald-500 glow-effect-green'
            }`}
            title={isSimulating ? 'Parar Simulação' : 'Iniciar Simulação'}
          >
            {isSimulating ? (
              <>
                <Pause size={12} fill="white" />
                <span>Parar</span>
              </>
            ) : (
              <>
                <Play size={12} fill="white" />
                <span>Simular</span>
              </>
            )}
          </button>

          {/* IA Copiloto */}
          <button
            onClick={() => setShowAiPanel(prev => !prev)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-500/20 text-xs transition-all"
            title="Assistente de Inteligência Artificial"
          >
            <Bot size={14} className="text-indigo-500 dark:text-indigo-400" />
            <span className="hidden lg:inline">IA</span>
            <Sparkles size={11} className="text-amber-400 animate-pulse" />
          </button>

          {/* Painel Admin */}
          {authSession.role === 'admin' && (
            <button
              onClick={() => setShowAdminModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all shadow-sm"
              title="Painel Administrativo"
            >
              <ShieldCheck size={14} className="text-amber-500 dark:text-amber-400" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

          {/* Alternar Tema */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-amber-400 transition-all"
            title="Alternar Tema Claro/Escuro"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Atalhos / Ajuda */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title="Ajuda e Atalhos"
          >
            <HelpCircle size={16} />
          </button>

          {/* Sair */}
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Container Principal (Corpo do Editor) */}
      <div className="flex flex-1 flex-row min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">

        {/* 4.2 Barra Lateral Esquerda: Biblioteca de Componentes */}
        <aside
          className={`flex flex-col border-r bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-all duration-300 ${
            collapsedPanels.left ? 'w-12' : 'w-72'
          } shrink-0`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
            {!collapsedPanels.left && (
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {viewMode === 'schematic' ? 'Biblioteca' : 'Configurações PCB'}
              </span>
            )}
            <button
              onClick={() => setCollapsedPanels({ ...collapsedPanels, left: !collapsedPanels.left })}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 ml-auto cursor-pointer"
            >
              {collapsedPanels.left ? <ChevronRight size={14} /> : <ChevronDown size={14} className="rotate-90" />}
            </button>
          </div>

          {!collapsedPanels.left && (
            viewMode === 'schematic' ? (
              <>
                {/* Object Selector (estilo Proteus) */}
                <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
                  <div className="flex items-center px-2 py-1.5 bg-slate-200 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                    <button
                      onClick={() => setShowPickDevicesModal(true)}
                      className="flex items-center justify-center w-6 h-6 mr-1 bg-white dark:bg-slate-700 border border-slate-400 dark:border-slate-500 rounded text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 shadow-sm"
                      title="Pick Devices (P)"
                    >
                      P
                    </button>
                    <button
                      className="flex items-center justify-center w-6 h-6 mr-2 bg-white dark:bg-slate-700 border border-slate-400 dark:border-slate-500 rounded text-xs font-bold text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-sm"
                      title="Library Manager (L)"
                    >
                      L
                    </button>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tracking-wide">DEVICES</span>
                  </div>

                  {/* Lista de Dispositivos do Projeto */}
                  <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                    {projectDevices.length === 0 ? (
                      <div className="p-3 text-center text-[10px] text-slate-400">
                        Nenhum componente selecionado.<br/>Clique em <b>P</b> para escolher peças.
                      </div>
                    ) : (
                      projectDevices.map(type => {
                        const compDef = componentLibrary.find(c => c.type === type);
                        if (!compDef) return null;
                        
                        return (
                          <div
                            key={type}
                            onClick={() => setActiveTool(type)}
                            className={`group flex items-center justify-between px-2 py-1.5 border rounded cursor-pointer transition-all ${
                              activeTool === type
                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span className="text-[11px] font-bold uppercase truncate pr-2">{compDef.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeProjectDevice(type);
                                if (activeTool === type) setActiveTool('select');
                              }}
                              className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                activeTool === type ? 'hover:bg-indigo-500 text-indigo-100' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400'
                              }`}
                              title="Remover da lista"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-5 text-slate-800 dark:text-slate-200 text-left">
                {/* Tamanho da Placa */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider">Dimensões da Placa</h4>
                  
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Largura da Placa</label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="50"
                        max="500"
                        value={boardDimensions.width * 10}
                        onChange={(e) => {
                          const val = Math.max(50, Math.min(500, parseInt(e.target.value) || 50));
                          setBoardDimensions({ ...boardDimensions, width: val / 10 });
                        }}
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      />
                      <span className="text-xs font-bold text-slate-500">mm</span>
                    </div>
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Altura da Placa</label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="50"
                        max="500"
                        value={boardDimensions.height * 10}
                        onChange={(e) => {
                          const val = Math.max(50, Math.min(500, parseInt(e.target.value) || 50));
                          setBoardDimensions({ ...boardDimensions, height: val / 10 });
                        }}
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      />
                      <span className="text-xs font-bold text-slate-500">mm</span>
                    </div>
                  </div>
                </div>

                {/* Resumo da Placa */}
                <hr className="border-slate-200 dark:border-slate-800" />
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider">Especificações</h4>
                  <div className="text-xs font-mono space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Área da Placa:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{(boardDimensions.width * boardDimensions.height).toFixed(1)} cm²</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Componentes:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{components.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Conexões Físicas:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{wires.length}</span>
                    </div>
                  </div>
                </div>

                {/* DRC (Design Rule Checker) */}
                <hr className="border-slate-200 dark:border-slate-800" />
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider">Verificação DRC</h4>
                  {(() => {
                    let isOutside = false;
                    if (components.length > 0) {
                      const allX = components.map(item => item.x);
                      const allY = components.map(item => item.y);
                      const minX = Math.min(...allX);
                      const maxX = Math.max(...allX);
                      const minY = Math.min(...allY);
                      const maxY = Math.max(...allY);
                      const centerX = minX + (maxX - minX) / 2;
                      const centerY = minY + (maxY - minY) / 2;

                      isOutside = components.some(c => 
                        Math.abs(c.x - centerX) > boardDimensions.width / 2 ||
                        Math.abs(c.y - centerY) > boardDimensions.height / 2
                      );
                    }

                    return isOutside ? (
                      <div className="p-2.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg text-[10px] text-red-650 dark:text-red-400 leading-normal font-sans">
                        ⚠️ <strong>Limites ultrapassados!</strong> Alguns componentes estão fora da área física da placa de circuito impresso. Aumente o tamanho da placa.
                      </div>
                    ) : (
                      <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg text-[10px] text-emerald-650 dark:text-emerald-400 leading-normal font-sans">
                        ✅ <strong>Placa OK!</strong> Todos os componentes do circuito estão perfeitamente contidos dentro das dimensões da PCB.
                      </div>
                    );
                  })()}
                </div>
              </div>
            )
          )}
        </aside>

        {/* 4.3 Área Central: Canvas de Edição Real */}
        <main className="flex-1 flex flex-col relative min-w-0 min-h-0 overflow-hidden">
          
          <div className="flex-1 min-h-0 relative bg-slate-50 dark:bg-slate-950">
            {viewMode === 'schematic' ? (
              <CircuitCanvas />
            ) : (
              <Pcb3dViewer boardColor={boardColor} setBoardColor={setBoardColor} boardDimensions={boardDimensions} />
            )}
          </div>
        </main>
          {oscWindowOpen && (
            <div
              onMouseDown={() => setTopWindow('osc')}
              style={{
                left: oscWindowPosition.x,
                top: oscWindowPosition.y,
                zIndex: topWindow === 'osc' ? 99999 : 99990,
                ...(oscWindowMinimized
                  ? {
                      width: 'min(360px, calc(100vw - 16px))',
                      height: '42px',
                      minHeight: '42px',
                      maxHeight: '42px',
                      resize: 'none',
                      overflow: 'hidden'
                    }
                  : {
                      width: 'min(920px, calc(100vw - 16px))',
                      height: 'min(620px, calc(100vh - 16px))',
                      maxWidth: 'calc(100vw - 16px)',
                      maxHeight: 'calc(100vh - 16px)',
                      resize: 'both',
                      overflow: 'hidden',
                      minWidth: '320px',
                      minHeight: '320px'
                    }
                )
              }}
              className={`fixed bg-[#d8d8d0] border border-[#b8b8ad] rounded-lg shadow-2xl flex flex-col ${
                oscWindowMinimized ? 'h-[42px] overflow-hidden' : ''
              }`}
            >
              {/* Header da janela */}
              <div
                onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
                  setOscDragOffset({
                    x: event.clientX - oscWindowPosition.x,
                    y: event.clientY - oscWindowPosition.y
                  });
                }}
                className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-[#bdbdb3] cursor-move bg-[#eeeeea] shrink-0"
              >
                <div className="flex min-w-0 items-center space-x-2 text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-700">
                  <TrendingUp size={14} className="text-red-500" />
                  <span className="truncate">Osciloscópio Digital 2 Canais 50MHz</span>
                  <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 border border-cyan-300 rounded-sm">DSO</span>
                  {isSimulating && !oscWindowMinimized && (
                    <span className="text-[10px] text-slate-500 normal-case font-mono font-normal">
                      {oscPoints.length} amostras
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
                  <button
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => setOscCaptureRunning(prev => !prev)}
                    className={`px-2 py-1 rounded text-[10px] font-black ${
                      oscCaptureRunning
                        ? 'bg-emerald-100 border border-emerald-400 text-emerald-700'
                        : 'bg-amber-100 border border-amber-400 text-amber-700'
                    }`}
                    title={oscCaptureRunning ? 'Parar captura' : 'Iniciar captura'}
                  >
                    {oscCaptureRunning ? 'STOP' : 'START'}
                  </button>
                  <button
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => setOscWindowMinimized(prev => !prev)}
                    className="p-0.5 rounded text-slate-500 hover:bg-slate-200"
                    title={oscWindowMinimized ? 'Restaurar Osciloscópio' : 'Minimizar Osciloscópio'}
                  >
                    {oscWindowMinimized ? <Maximize size={14} /> : <Minus size={14} />}
                  </button>
                <button
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setOscWindowOpen(false);
                    setOscWindowMinimized(false);
                  }}
                  className="p-0.5 rounded text-slate-500 hover:bg-slate-200"
                  title="Fechar Osciloscópio"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {!oscWindowMinimized && (
              <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-3 p-2 sm:p-3 min-h-0 bg-[#d8d8d0] overflow-y-auto overflow-x-hidden">
                {/* Gráfico do Sinal */}
                <div className="flex-1 bg-[#ecece6] border border-[#b7b7ad] rounded-md p-2 flex flex-col relative min-h-[240px] lg:min-h-0 shadow-inner">
                  <div className="w-full h-full flex flex-col">
                    <div className="flex justify-between items-center text-[10px] text-slate-600 font-mono mb-1">
                      <div className="flex items-center space-x-3">
                        {(['ch1', 'ch2'] as OscChannelKey[]).map((channelKey) => {
                          const channel = oscChannels[channelKey];
                          const unit = getOscSignalUnit(channel.signal);
                          return (
                            <div key={channelKey} className={`flex items-center space-x-1.5 ${channel.enabled ? '' : 'opacity-40'}`}>
                              <span
                                className="inline-block w-3 h-0.5"
                                style={{ backgroundColor: getOscChannelColor(channelKey) }}
                              />
                              <span className="font-bold">{getOscChannelName(channelKey)}:</span>
                              <span>{formatValue(channel.scale, unit)}/div</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-500">SEC/DIV: {formatValue(oscTimeWindow / 10, 's')}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            oscTrigger.enabled && oscLockedTriggerTime !== null
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                              : oscTrigger.enabled && oscTriggerTime !== null
                                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                              : 'bg-slate-200 text-slate-500 border border-slate-300'
                          }`}
                        >
                          {oscTrigger.enabled && oscLockedTriggerTime !== null
                            ? 'TRIG'
                            : oscTrigger.enabled && oscTriggerTime !== null
                              ? 'ARM'
                              : 'AUTO'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex-1 relative border-4 border-[#4a4f52] rounded overflow-hidden bg-slate-950">
                      <svg className="w-full h-full osc-svg-display" viewBox="0 0 500 180" preserveAspectRatio="none">
                        {[1, 2, 3, 4, 5, 6, 7].map((line) => (
                          <line
                            key={`h-${line}`}
                            x1="0"
                            y1={line * 22.5}
                            x2="500"
                            y2={line * 22.5}
                            stroke={line === 4 ? '#475569' : '#1e293b'}
                            strokeWidth={line === 4 ? '0.8' : '0.5'}
                            strokeDasharray="3"
                          />
                        ))}
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((line) => (
                          <line
                            key={`v-${line}`}
                            x1={line * 50}
                            y1="0"
                            x2={line * 50}
                            y2="180"
                            stroke={line === 5 ? '#475569' : '#1e293b'}
                            strokeWidth={line === 5 ? '0.8' : '0.5'}
                            strokeDasharray="3"
                          />
                        ))}

                        {oscTrigger.enabled && (
                          <>
                            <line
                              x1="0"
                              y1={getOscY(oscTrigger.channel, oscTrigger.level)}
                              x2="500"
                              y2={getOscY(oscTrigger.channel, oscTrigger.level)}
                              stroke={getOscChannelColor(oscTrigger.channel)}
                              strokeWidth="1"
                              strokeDasharray="5 4"
                              opacity="0.75"
                            />
                            <g transform={`translate(6, ${Math.max(16, Math.min(168, getOscY(oscTrigger.channel, oscTrigger.level) + 12))})`}>
                              <rect
                                x="-2"
                                y="-10"
                                width="56"
                                height="13"
                                fill="#0f172a"
                                opacity="0.85"
                                rx="2"
                              />
                              <text
                                x="0"
                                y="0"
                                fill={getOscChannelColor(oscTrigger.channel)}
                                fontSize="9"
                                fontWeight="bold"
                                fontFamily="monospace"
                              >
                                TRIG {getOscChannelName(oscTrigger.channel)}
                              </text>
                            </g>
                          </>
                        )}
                        
                        {(['ch1', 'ch2'] as OscChannelKey[]).map((channelKey) => (
                          oscChannels[channelKey].enabled && (
                            <path
                              key={channelKey}
                              d={renderOscPath(oscPoints, channelKey)}
                              fill="none"
                              stroke={getOscChannelColor(channelKey)}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              vectorEffect="non-scaling-stroke"
                            />
                          )
                        ))}

                        {/* Cursores */}
                        {oscCursorsEnabled && (() => {
                          const x1Px = oscCursorX1 * 500;
                          const x2Px = oscCursorX2 * 500;
                          const ch1Name = oscCursor1Channel.toUpperCase();
                          const ch2Name = oscCursor2Channel.toUpperCase();
                          const unit1 = getOscSignalUnit(oscChannels[oscCursor1Channel].signal);
                          const unit2 = getOscSignalUnit(oscChannels[oscCursor2Channel].signal);
                          const v1 = getOscCursorValue(oscCursorX1, oscCursor1Channel);
                          const v2 = getOscCursorValue(oscCursorX2, oscCursor2Channel);
                          const t1 = oscCursorX1 * oscTimeWindow;
                          const t2 = oscCursorX2 * oscTimeWindow;
                          const dt = Math.abs(t2 - t1);
                          const sameChannel = oscCursor1Channel === oscCursor2Channel;
                          const dv = (v1 !== null && v2 !== null && sameChannel) ? Math.abs(v2 - v1) : null;
                          const freq = dt > 0 ? 1 / dt : 0;

                          const colorC1 = oscCursor1Channel === 'ch1' ? '#f59e0b' : '#10b981';
                          const colorC2 = oscCursor2Channel === 'ch1' ? '#f59e0b' : '#10b981';

                          return (
                            <>
                              {/* Cursor 1 */}
                              <line x1={x1Px} y1="0" x2={x1Px} y2="180" stroke={colorC1} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.95" style={{ cursor: 'ew-resize' }} />
                              <rect x={x1Px - 5} y="0" width="10" height="180" fill="transparent" style={{ cursor: 'ew-resize' }}
                                onMouseDown={(e) => { e.stopPropagation(); setOscCursorDrag({ cursor: 'x1', startMouseX: e.clientX, startFrac: oscCursorX1 }); }} />
                              <g transform={`translate(${x1Px}, 12)`} className="cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setOscCursor1Channel(c => c === 'ch1' ? 'ch2' : 'ch1'); }}>
                                <rect x="-20" y="-9" width="40" height="14" fill={oscCursor1Channel === 'ch1' ? '#d97706' : '#059669'} rx="3" opacity="0.95" />
                                <text x="0" y="1" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">C1:{ch1Name}</text>
                              </g>

                              {/* Cursor 2 */}
                              <line x1={x2Px} y1="0" x2={x2Px} y2="180" stroke={colorC2} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.95" style={{ cursor: 'ew-resize' }} />
                              <rect x={x2Px - 5} y="0" width="10" height="180" fill="transparent" style={{ cursor: 'ew-resize' }}
                                onMouseDown={(e) => { e.stopPropagation(); setOscCursorDrag({ cursor: 'x2', startMouseX: e.clientX, startFrac: oscCursorX2 }); }} />
                              <g transform={`translate(${x2Px}, 12)`} className="cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setOscCursor2Channel(c => c === 'ch1' ? 'ch2' : 'ch1'); }}>
                                <rect x="-20" y="-9" width="40" height="14" fill={oscCursor2Channel === 'ch1' ? '#d97706' : '#059669'} rx="3" opacity="0.95" />
                                <text x="0" y="1" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">C2:{ch2Name}</text>
                              </g>

                              {/* Painel de leitura ΔV / Δt */}
                              <g transform="translate(8, 168)">
                                <rect x="-4" y="-10" width="370" height="14" fill="#0f172a" opacity="0.95" rx="2" />
                                <text x="0" y="1" fill="#38bdf8" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
                                  {`C1(${ch1Name})=${v1 !== null ? formatValue(v1, unit1) : '--'}  C2(${ch2Name})=${v2 !== null ? formatValue(v2, unit2) : '--'}  Δt=${formatValue(dt, 's')} (${formatValue(freq, 'Hz')})${dv !== null ? '  ΔV=' + formatValue(dv, unit1) : ''}`}
                                </text>
                              </g>

                              {/* Marcadores de tensão nos cursores */}
                              {v1 !== null && (
                                <circle cx={x1Px} cy={getOscY(oscCursor1Channel, v1)} r="3.5" fill={colorC1} stroke="#0f172a" strokeWidth="1" />
                              )}
                              {v2 !== null && (
                                <circle cx={x2Px} cy={getOscY(oscCursor2Channel, v2)} r="3.5" fill={colorC2} stroke="#0f172a" strokeWidth="1" />
                              )}
                            </>
                          );
                        })()}
                      </svg>
                      
                      {oscPoints.length < 2 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                          <TrendingUp size={24} className="text-slate-700 mb-1" />
                          <h4 className="text-xs font-bold text-slate-500">Sem sinal</h4>
                        </div>
                      )}
                      <div className="absolute right-1 top-1 bottom-1 w-[74px] bg-[#d8e4c9]/95 border-l border-[#a9b49b] flex flex-col justify-around p-1 text-[8px] font-bold text-slate-700">
                        {scopeSoftButtons.map((button) => {
                          const active = button.measurement ? oscVisibleMeasurements.includes(button.measurement) : false;
                          return (
                            <button
                              key={`screen-${button.label}`}
                              onClick={button.action}
                              className={`h-7 rounded-sm border text-[8px] font-black shadow-sm active:translate-y-px ${
                                active
                                  ? 'bg-[#f5e36b] border-[#c5b84f] text-slate-800'
                                  : 'bg-[#f2f2e9] border-[#b9b9ac] text-slate-600'
                              }`}
                            >
                              {button.menu}
                            </button>
                          );
                        })}
                      </div>
                      <div className="absolute left-2 top-2 w-36 space-y-1 rounded-sm bg-slate-950/75 p-1.5 font-mono text-[9px]">
                        {(['ch1', 'ch2'] as OscChannelKey[]).map((channelKey) => {
                          const channel = oscChannels[channelKey];
                          const unit = getOscSignalUnit(channel.signal);
                          const stats = oscDisplayStats[channelKey] ?? getOscStats(channelKey);

                          if (!channel.enabled) return null;

                          return (
                            <div key={channelKey} className="space-y-0.5">
                              <div
                                className="font-black"
                                style={{ color: getOscChannelColor(channelKey) }}
                              >
                                {getOscChannelName(channelKey)}
                              </div>
                              {OSC_MEASUREMENT_OPTIONS
                                .filter(option => oscVisibleMeasurements.includes(option.key))
                                .map(option => (
                                  <div key={`${channelKey}-${option.key}`} className="flex justify-between text-slate-200">
                                    <span>{option.label}</span>
                                    <span>{getOscMeasurementValue(stats, option.key, unit)}</span>
                                  </div>
                                ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

	                <div className="w-full lg:w-10 flex flex-row lg:flex-col justify-center gap-2 lg:gap-0 lg:space-y-2">
	                  {scopeSoftButtons.map((button) => (
	                    <button
	                      key={button.label}
	                      onClick={button.action}
	                      className={`h-9 rounded-md border text-[10px] font-black shadow-[0_3px_0_#7d827d] active:translate-y-px active:shadow-none ${
                          button.measurement && oscVisibleMeasurements.includes(button.measurement)
                            ? 'border-[#a8972f] bg-[linear-gradient(#fff29d,#d5c44f)] text-slate-800'
                            : 'border-[#8b8f8b] bg-[linear-gradient(#e5e7e2,#aaaFA9)] text-slate-700'
                        }`}
	                      title={`${button.label}: ${button.menu}`}
	                    >
	                      {button.label}
	                    </button>
	                  ))}
	                </div>

                {/* Controles do Osciloscópio */}
                <div className="w-full lg:w-[350px] bg-[#d4d4cc] border border-[#b3b3a8] rounded-md p-2 flex flex-col space-y-2 shrink-0 overflow-visible lg:overflow-y-auto lg:overflow-x-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Painel de Osciloscópio</span>
                    <button
                      onClick={clearOscilloscopeCapture}
                      className="text-[10px] px-2 py-1 rounded-sm bg-[#eeeeea] border border-[#aaa] text-slate-700 shadow-sm active:translate-y-px"
                    >
                      Limpar
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {scopePanelButtons.map((button) => (
                      <button
                        key={button.label}
                        onClick={() => handleScopePanelAction(button.action)}
                        className={`${scopeButtonClass} ${button.action === 'cursor' && oscCursorsEnabled ? 'bg-amber-400 border-amber-500 text-amber-950 font-black' : ''}`}
                      title={button.label}
                    >
                      {button.label}
                    </button>
                    ))}
                  </div>

                  {/* Seleção de canal dos cursores */}
                  <div className="bg-[#e7e7df] p-2 rounded-md border border-[#aaa] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8.5px] font-black uppercase text-slate-600">Cursor 1 / C1</span>
                      <div className="flex gap-1">
                        {(['ch1', 'ch2'] as OscChannelKey[]).map(ch => (
                          <button
                            key={`c1-${ch}`}
                            onClick={() => { setOscCursorsEnabled(true); setOscCursor1Channel(ch); }}
                            className={`px-2 py-0.5 rounded text-[8px] font-black transition-all ${
                              oscCursorsEnabled && oscCursor1Channel === ch
                                ? ch === 'ch1' ? 'bg-amber-400 text-amber-950 border border-amber-500 shadow-sm' : 'bg-emerald-500 text-white border border-emerald-600 shadow-sm'
                                : 'bg-[#eeeeea] text-slate-600 border border-[#aaa]'
                            }`}
                          >
                            {ch.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8.5px] font-black uppercase text-slate-600">Cursor 2 / C2</span>
                      <div className="flex gap-1">
                        {(['ch1', 'ch2'] as OscChannelKey[]).map(ch => (
                          <button
                            key={`c2-${ch}`}
                            onClick={() => { setOscCursorsEnabled(true); setOscCursor2Channel(ch); }}
                            className={`px-2 py-0.5 rounded text-[8px] font-black transition-all ${
                              oscCursorsEnabled && oscCursor2Channel === ch
                                ? ch === 'ch1' ? 'bg-amber-400 text-amber-950 border border-amber-500 shadow-sm' : 'bg-emerald-500 text-white border border-emerald-600 shadow-sm'
                                : 'bg-[#eeeeea] text-slate-600 border border-[#aaa]'
                            }`}
                          >
                            {ch.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-md border border-[#aaa] bg-[#e7e7df] p-2">
                    {/* Painel VERTICAL */}
                    <div className="space-y-1 text-center flex flex-col justify-between">
                      <div className="text-[9px] font-black uppercase text-slate-600">Vertical</div>
                      <div className="grid grid-cols-2 gap-1">
                        {(['ch1', 'ch2'] as OscChannelKey[]).map((channelKey) => (
                          <button
                            key={`${channelKey}-enable`}
                            className={`${scopeButtonClass} ${
                              oscChannels[channelKey].enabled ? '' : 'opacity-55'
                            }`}
                            onClick={() => updateOscChannel(channelKey, { enabled: !oscChannels[channelKey].enabled })}
                          >
                            {getOscChannelName(channelKey)}
                          </button>
                        ))}
                      </div>

                      {/* Botões/Knobs de V/DIV (Escala) */}
                      <div className="text-[7.5px] font-black uppercase text-slate-500 mt-0.5">Scale (V/Div)</div>
                      <div className="grid grid-cols-2 gap-1">
                        {(['ch1', 'ch2'] as OscChannelKey[]).map((channelKey) => (
                          <div key={`${channelKey}-scale`} className="space-y-0.5 flex flex-col items-center">
                            <div className="flex justify-center">
                              <button
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  setOscKnobDrag({
                                    type: 'vertical-scale',
                                    channelKey,
                                    startX: event.clientX,
                                    startY: event.clientY,
                                    startValue: oscChannels[channelKey].scale
                                  });
                                }}
                                className="relative h-10 w-10 rounded-full border border-[#85857c] bg-[radial-gradient(circle_at_35%_30%,#ffffff,#d7d7cf_45%,#9c9c93)] shadow-[inset_-5px_-5px_10px_rgba(0,0,0,0.25),inset_4px_4px_8px_rgba(255,255,255,0.9),0_2px_2px_rgba(0,0,0,0.25)]"
                                title={`Arraste para ajustar Escala (Volts/Div ou Amps/Div) do ${getOscChannelName(channelKey)}`}
                              >
                                <span
                                  className="absolute inset-0 rounded-full transition-transform duration-75"
                                  style={{ transform: `rotate(${getScaleKnobRotation(oscChannels[channelKey].scale)}deg)` }}
                                >
                                  <span
                                    className="absolute left-1/2 top-1 h-4 w-1 -translate-x-1/2 rounded-full"
                                    style={{ backgroundColor: getOscChannelColor(channelKey) }}
                                  />
                                </span>
                              </button>
                            </div>
                            <div className="font-mono text-[7.5px] text-slate-600 truncate text-center">
                              {formatValue(oscChannels[channelKey].scale, getOscSignalUnit(oscChannels[channelKey].signal))}/div
                            </div>
                            {/* Botões individuais de Zoom Vertical por Canal */}
                            <div className="flex gap-1 justify-center w-full pt-0.5">
                              <button
                                onClick={() => updateOscChannel(channelKey, { scale: Math.max(1e-6, oscChannels[channelKey].scale * 0.7) })}
                                className="flex-1 py-0.5 rounded bg-[#eeeeea] border border-[#aaa] text-[8px] font-black hover:bg-slate-200 text-slate-700 active:translate-y-px"
                                title={`Zoom + Vertical (${getOscChannelName(channelKey)})`}
                              >
                                +
                              </button>
                              <button
                                onClick={() => updateOscChannel(channelKey, { scale: oscChannels[channelKey].scale * 1.4 })}
                                className="flex-1 py-0.5 rounded bg-[#eeeeea] border border-[#aaa] text-[8px] font-black hover:bg-slate-200 text-slate-700 active:translate-y-px"
                                title={`Zoom - Vertical (${getOscChannelName(channelKey)})`}
                              >
                                -
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Botões/Knobs de POSITION (Offset) */}
                      <div className="text-[7.5px] font-black uppercase text-slate-500 mt-0.5">Position</div>
                      <div className="grid grid-cols-2 gap-1">
                        {(['ch1', 'ch2'] as OscChannelKey[]).map((channelKey) => (
                          <div key={`${channelKey}-position`} className="space-y-0.5">
                            <div className="flex justify-center">
                              <button
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  setOscKnobDrag({
                                    type: 'vertical-offset',
                                    channelKey,
                                    startX: event.clientX,
                                    startY: event.clientY,
                                    startValue: oscChannels[channelKey].offset
                                  });
                                }}
                                className="relative h-10 w-10 rounded-full border border-[#85857c] bg-[radial-gradient(circle_at_35%_30%,#ffffff,#d7d7cf_45%,#9c9c93)] shadow-[inset_-5px_-5px_10px_rgba(0,0,0,0.25),inset_4px_4px_8px_rgba(255,255,255,0.9),0_2px_2px_rgba(0,0,0,0.25)]"
                                title={`Arraste para ajustar posição vertical (Offset) do ${getOscChannelName(channelKey)}`}
                              >
                                <span
                                  className="absolute inset-0 rounded-full transition-transform duration-75"
                                  style={{ transform: `rotate(${getOffsetKnobRotation(oscChannels[channelKey].offset, oscChannels[channelKey].scale)}deg)` }}
                                >
                                  <span
                                    className="absolute left-1/2 top-1 h-4 w-1 -translate-x-1/2 rounded-full"
                                    style={{ backgroundColor: getOscChannelColor(channelKey) }}
                                  />
                                </span>
                              </button>
                            </div>
                            <div className="font-mono text-[7.5px] text-slate-600 truncate">
                              {formatValue(oscChannels[channelKey].offset, getOscSignalUnit(oscChannels[channelKey].signal))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-1 mt-0.5">
                        <button
                          className={scopeButtonClass}
                          onClick={() => updateOscChannel('ch1', { offset: 0 })}
                          title="Centralizar o traço e zerar o offset vertical do CH1"
                        >
                          CENTRAR CH1
                        </button>
                        <button
                          className={scopeButtonClass}
                          onClick={() => updateOscChannel('ch2', { offset: 0 })}
                          title="Centralizar o traço e zerar o offset vertical do CH2"
                        >
                          CENTRAR CH2
                        </button>
                      </div>
                    </div>

	                    {/* Painel HORIZONTAL COMUM */}
	                    <div className="space-y-1 text-center border-x border-[#bbb] px-2 flex flex-col justify-between">
	                      <div className="text-[9px] font-black uppercase text-slate-600">Base de Tempo</div>
	                      <div className="text-[7px] font-black uppercase text-slate-500 leading-tight">
	                        Compartilhada pelos 2 canais
	                      </div>
	                      <div className="grid grid-cols-2 gap-1">
	                        <button
	                          className={scopeButtonClass}
	                          onClick={() => setOscTimeWindow(prev => Math.max(0.0001, prev * 0.7))}
	                          title="Zoom In da base de tempo compartilhada (reduz janela de tempo)"
	                        >
	                          Zoom +
	                        </button>
	                        <button
	                          className={scopeButtonClass}
	                          onClick={() => setOscTimeWindow(prev => Math.min(5.0, prev * 1.4))}
	                          title="Zoom Out da base de tempo compartilhada (aumenta janela de tempo)"
	                        >
	                          Zoom -
	                        </button>
	                      </div>
                      <div className="flex justify-center my-0.5">
                        <button
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            setOscKnobDrag({
                              type: 'horizontal',
                              startX: event.clientX,
                              startY: event.clientY,
                              startValue: oscTimeWindow
                            });
                          }}
	                          className="relative h-12 w-12 rounded-full border border-[#85857c] bg-[radial-gradient(circle_at_35%_30%,#ffffff,#d7d7cf_45%,#9c9c93)] shadow-[inset_-5px_-5px_10px_rgba(0,0,0,0.25),inset_4px_4px_8px_rgba(255,255,255,0.9),0_2px_2px_rgba(0,0,0,0.25)]"
	                          title="Arraste para ajustar a base de tempo compartilhada (Sec/div)"
	                        >
                          <span
                            className="absolute inset-0 rounded-full transition-transform duration-75"
                            style={{ transform: `rotate(${getTimeKnobRotation(oscTimeWindow)}deg)` }}
                          >
                            <span className="absolute left-1/2 top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-slate-600" />
                          </span>
                        </button>
                      </div>
                      <div className="text-[7.5px] font-black uppercase text-slate-500">Sec/div</div>
                      <div className="font-mono text-[8px] text-slate-600 font-bold">
                        {formatValue(oscTimeWindow / 10, 's')}/div
                      </div>
                      <button
                        className={scopeButtonClass}
                        onClick={() => setOscTimeWindow(0.02)}
                      >
                        Reset
                      </button>
                    </div>

                    {/* Painel de disparo */}
                    <div className="space-y-1 text-center flex flex-col justify-between">
                      <div className="text-[9px] font-black uppercase text-slate-600">Disparo</div>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          className={scopeButtonClass}
                          onClick={() => {
                            setOscTrigger(prev => {
                              const nextCh: OscChannelKey = prev.channel === 'ch1' ? 'ch2' : 'ch1';
                              const targetOffset = oscChannels[nextCh]?.offset ?? 0;
                              return { ...prev, channel: nextCh, level: targetOffset };
                            });
                          }}
                          title="Selecionar canal de disparo (CH1 / CH2)"
                        >
                          {getOscChannelName(oscTrigger.channel)}
                        </button>
                        <button
                          className={scopeButtonClass}
                          onClick={() => setOscTrigger(prev => ({ ...prev, edge: prev.edge === 'rising' ? 'falling' : 'rising' }))}
                          title="Alternar borda de disparo (Subida / Descida)"
                        >
                          {oscTrigger.edge === 'rising' ? 'Borda ↑' : 'Borda ↓'}
                        </button>
                      </div>
                      <div className="flex justify-center my-0.5">
                        <button
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            setOscKnobDrag({
                              type: 'trigger',
                              startX: event.clientX,
                              startY: event.clientY,
                              startValue: oscTrigger.level
                            });
                          }}
                          className="relative h-12 w-12 rounded-full border border-[#85857c] bg-[radial-gradient(circle_at_35%_30%,#ffffff,#d7d7cf_45%,#9c9c93)] shadow-[inset_-5px_-5px_10px_rgba(0,0,0,0.25),inset_4px_4px_8px_rgba(255,255,255,0.9),0_2px_2px_rgba(0,0,0,0.25)]"
                          title={`Arraste para ajustar o nível de disparo do ${getOscChannelName(oscTrigger.channel)}`}
                        >
                          <span
                            className="absolute inset-0 rounded-full transition-transform duration-75"
                            style={{ transform: `rotate(${getTriggerKnobRotation(oscTrigger.level, oscTrigger.channel)}deg)` }}
                          >
                            <span
                              className="absolute left-1/2 top-1 h-5 w-1 -translate-x-1/2 rounded-full"
                              style={{ backgroundColor: getOscChannelColor(oscTrigger.channel) }}
                            />
                          </span>
                        </button>
                      </div>
                      <div className="text-[7.5px] font-black uppercase text-slate-500">Nível</div>
                      <div className="font-mono text-[8px] text-slate-600 font-bold">
                        {formatValue(oscTrigger.level, getOscSignalUnit(oscChannels[oscTrigger.channel].signal))}
                      </div>
                      <button
                        className={scopeButtonClass}
                        onClick={() => {
                          const channelKey = oscTrigger.channel;
                          const stats = oscDisplayStats[channelKey] ?? getOscStats(channelKey);
                          const mid = stats ? (stats.max + stats.min) / 2 : 0;
                          setOscTrigger(prev => ({ ...prev, level: mid }));
                        }}
                        title="Ajustar nível de disparo para 50% da onda"
                      >
                        50%
                      </button>
                    </div>
                  </div>

                  <div className="rounded-md border border-[#aaa] bg-[#e7e7df] p-2 space-y-1.5">
                    <div className="text-[9px] font-black uppercase text-slate-600">Canais</div>
                    {(['ch1', 'ch2'] as OscChannelKey[]).map((channelKey) => {
                      const channel = oscChannels[channelKey];
                      const unit = getOscSignalUnit(channel.signal);

                      return (
                        <div key={channelKey} className="grid grid-cols-[44px_1fr_68px_58px] gap-1.5 items-center">
                          <label className="flex items-center gap-1 text-[10px] font-black">
                            <input
                              type="checkbox"
                              checked={channel.enabled}
                              onChange={(e) => updateOscChannel(channelKey, { enabled: e.target.checked })}
                              className="accent-indigo-600"
                            />
                            <span style={{ color: getOscChannelColor(channelKey) }}>{getOscChannelName(channelKey)}</span>
                          </label>
                          <select
                            value={channel.componentId}
                            onChange={(e) => {
                              updateOscChannel(channelKey, {
                                componentId: e.target.value
                              });
                              oscPendingTriggerTimeRef.current = null;
                              oscLockedTriggerTimeRef.current = null;
                              setOscLockedTriggerTime(null);
                              setOscPoints([]);
                            }}
                            className="min-w-0 text-[10px] bg-[#f5f5ef] border border-[#aaa] rounded-sm px-1.5 py-1 outline-none text-slate-700 font-bold"
                          >
                            <option value="">Entrada {getOscChannelName(channelKey)} (Esquema)</option>
                            {components
                              .filter(c => c.type !== 'oscilloscope')
                              .map(comp => (
                                <option key={comp.id} value={comp.id}>
                                  {comp.name || comp.type} ({comp.type.startsWith('probe_') ? 'Ponta' : comp.type})
                                </option>
                              ))}
                          </select>
                          <select
                            value={channel.signal}
                            onChange={(e) => {
                              updateOscChannel(channelKey, {
                                signal: e.target.value as OscSignal,
                                scale: e.target.value === 'voltage' ? 5 : 0.01,
                                offset: 0
                              });
                              oscPendingTriggerTimeRef.current = null;
                              oscLockedTriggerTimeRef.current = null;
                              setOscLockedTriggerTime(null);
                              setOscPoints([]);
                            }}
                            className="text-[10px] bg-[#f5f5ef] border border-[#aaa] rounded-sm px-1.5 py-1 outline-none text-slate-700"
                          >
                            <option value="voltage">Tensão</option>
                            <option value="current">Corrente</option>
                          </select>
                          <div className="text-right text-[10px] font-mono text-slate-700 font-bold">
                            {formatValue(getOscLiveValue(channelKey), unit)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            </div>
          )}

          {/* Painel Flutuante do Gerador de Funções */}
          {fgenWindowOpen && (() => {
            const fgenComp = components.find(c => c.id === fgenComponentId || c.type === 'function_generator');
            const fgenProps = fgenComp?.properties;

            const fgenSetProp = (key: string, value: string | number) => {
              if (fgenComp) {
                useStore.getState().updateComponentProperty(fgenComp.id, key, value);
                if (key === 'frequency' && typeof value === 'number' && value > 0) {
                  const idealWindow = Math.max(0.00005, Math.min(5.0, 3 / value));
                  setOscTimeWindow(idealWindow);
                } else if (key === 'amplitude' && typeof value === 'number' && value > 0) {
                  const idealScale = Math.max(0.01, Math.min(50, value / 2));
                  setOscChannels(prev => ({
                    ch1: { ...prev.ch1, scale: idealScale },
                    ch2: { ...prev.ch2, scale: idealScale }
                  }));
                }
              }
            };

            const getFgenPropVal = (key: string, fallback: any) => {
              const p = fgenProps?.[key];
              if (p === undefined || p === null) return fallback;
              if (typeof p === 'object' && 'value' in p) return p.value ?? fallback;
              return p;
            };

            const waveform = String(getFgenPropVal('waveform', 'sine')).toLowerCase();
            const frequency = Number(getFgenPropVal('frequency', 1000));
            const amplitude = Number(getFgenPropVal('amplitude', 5));
            const offset = Number(getFgenPropVal('offset', 0));
            const dutyCycle = Number(getFgenPropVal('dutyCycle', 50));

            const fStr = frequency >= 1000000
              ? `${(frequency / 1000000).toFixed(3)}MHz`
              : frequency >= 1000
              ? `${(frequency / 1000).toFixed(3)}kHz`
              : `${frequency.toFixed(0)}Hz`;

            const waveLabels: Record<string, string> = {
              sine: '〰 Senoidal',
              square: '⊓ Quadrada',
              triangle: '◁▷ Triangular',
              sawtooth: '⌇ Dente de Serra'
            };

            const waveIcons: Record<string, React.ReactElement> = {
              sine: (
                <svg width="42" height="18" viewBox="0 0 42 18"><path d="M2 9 C8 2, 13 2, 21 9 C29 16, 34 16, 40 9" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/></svg>
              ),
              square: (
                <svg width="42" height="18" viewBox="0 0 42 18"><path d="M2 14 L2 4 L20 4 L20 14 L38 14 L38 4" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/></svg>
              ),
              triangle: (
                <svg width="42" height="18" viewBox="0 0 42 18"><path d="M2 14 L11 4 L21 14 L31 4 L40 14" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/></svg>
              ),
              sawtooth: (
                <svg width="42" height="18" viewBox="0 0 42 18"><path d="M2 14 L20 4 L20 14 L38 4" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/></svg>
              )
            };

            const buttonBase = 'w-full py-1.5 rounded text-[10px] font-black uppercase tracking-wide shadow-sm border active:translate-y-px transition-colors';
            const btnActive = `${buttonBase} bg-amber-400 border-amber-500 text-amber-900`;
            const btnInactive = `${buttonBase} bg-[#eeeeea] border-[#aaa] text-slate-700 hover:bg-[#e5e5df]`;

            return (
              <div
                onMouseDown={() => setTopWindow('fgen')}
                style={{
                  left: fgenWindowPosition.x,
                  top: fgenWindowPosition.y,
                  zIndex: topWindow === 'fgen' ? 99999 : 99990,
                  ...(fgenWindowMinimized
                    ? { height: '42px', minHeight: '42px', maxHeight: '42px', resize: 'none', overflow: 'hidden' }
                    : { resize: 'both', overflow: 'hidden', minWidth: '280px', minHeight: '280px' }
                  )
                }}
                className={`fixed bg-[#c8c4b8] border border-[#a0a098] rounded-xl shadow-2xl flex flex-col ${
                  fgenWindowMinimized ? 'w-[300px] h-[42px] overflow-hidden' : 'w-[340px]'
                }`}
              >
                {/* Header */}
                <div
                  onMouseDown={(e: ReactMouseEvent<HTMLDivElement>) => {
                    setFgenDragOffset({ x: e.clientX - fgenWindowPosition.x, y: e.clientY - fgenWindowPosition.y });
                  }}
                  className="flex items-center justify-between px-4 py-2 cursor-move bg-[#d8d4c8] border-b border-[#b0aca0]"
                >
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M2 12 C5 6, 7 6, 10 12 C13 18, 15 18, 18 12"/>
                      <rect x="18" y="8" width="4" height="8" rx="1"/>
                    </svg>
                    <span>Gerador de Funções</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-sm font-mono">FG-{fgenComp?.name?.slice(-3).toUpperCase() ?? '---'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onMouseDown={e => e.stopPropagation()} onClick={() => setFgenWindowMinimized(p => !p)}
                      className="p-0.5 rounded text-slate-500 hover:bg-slate-300">
                      {fgenWindowMinimized ? <Maximize size={14}/> : <Minus size={14}/>}
                    </button>
                    <button onMouseDown={e => e.stopPropagation()} onClick={() => { setFgenWindowOpen(false); setFgenWindowMinimized(false); }}
                      className="p-0.5 rounded text-slate-500 hover:bg-slate-300">
                      <X size={14}/>
                    </button>
                  </div>
                </div>

                {!fgenWindowMinimized && (
                  <div className="p-4 flex flex-col gap-3 bg-[#c8c4b8]">
                    {/* Display Principal */}
                    <div className="bg-[#0a1a0a] rounded-lg p-3 border-2 border-[#444] shadow-inner">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="text-[9px] text-green-500/70 font-mono uppercase tracking-widest">Frequência</div>
                          <div className="text-2xl font-black font-mono text-green-400 leading-none tracking-wider">{fStr}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-green-500/70 font-mono uppercase tracking-widest mb-0.5">Forma</div>
                          <div className="text-xs font-black text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-0.5">{waveLabels[waveform]?.split(' ')[1] ?? waveform.toUpperCase()}</div>
                        </div>
                      </div>
                      {/* Preview de Onda */}
                      <div className="flex items-center justify-center py-1">
                        {waveIcons[waveform]}
                      </div>
                      <div className="flex justify-between mt-2">
                        <div>
                          <div className="text-[9px] text-green-500/60 font-mono">Amplitude (Pico)</div>
                          <div className="text-base font-black font-mono text-green-300">{amplitude.toFixed(3)} Vp</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-green-500/60 font-mono">Offset</div>
                          <div className="text-base font-black font-mono text-green-300">{offset.toFixed(3)} V</div>
                        </div>
                      </div>
                      {waveform === 'square' && (
                        <div className="mt-1">
                          <div className="text-[9px] text-green-500/60 font-mono">Duty Cycle</div>
                          <div className="text-base font-black font-mono text-green-300">{dutyCycle.toFixed(1)}%</div>
                        </div>
                      )}
                    </div>

                    {/* Seleção de Forma de Onda */}
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1.5">Forma de Onda</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['sine', 'square', 'triangle', 'sawtooth'] as const).map(w => (
                          <button
                            key={w}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => fgenSetProp('waveform', w)}
                            className={waveform === w ? btnActive : btnInactive}
                            title={waveLabels[w]}
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              {waveIcons[w]}
                              <span className="text-[8px]">{waveLabels[w]?.split(' ')[0]}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Controles Numéricos */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Frequência */}
                      <div className="bg-[#d8d4c8] rounded-lg p-2.5 border border-[#b0aca0]">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">Frequência</div>
                        <div className="flex items-center gap-1 mb-1.5">
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('frequency', Math.max(1, frequency / 10))}
                            className="w-7 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-sm hover:bg-[#e0e0da] active:translate-y-px">÷10</button>
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('frequency', frequency * 10)}
                            className="w-7 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-sm hover:bg-[#e0e0da] active:translate-y-px">×10</button>
                          <div className="flex-1 flex gap-0.5">
                            <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('frequency', Math.max(1, frequency - (frequency >= 1000 ? 100 : 10)))}
                              className="flex-1 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-xs hover:bg-[#e0e0da] active:translate-y-px">-</button>
                            <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('frequency', frequency + (frequency >= 1000 ? 100 : 10))}
                              className="flex-1 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-xs hover:bg-[#e0e0da] active:translate-y-px">+</button>
                          </div>
                        </div>
                        <input type="number" min={1} step={frequency >= 1000 ? 100 : 10} value={frequency}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => fgenSetProp('frequency', Number(e.target.value))}
                          className="w-full text-xs font-mono font-bold px-2 py-1 rounded bg-[#eeeeea] border border-[#aaa] focus:outline-none text-right" />
                        <div className="text-[9px] text-slate-500 font-mono text-right mt-0.5">Hz</div>
                      </div>

                      {/* Amplitude */}
                      <div className="bg-[#d8d4c8] rounded-lg p-2.5 border border-[#b0aca0]">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">Amplitude (Pico)</div>
                        <div className="flex items-center gap-1 mb-1.5">
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('amplitude', Math.max(0.001, amplitude - 0.1))}
                            className="flex-1 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-xs hover:bg-[#e0e0da] active:translate-y-px">-0.1</button>
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('amplitude', amplitude + 0.1)}
                            className="flex-1 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-xs hover:bg-[#e0e0da] active:translate-y-px">+0.1</button>
                        </div>
                        <input type="number" step={0.1} value={amplitude}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => fgenSetProp('amplitude', Number(e.target.value))}
                          className="w-full text-xs font-mono font-bold px-2 py-1 rounded bg-[#eeeeea] border border-[#aaa] focus:outline-none text-right" />
                        <div className="text-[9px] text-slate-500 font-mono text-right mt-0.5">V (pico)</div>
                      </div>

                      {/* Offset DC */}
                      <div className="bg-[#d8d4c8] rounded-lg p-2.5 border border-[#b0aca0]">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">Offset DC</div>
                        <div className="flex items-center gap-1 mb-1.5">
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('offset', offset - 0.5)}
                            className="flex-1 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-xs hover:bg-[#e0e0da] active:translate-y-px">-0.5</button>
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('offset', offset + 0.5)}
                            className="flex-1 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-xs hover:bg-[#e0e0da] active:translate-y-px">+0.5</button>
                        </div>
                        <input type="number" step={0.5} value={offset}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => fgenSetProp('offset', Number(e.target.value))}
                          className="w-full text-xs font-mono font-bold px-2 py-1 rounded bg-[#eeeeea] border border-[#aaa] focus:outline-none text-right" />
                        <div className="text-[9px] text-slate-500 font-mono text-right mt-0.5">V DC</div>
                      </div>

                      {/* Duty Cycle (só Onda Quadrada) */}
                      <div className={`bg-[#d8d4c8] rounded-lg p-2.5 border border-[#b0aca0] transition-opacity ${waveform === 'square' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">Duty Cycle</div>
                        <div className="flex items-center gap-1 mb-1.5">
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('dutyCycle', Math.max(1, dutyCycle - 5))}
                            className="flex-1 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-xs hover:bg-[#e0e0da] active:translate-y-px">-5%</button>
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => fgenSetProp('dutyCycle', Math.min(99, dutyCycle + 5))}
                            className="flex-1 h-7 rounded bg-[#eeeeea] border border-[#aaa] text-slate-700 font-black text-xs hover:bg-[#e0e0da] active:translate-y-px">+5%</button>
                        </div>
                        <input type="range" min={1} max={99} step={1} value={dutyCycle}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => fgenSetProp('dutyCycle', Number(e.target.value))}
                          className="w-full accent-amber-500" />
                        <div className="text-[9px] text-slate-500 font-mono text-right mt-0.5">{dutyCycle}%</div>
                      </div>
                    </div>

                    {/* Botões de Ação Rápida */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: '1Hz', action: () => fgenSetProp('frequency', 1) },
                        { label: '10Hz', action: () => fgenSetProp('frequency', 10) },
                        { label: '60Hz', action: () => fgenSetProp('frequency', 60) },
                        { label: '1kHz', action: () => fgenSetProp('frequency', 1000) },
                        { label: '10kHz', action: () => fgenSetProp('frequency', 10000) },
                        { label: '100kHz', action: () => fgenSetProp('frequency', 100000) },
                      ].map(btn => (
                        <button key={btn.label} onMouseDown={e => e.stopPropagation()} onClick={btn.action}
                          className={`${buttonBase} bg-[#eeeeea] border-[#aaa] text-slate-700 hover:bg-indigo-100 hover:border-indigo-400 hover:text-indigo-700`}>
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        {/* 4.4 Barra Lateral Direita: Propriedades */}
        <aside
          className={`flex flex-col border-l bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-all duration-300 ${
            viewMode === 'pcb3d' ? 'w-0 border-l-0 overflow-hidden' : (collapsedPanels.right ? 'w-12' : 'w-72')
          } shrink-0 z-10`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setCollapsedPanels({ ...collapsedPanels, right: !collapsedPanels.right })}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 mr-auto"
            >
              {collapsedPanels.right ? <ChevronRight size={14} className="rotate-180" /> : <ChevronDown size={14} className="-rotate-90" />}
            </button>
            {!collapsedPanels.right && (
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-auto">Propriedades</span>
            )}
          </div>

          {!collapsedPanels.right && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedComponent ? (
                <div>
                  <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold font-mono text-xs">
                      {selectedComponent.type.substring(0, 3).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <input 
                        type="text" 
                        value={selectedComponent.name} 
                        onChange={(e) => useStore.getState().updateComponentName(selectedComponent.id, e.target.value)}
                        className="text-xs font-bold w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition-colors px-1 -ml-1"
                        placeholder="Nome do Componente"
                      />
                      <p className="text-[9px] text-slate-400 font-mono truncate max-w-[160px]">ID: {selectedComponent.id}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {Object.entries(selectedComponent.properties).map(([key, prop]) => (
                      <div key={key} className="flex flex-col space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {prop.label}
                        </label>
                        <div className="flex items-center space-x-2">
                          {prop.type === 'boolean' ? (
                            <input
                              type="checkbox"
                              checked={Boolean(prop.value)}
                              onChange={(e) => {
                                useStore.getState().updateComponentProperty(selectedComponent.id, key, e.target.checked);
                              }}
                              className="rounded text-indigo-600 bg-slate-100 dark:bg-slate-800 outline-none w-4 h-4 cursor-pointer"
                            />
                          ) : prop.type === 'select' ? (
                            <select
                              value={String(prop.value)}
                              onChange={(e) => {
                                useStore.getState().updateComponentProperty(selectedComponent.id, key, e.target.value);
                              }}
                              className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-mono"
                            >
                              {(prop.options || []).map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={prop.type === 'number' ? 'number' : 'text'}
                              value={String(prop.value)}
                              onChange={(e) => {
                                const val = prop.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                                useStore.getState().updateComponentProperty(selectedComponent.id, key, val);
                              }}
                              className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-mono"
                            />
                          )}
                          {prop.unit && (
                            <span className="text-xs font-mono font-bold text-slate-500 w-8">{prop.unit}</span>
                          )}
                        </div>
                        {prop.description && (
                          <p className="text-[9px] text-slate-400 leading-normal">{prop.description}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Estado Físico em Tempo Real */}
                  <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Medições do Componente</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-850">
                        <span className="text-[9px] text-slate-400 block uppercase">Tensão</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {formatValue(selectedComponent.simulationState?.voltage || 0, 'V')}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-850">
                        <span className="text-[9px] text-slate-400 block uppercase">Corrente</span>
                        <span className="font-bold text-green-600 dark:text-green-400">
                          {formatValue(selectedComponent.simulationState?.current || 0, 'A')}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-850 col-span-2">
                        <span className="text-[9px] text-slate-400 block uppercase">Potência</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {formatValue(selectedComponent.simulationState?.power || 0, 'W')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : selectedText ? (
                <div>
                  <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold font-mono text-xs">
                      TXT
                    </div>
                    <div>
                      <h3 className="text-xs font-bold truncate max-w-[160px]">Texto</h3>
                      <p className="text-[9px] text-slate-400 font-mono truncate max-w-[160px]">ID: {selectedText.id}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tamanho (px)</label>
                      <input
                        type="number"
                        value={selectedText.size}
                        onChange={(e) => useStore.getState().updateTextProperty(selectedText.id, 'size', Number(e.target.value))}
                        className="w-full text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-mono"
                      />
                    </div>
                    
                    <div className="flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cor</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={selectedText.color || '#8c2425'}
                          onChange={(e) => useStore.getState().updateTextProperty(selectedText.id, 'color', e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer p-0 border-0 bg-transparent"
                        />
                        <input
                          type="text"
                          value={selectedText.color || '#8c2425'}
                          onChange={(e) => useStore.getState().updateTextProperty(selectedText.id, 'color', e.target.value)}
                          className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-mono uppercase"
                        />
                      </div>
                    </div>
                    
                    <div className="flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fonte</label>
                      <select
                        value={selectedText.fontFamily || 'sans-serif'}
                        onChange={(e) => useStore.getState().updateTextProperty(selectedText.id, 'fontFamily', e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all"
                      >
                        <option value="sans-serif">Sans-Serif</option>
                        <option value="monospace">Monospace</option>
                        <option value="serif">Serif</option>
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                      </select>
                    </div>

                    <div className="flex flex-col space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="text-bold-checkbox"
                          checked={Boolean(selectedText.bold)}
                          onChange={(e) => useStore.getState().updateTextProperty(selectedText.id, 'bold', e.target.checked)}
                          className="rounded text-indigo-600 bg-slate-100 dark:bg-slate-800 outline-none w-4 h-4 cursor-pointer"
                        />
                        <label htmlFor="text-bold-checkbox" className="text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                          Negrito
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Sliders size={28} className="mx-auto text-slate-350 dark:text-slate-700 mb-3" />
                  <h3 className="text-xs font-bold text-slate-500">Nenhum selecionado</h3>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    Clique em um componente no editor para editar seus parâmetros físicos e observar suas medições em tempo real.
                  </p>
                </div>
              )}
            </div>
          )}
        </aside>

      </div>

      {/* ============ IA COPILOTO ASSISTANTE ============ */}
      <AiAssistantPanel
        isOpen={showAiPanel}
        onClose={() => setShowAiPanel(false)}
        onLoadCircuit={(name, compList, wireList) => {
          useStore.setState({
            components: compList,
            wires: wireList,
            project: { ...project, name }
          });
          simulationManager.reset();
          simulationManager.updateCircuit(compList, wireList);
        }}
      />

      {/* Dock Flutuante de Zoom & Grade no Canto Inferior Direito do Editor */}
      <div className="fixed bottom-9 right-6 z-20 hidden sm:flex items-center gap-1 p-1.5 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl text-slate-600 dark:text-slate-300">
        <button onClick={() => setViewport({ zoom: Math.min(viewport.zoom + 0.1, 3) })} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" title="Aumentar Zoom">
          <ZoomIn size={14} />
        </button>
        <span className="text-xs font-mono font-bold w-10 text-center text-slate-700 dark:text-slate-200">{(viewport.zoom * 100).toFixed(0)}%</span>
        <button onClick={() => setViewport({ zoom: Math.max(viewport.zoom - 0.1, 0.5) })} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" title="Diminuir Zoom">
          <ZoomOut size={14} />
        </button>
        <button onClick={resetViewport} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" title="Centralizar Visualização">
          <Maximize size={14} />
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

        <button onClick={toggleGrid} className={`p-1.5 rounded-xl transition-all ${gridVisible ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 font-bold' : 'text-slate-400'}`} title="Alternar Grade">
          <Grid size={14} />
        </button>
        <button onClick={toggleSnapToGrid} className={`px-2 py-1 rounded-xl text-xs font-bold transition-all ${snapToGrid ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50' : 'text-slate-400'}`} title="Encaixar na Grade">
          Snap
        </button>
      </div>

      {/* ============ STATUS BAR ============ */}
      <div className={`status-bar ${theme === 'dark' ? 'status-bar-dark' : 'status-bar-light'}`}>
        <div className="status-item">
          <div className={`status-dot ${isSimulating ? 'status-dot-green' : 'status-dot-idle'}`} />
          <span>{isSimulating ? 'Simulando' : 'Parado'}</span>
        </div>
        <div className="status-item">
          <span>🧩 {components.length} componente{components.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="status-item">
          <span>🔗 {wires.length} fio{wires.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="status-item flex items-center space-x-1">
          <span>📐 dt:</span>
          <select
            value={timestep}
            onChange={(e) => setTimestep(parseFloat(e.target.value))}
            className="text-[10px] bg-transparent border-none outline-none font-mono font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            <option value={0.00001}>10μs</option>
            <option value={0.0001}>100μs</option>
            <option value={0.0005}>500μs</option>
            <option value={0.001}>1ms</option>
          </select>
        </div>
        <div className="status-item flex items-center space-x-1">
          <span>⚡ Fluxo:</span>
          <input
            type="range"
            min="0"
            max="8"
            step="0.1"
            value={currentAnimationSpeed}
            onChange={(e) => setCurrentAnimationSpeed(parseFloat(e.target.value))}
            className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            title={`Velocidade do fluxo elétrico: ${currentAnimationSpeed.toFixed(1)}x`}
          />
        </div>
        <div className="status-item">
          <span>🔍 {(viewport.zoom * 100).toFixed(0)}%</span>
        </div>
        <div className="status-item">
          <span>{viewMode === 'schematic' ? '📋 Esquemático' : '🔲 PCB 3D'}</span>
        </div>
        {oscWindowOpen && !oscWindowMinimized && (
          <div className="status-item">
            <span>📊 Osc: {oscCaptureRunning ? 'RUN' : 'STOP'}</span>
          </div>
        )}
        <div className="status-item" style={{ marginLeft: 'auto', borderRight: 'none', borderLeft: '1px solid rgba(148, 163, 184, 0.2)' }}>
          <span>ESM Circuito v1.0</span>
        </div>
      </div>

      {/* --- MODAL DE PROJETOS E EXEMPLOS --- */}
      {showExamplesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/50">
              <div className="flex items-center space-x-2">
                <BookOpen className="text-indigo-600 dark:text-indigo-400" size={18} />
                <h2 className="text-sm font-bold">Galeria de Circuitos & Projetos</h2>
              </div>
              <button onClick={() => setShowExamplesModal(false)} className="p-1 text-slate-400 hover:text-slate-200 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Abas */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/30">
              <button
                onClick={() => setExamplesTab('examples')}
                className={`flex items-center gap-2 py-3 px-5 text-xs font-bold border-b-2 transition-all ${
                  examplesTab === 'examples'
                    ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <BookOpen size={14} />
                Exemplos Prontos
              </button>
              <button
                onClick={() => setExamplesTab('cloud')}
                className={`flex items-center gap-2 py-3 px-5 text-xs font-bold border-b-2 transition-all ${
                  examplesTab === 'cloud'
                    ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Cloud size={14} />
                Projetos na Nuvem Supabase
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {examplesTab === 'examples' ? (
                circuitExamples.map((ex, idx) => (
                  <div
                    key={idx}
                    onClick={() => { handleLoadExample(ex); setShowExamplesModal(false); }}
                    className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-indigo-50/30 dark:hover:bg-slate-800/80 cursor-pointer transition-all"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-100">{ex.name}</span>
                      <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold uppercase">
                        {ex.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{ex.description}</p>
                    <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-200/50 dark:border-slate-800 pt-2 flex items-center space-x-1 font-mono">
                      <Info size={10} className="text-indigo-500 shrink-0" />
                      <span className="line-clamp-1">{ex.educationalInfo}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
                    <span>Seus projetos salvos na nuvem vinculados a <strong>{authSession?.email}</strong>:</span>
                    <button onClick={handleFetchCloudProjects} className="flex items-center gap-1 text-indigo-400 font-semibold hover:text-indigo-300">
                      <RefreshCw size={12} className={loadingCloudProjects ? 'animate-spin' : ''} />
                      <span>Atualizar</span>
                    </button>
                  </div>

                  {loadingCloudProjects ? (
                    <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
                      <Loader2 size={18} className="animate-spin" />
                      <span>Carregando projetos da nuvem...</span>
                    </div>
                  ) : cloudProjects.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl p-4">
                      Nenhum projeto salvo na nuvem ainda.<br />
                      Clique em <strong>Salvar (Ctrl+S)</strong> no editor para enviar seu circuito atual para a nuvem.
                    </div>
                  ) : (
                    cloudProjects.map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/50 hover:border-indigo-500 flex items-center justify-between transition-all"
                      >
                        <div>
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Cloud size={14} className="text-indigo-400" />
                            <span>{p.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Atualizado em: {new Date(p.updatedAt).toLocaleString('pt-BR')}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleLoadCloudProject(p.id)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                          >
                            Abrir
                          </button>
                          <button
                            onClick={() => handleDeleteCloudProject(p.id, p.name)}
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                            title="Excluir da Nuvem"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DO PAINEL ADMIN --- */}
      {authSession.role === 'admin' && (
        <AdminModal isOpen={showAdminModal} onClose={() => setShowAdminModal(false)} />
      )}

      {/* --- MODAL DO HUB DE PROJETOS E BOAS-VINDAS --- */}
      <ProjectsHubModal
        isOpen={showProjectsHub}
        onClose={() => setShowProjectsHub(false)}
        onNewProject={() => {
          clearCircuit();
          setProjectName('Novo Circuito');
        }}
        onLoadExample={(ex) => handleLoadExample(ex)}
        onLoadProjectData={(data) => loadProject(data)}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
        userName={authSession?.name || 'Engenheiro'}
        userId={authSession?.id}
      />

      {/* --- MODAL DE AJUDA E ATALHOS --- */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <HelpCircle size={18} />
                  <h2 className="text-sm font-black uppercase tracking-wider">Atalhos de Teclado</h2>
                </div>
                <button onClick={() => setShowHelpModal(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>
            
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Ferramentas */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-2.5">Ferramentas</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Cursor (Seleção)</span>
                    <span className="kbd">V</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Desenhar Fio</span>
                    <span className="kbd">W</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Adicionar Texto</span>
                    <span className="kbd">T</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Rotacionar Componente</span>
                    <span className="kbd">R</span>
                  </div>
                </div>
              </div>

              <hr className="border-slate-100 dark:border-slate-800" />

              {/* Edição */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-500 dark:text-cyan-400 mb-2.5">Edição</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Desfazer</span>
                    <div className="flex items-center gap-1"><span className="kbd">⌘</span><span className="kbd">Z</span></div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Refazer</span>
                    <div className="flex items-center gap-1"><span className="kbd">⌘</span><span className="kbd">⇧</span><span className="kbd">Z</span></div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Excluir Selecionado</span>
                    <div className="flex items-center gap-1"><span className="kbd">Delete</span></div>
                  </div>
                </div>
              </div>

              <hr className="border-slate-100 dark:border-slate-800" />

              {/* Navegação */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-violet-500 dark:text-violet-400 mb-2.5">Navegação</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Pan no Canvas</span>
                    <div className="flex items-center gap-1"><span className="kbd">⇧</span><span className="kbd">Arrastar</span></div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Zoom</span>
                    <div className="flex items-center gap-1"><span className="kbd">Scroll</span></div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300">Iniciar/Parar Simulação</span>
                    <div className="flex items-center gap-1"><span className="kbd">Espaço</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setShowHelpModal(false)} className="w-full py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all active:scale-[0.98]">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- MODAL PICK DEVICES --- */}
      {showPickDevicesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Pick Devices</h2>
              <button onClick={() => setShowPickDevicesModal(false)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500">
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo Principal Modal */}
            <div className="flex flex-1 min-h-0">
              {/* Categorias (Sidebar Esquerda Modal) */}
              <div className="w-1/4 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col">
                <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-500 uppercase px-2">Category</span>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`w-full text-left px-4 py-1.5 text-xs transition-colors ${
                        activeCategory === cat.id
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista e Busca (Meio Modal) */}
              <div className="flex-1 flex flex-col bg-white dark:bg-slate-950">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center space-x-2">
                  <span className="text-slate-400"><Search size={16} /></span>
                  <input
                    type="text"
                    placeholder="Keywords (ex: resistor, 7404)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 text-sm bg-transparent border-none focus:ring-0 focus:outline-none dark:text-slate-200"
                    autoFocus
                  />
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 shadow-sm z-10">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Device</th>
                        <th className="px-4 py-2 font-semibold">Library</th>
                        <th className="px-4 py-2 font-semibold">Description</th>
                        <th className="px-4 py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComponents.map((comp) => {
                        const isSelected = projectDevices.includes(comp.type);
                        return (
                          <tr
                            key={comp.type}
                            onDoubleClick={() => {
                              if (!isSelected) {
                                addProjectDevice(comp.type);
                              }
                            }}
                            className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
                          >
                            <td className="px-4 py-2 font-bold text-slate-800 dark:text-slate-200">{comp.name}</td>
                            <td className="px-4 py-2 font-mono text-[10px] uppercase text-slate-500">{comp.category}</td>
                            <td className="px-4 py-2 text-slate-500 truncate max-w-xs">{comp.desc}</td>
                            <td className="px-4 py-2 text-center">
                              {isSelected ? (
                                <button
                                  onClick={() => removeProjectDevice(comp.type)}
                                  className="p-1 bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 dark:hover:bg-red-900/50 rounded"
                                  title="Remover do Projeto"
                                >
                                  <X size={14} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => addProjectDevice(comp.type)}
                                  className="p-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 rounded"
                                  title="Adicionar ao Projeto"
                                >
                                  <Plus size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Rodapé Modal */}
            <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setShowPickDevicesModal(false)}
                className="px-6 py-1.5 bg-indigo-600 text-white rounded text-sm font-bold hover:bg-indigo-700 shadow-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
