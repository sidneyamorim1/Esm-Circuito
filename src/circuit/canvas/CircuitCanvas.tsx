import { useRef, useEffect, useState, useMemo } from 'react';
import { useStore } from '../../state/useStore';
import { drawGrid, drawComponent, drawWires, GRID_SIZE } from './renderer';
import { createCircuitComponent, updateComponentTerminals } from '../../utils/circuitUtils';
import { simulationManager } from '../../simulation/workers/workerInterface';
import type { CircuitComponent, CircuitWire } from '../../types/circuit';
import { Copy, Clipboard as PasteIcon, Trash2, RotateCw, Layers, Sliders } from 'lucide-react';

export default function CircuitCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const {
    theme,
    gridVisible,
    snapToGrid,
    viewport,
    setViewport,
    isSimulating,
    components,
    wires,
    selectedComponentId,
    selectedWireId,
    setSelectedComponentId,
    setSelectedWireId,
    activeTool,
    setActiveTool,
    addComponent,
    removeComponent,
    updateComponentPosition,
    updateComponentRotation,
    updateComponentProperty,
    updateComponentName,
    updateComponentLabelOffset,
    addWire,
    removeWire,
    toggleWireRoute,
    updateWireBendOffset,
    updateWireRoutePoint,
    toggleComponentMirrorX,
    toggleComponentMirrorY,
    texts,
    selectedTextId,
    setSelectedTextId,
    addText,
    updateTextPosition,
    removeText,
    updateText,
    undo,
    redo,
    pushHistory,
    clipboard: storeClipboard,
    copyItems: copyStoreItems,
    pasteSelection: pasteStoreSelection
  } = useStore();

  // Estados locais para interações
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isDraggingGroup, setIsDraggingGroup] = useState(false);
  const [draggedComponentId, setDraggedComponentId] = useState<string | null>(null);
  const [draggedLabelComponentId, setDraggedLabelComponentId] = useState<string | null>(null);
  const [draggedWireId, setDraggedWireId] = useState<string | null>(null);
  const [draggedWireRoutePointIndex, setDraggedWireRoutePointIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Desenho de fio temporário
  const [wireStart, setWireStart] = useState<{ componentId: string; terminalId: string } | null>(null);
  const [mouseGridPos, setMouseGridPos] = useState({ x: 0, y: 0 });
  const [wireRoutePoints, setWireRoutePoints] = useState<{ x: number; y: number }[]>([]);
  const [tempVerticalFirst, setTempVerticalFirst] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [propertiesModalCompId, setPropertiesModalCompId] = useState<string | null>(null);
  const [textPrompt, setTextPrompt] = useState<{
    visible: boolean;
    text: string;
    mode: 'add' | 'edit';
    targetId?: string;
    gridX?: number;
    gridY?: number;
  }>({ visible: false, text: '', mode: 'add' });
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [selectedWireIds, setSelectedWireIds] = useState<string[]>([]);
  const groupDragOffsetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const groupDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const groupWireRoutePointsRef = useRef<Record<string, { x: number; y: number }[]>>({});
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Estados locais para Menu de Contexto e Clipboard
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    componentId: string;
    gridX: number;
    gridY: number;
  } | null>(null);
  const [clipboard, setClipboard] = useState<CircuitComponent | null>(null);
  const [isHoveringTerminal, setIsHoveringTerminal] = useState(false);

  // Referência para tempo de animação de corrente
  const animationTimeRef = useRef(0);
  const lastTimeRef = useRef(Date.now());
  const lastRightClickRef = useRef(0);
  const lastLeftClickRef = useRef(0);
  const lastLeftClickCompIdRef = useRef<string | null>(null);

  // Atualiza as dimensões do canvas ao redimensionar o container
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const isWireId = (id: string | null | undefined) => Boolean(id && wires.some(w => w.id === id));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      setDimensions({
        width: Math.max(1, container.clientWidth),
        height: Math.max(1, container.clientHeight)
      });
    };

    updateDimensions();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateDimensions);
      observer.observe(container);
      return () => observer.disconnect();
    }

    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: Math.max(1, containerRef.current.clientWidth),
          height: Math.max(1, containerRef.current.clientHeight)
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sincroniza o circuito com o SimulationManager sempre que houver modificações reais (ignora updates de simulationState)
  const circuitTopologyHash = useMemo(() => {
    const strippedComps = components.map(c => {
      const rest = { ...c };
      delete rest.simulationState;
      return rest;
    });
    return JSON.stringify(strippedComps) + JSON.stringify(wires);
  }, [components, wires]);

  useEffect(() => {
    simulationManager.updateCircuit(components, wires);
    // Sync is intentionally keyed by the topology hash so simulationState updates do not loop back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuitTopologyHash]);

  // Gerencia o ciclo de vida da simulação
  useEffect(() => {
    if (isSimulating) {
      simulationManager.start();
    } else {
      simulationManager.stop();
    }
  }, [isSimulating]);

  // Loop de renderização
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const now = Date.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (isSimulating) {
        const currentSpeed = useStore.getState().currentAnimationSpeed;
        animationTimeRef.current += dt * currentSpeed;
      }

      // Limpa canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Desenha Grade
      if (gridVisible) {
        drawGrid(ctx, canvas.width, canvas.height, viewport, theme);
      }

      // Aplica transformações da Viewport (Pan e Zoom)
      ctx.save();
      ctx.translate(viewport.x * viewport.zoom, viewport.y * viewport.zoom);
      ctx.scale(viewport.zoom, viewport.zoom);

      // 2. Desenha conexões de fios
      drawWires(ctx, wires, components, theme, selectedWireId, animationTimeRef.current, selectedWireIds);

      // 3. Desenha componentes colocados
      components.forEach(comp => {
        const isSelected = selectedComponentId === comp.id || selectedComponentIds.includes(comp.id);
        drawComponent(ctx, comp, theme, isSelected);
      });

      // 3.5 Desenha textos colocados
      texts.forEach(text => {
        ctx.save();
        ctx.fillStyle = text.color || (theme === 'dark' ? '#cbd5e1' : '#334155');
        ctx.font = `${text.bold ? 'bold ' : ''}${text.size}px ${text.fontFamily || 'monospace'}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (selectedTextId === text.id) {
          ctx.strokeStyle = theme === 'dark' ? '#818cf8' : '#6366f1';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          const metrics = ctx.measureText(text.text);
          ctx.strokeRect(text.x * GRID_SIZE - 2, text.y * GRID_SIZE - 2, metrics.width + 4, text.size + 4);
        }
        ctx.fillText(text.text, text.x * GRID_SIZE, text.y * GRID_SIZE);
        ctx.restore();
      });

      // 4. Desenha fio temporário em processo de criação
      if (activeTool === 'wire' && wireStart) {
        const sourceComp = components.find(c => c.id === wireStart.componentId);
        const sourceTerm = sourceComp?.terminals.find(t => t.id === wireStart.terminalId);
        
        if (sourceTerm) {
          ctx.save();
          ctx.strokeStyle = theme === 'dark' ? '#818cf8' : '#6366f1';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]); // Linha tracejada
          
          const x1 = sourceTerm.x * GRID_SIZE;
          const y1 = sourceTerm.y * GRID_SIZE;
          const x2 = mouseGridPos.x * GRID_SIZE;
          const y2 = mouseGridPos.y * GRID_SIZE;
          const previewPoints = [
            { x: x1, y: y1 },
            ...wireRoutePoints.map(point => ({ x: point.x * GRID_SIZE, y: point.y * GRID_SIZE })),
            { x: x2, y: y2 }
          ];

          ctx.beginPath();
          ctx.moveTo(previewPoints[0].x, previewPoints[0].y);
          if (wireRoutePoints.length > 0) {
            previewPoints.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
          } else if (x1 !== x2 && y1 !== y2) {
            if (tempVerticalFirst) {
              ctx.lineTo(x1, y2);
              ctx.lineTo(x2, y2);
            } else {
              ctx.lineTo(x2, y1);
              ctx.lineTo(x2, y2);
            }
          } else {
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();

      // 5. Desenha caixa de seleção (lasso) em pixels reais de tela
      if (selectionBox) {
        const rectW = Math.abs(selectionBox.currentX - selectionBox.startX);
        const rectH = Math.abs(selectionBox.currentY - selectionBox.startY);
        
        if (rectW > 5 || rectH > 5) {
          ctx.save();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)'; // Vermelho semi-transparente estilo Proteus
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.12)'; // Fundo vermelho translúcido estilo Proteus
          
          const rectX = Math.min(selectionBox.startX, selectionBox.currentX);
          const rectY = Math.min(selectionBox.startY, selectionBox.currentY);
          
          ctx.beginPath();
          ctx.rect(rectX, rectY, rectW, rectH);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [components, wires, texts, viewport, theme, gridVisible, activeTool, wireStart, wireRoutePoints, mouseGridPos, selectedComponentId, selectedWireId, selectedTextId, isSimulating, selectionBox, selectedComponentIds, selectedWireIds, tempVerticalFirst]);

  // Função para converter coordenadas de pixel de tela para coordenadas absolutas de grid
  const getGridCoordsFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, gridX: 0, gridY: 0 };

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Transforma pixel em coordenadas de mundo (aplicando zoom e pan)
    const worldX = (mouseX / viewport.zoom) - viewport.x;
    const worldY = (mouseY / viewport.zoom) - viewport.y;

    // Converte para coordenadas discretas do Grid
    const gridX = Math.round(worldX / GRID_SIZE);
    const gridY = Math.round(worldY / GRID_SIZE);

    return {
      x: worldX,
      y: worldY,
      gridX,
      gridY
    };
  };

  const getDragGridCoords = (worldX: number, worldY: number, gridX: number, gridY: number) => ({
    x: snapToGrid ? gridX : worldX / GRID_SIZE,
    y: snapToGrid ? gridY : worldY / GRID_SIZE
  });

  // Função para medir distância de um ponto a um segmento
  const getDistanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2);
  };

  const getComponentLabelBaseY = (comp: CircuitComponent) => {
    if (comp.type === 'probe_dc' || comp.type === 'probe_ac') return 34;
    if (comp.type === 'pot') return -34;
    if (comp.type.startsWith('transistor')) return -32;
    return -24;
  };

  const getComponentLabelText = (comp: CircuitComponent) => {
    const typeInitial = comp.type === 'resistor' || comp.type === 'pot' ? 'R' :
      comp.type.startsWith('capacitor') ? 'C' :
      comp.type.startsWith('diodo') || comp.type === 'led' || comp.type === 'zener' ? 'D' :
      comp.type.startsWith('transistor') ? 'Q' :
      comp.type === 'inductor' ? 'L' :
      comp.type === 'switch' ? 'SW' : 'U';
    const hash = comp.id.split('_').pop()?.toUpperCase() || '1';
    return comp.name || `${typeInitial}${hash}`;
  };

  const worldToComponentLocal = (comp: CircuitComponent, worldX: number, worldY: number) => {
    const dx = worldX - comp.x * GRID_SIZE;
    const dy = worldY - comp.y * GRID_SIZE;
    const angle = -((comp.rotation * Math.PI) / 180);
    let localX = dx * Math.cos(angle) - dy * Math.sin(angle);
    let localY = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (comp.mirrorX) localX = -localX;
    if (comp.mirrorY) localY = -localY;
    return { x: localX, y: localY };
  };

  const getComponentLabelHit = (worldX: number, worldY: number) => {
    for (let i = components.length - 1; i >= 0; i--) {
      const comp = components[i];
      if (comp.type === 'junction') continue;

      const local = worldToComponentLocal(comp, worldX, worldY);
      const labelX = (comp.labelOffset?.x ?? 0) * GRID_SIZE;
      const labelY = getComponentLabelBaseY(comp) + (comp.labelOffset?.y ?? 0) * GRID_SIZE;
      const labelText = getComponentLabelText(comp);
      const width = Math.max(28, labelText.length * 6);
      const height = 14;

      if (
        local.x >= labelX - width / 2 - 4 &&
        local.x <= labelX + width / 2 + 4 &&
        local.y >= labelY - height + 2 &&
        local.y <= labelY + 6
      ) {
        return { comp, local };
      }
    }

    return null;
  };

  const getWirePathPoints = (wire: CircuitWire) => {
    const compFrom = components.find(c => c.id === wire.from.componentId);
    const compTo = components.find(c => c.id === wire.to.componentId);
    const termFrom = compFrom?.terminals.find(t => t.id === wire.from.terminalId);
    const termTo = compTo?.terminals.find(t => t.id === wire.to.terminalId);
    if (!termFrom || !termTo) return null;

    return [
      { x: termFrom.x * GRID_SIZE, y: termFrom.y * GRID_SIZE },
      ...(wire.routePoints || []).map(point => ({ x: point.x * GRID_SIZE, y: point.y * GRID_SIZE })),
      { x: termTo.x * GRID_SIZE, y: termTo.y * GRID_SIZE }
    ];
  };

  const getDistanceToWirePath = (wire: CircuitWire, x: number, y: number) => {
    const points = getWirePathPoints(wire);
    if (!points || points.length < 2) return Infinity;

    if (wire.routePoints && wire.routePoints.length > 0) {
      let dist = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        dist = Math.min(dist, getDistanceToSegment(x, y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y));
      }
      return dist;
    }

    return null;
  };

  const beginGroupDrag = (gridX: number, gridY: number) => {
    if (selectedComponentIds.length === 0 && selectedWireIds.length === 0) return false;

    const selectedComponentSet = new Set(selectedComponentIds);
    const wiresToMove = wires.filter(w =>
      selectedWireIds.includes(w.id) ||
      (selectedComponentSet.has(w.from.componentId) && selectedComponentSet.has(w.to.componentId))
    );

    pushHistory();
    groupDragStartRef.current = { x: gridX, y: gridY };
    groupDragOffsetsRef.current = {};
    selectedComponentIds.forEach(id => {
      const item = components.find(c => c.id === id);
      if (item) {
        groupDragOffsetsRef.current[id] = {
          x: gridX - item.x,
          y: gridY - item.y
        };
      }
    });
    groupWireRoutePointsRef.current = Object.fromEntries(
      wiresToMove
        .filter(w => w.routePoints && w.routePoints.length > 0)
        .map(w => [w.id, w.routePoints!.map(point => ({ ...point }))])
    );

    setIsDraggingGroup(true);
    setDraggedComponentId(null);
    setDraggedLabelComponentId(null);
    setDraggedWireId(null);
    setDraggedWireRoutePointIndex(null);
    return true;
  };

  // Tenta selecionar um componente, fio ou texto baseado no clique
  const trySelectElementAt = (worldX: number, worldY: number) => {
    // 1. Prioriza textos
    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i];
      const textWidth = text.text.length * (text.size * 0.6);
      if (
        worldX >= text.x * GRID_SIZE - 5 && 
        worldX <= text.x * GRID_SIZE + textWidth + 5 &&
        worldY >= text.y * GRID_SIZE - 5 &&
        worldY <= text.y * GRID_SIZE + text.size + 5
      ) {
        setSelectedTextId(text.id);
        return text.id;
      }
    }

    const labelHit = getComponentLabelHit(worldX, worldY);
    if (labelHit) {
      setSelectedComponentId(labelHit.comp.id);
      return labelHit.comp.id;
    }

    // 2. Verifica componentes
    for (let i = components.length - 1; i >= 0; i--) {
      const comp = components[i];
      let minX = -20, maxX = 20, minY = -20, maxY = 20;

      if (comp.type === 'probe_dc' || comp.type === 'probe_ac') {
        minX = -65;
        maxX = 35;
        minY = -55;
        maxY = 15;
      } else {
        comp.terminals.forEach(t => {
          const dx = (t.x - comp.x) * GRID_SIZE;
          const dy = (t.y - comp.y) * GRID_SIZE;
          minX = Math.min(minX, dx);
          maxX = Math.max(maxX, dx);
          minY = Math.min(minY, dy);
          maxY = Math.max(maxY, dy);
        });
      }
      
      const cx = comp.x * GRID_SIZE;
      const cy = comp.y * GRID_SIZE;
      
      // Adiciona uma margem de tolerância (12px)
      if (
        worldX >= cx + minX - 12 && 
        worldX <= cx + maxX + 12 && 
        worldY >= cy + minY - 12 && 
        worldY <= cy + maxY + 12
      ) {
        setSelectedComponentId(comp.id);
        return comp.id;
      }
    }

    // 3. Verifica fios (wires)
    for (let i = 0; i < wires.length; i++) {
      const wire = wires[i];
      const manualRouteDist = getDistanceToWirePath(wire, worldX, worldY);
      if (manualRouteDist !== null && manualRouteDist < 12) {
        setSelectedWireId(wire.id);
        return wire.id;
      }

      const compFrom = components.find(c => c.id === wire.from.componentId);
      const compTo = components.find(c => c.id === wire.to.componentId);

      if (compFrom && compTo) {
        const termFrom = compFrom.terminals.find(t => t.id === wire.from.terminalId);
        const termTo = compTo.terminals.find(t => t.id === wire.to.terminalId);

        if (termFrom && termTo) {
          const x1 = termFrom.x * GRID_SIZE;
          const y1 = termFrom.y * GRID_SIZE;
          const x2 = termTo.x * GRID_SIZE;
          const y2 = termTo.y * GRID_SIZE;

          let dist: number;
          const verticalFirst = wire.verticalFirst ?? false;
          const bendOffset = wire.bendOffset;

          if (x1 !== x2 && y1 !== y2) {
            if (bendOffset !== undefined) {
              // Z-Shape de 3 segmentos
              if (verticalFirst) {
                const yMid = y1 + bendOffset * GRID_SIZE;
                const d1 = getDistanceToSegment(worldX, worldY, x1, y1, x1, yMid);
                const d2 = getDistanceToSegment(worldX, worldY, x1, yMid, x2, yMid);
                const d3 = getDistanceToSegment(worldX, worldY, x2, yMid, x2, y2);
                dist = Math.min(d1, d2, d3);
              } else {
                const xMid = x1 + bendOffset * GRID_SIZE;
                const d1 = getDistanceToSegment(worldX, worldY, x1, y1, xMid, y1);
                const d2 = getDistanceToSegment(worldX, worldY, xMid, y1, xMid, y2);
                const d3 = getDistanceToSegment(worldX, worldY, xMid, y2, x2, y2);
                dist = Math.min(d1, d2, d3);
              }
            } else {
              // L-Shape de 2 segmentos
              if (verticalFirst) {
                const d1 = getDistanceToSegment(worldX, worldY, x1, y1, x1, y2);
                const d2 = getDistanceToSegment(worldX, worldY, x1, y2, x2, y2);
                dist = Math.min(d1, d2);
              } else {
                const d1 = getDistanceToSegment(worldX, worldY, x1, y1, x2, y1);
                const d2 = getDistanceToSegment(worldX, worldY, x2, y1, x2, y2);
                dist = Math.min(d1, d2);
              }
            }
          } else {
            dist = getDistanceToSegment(worldX, worldY, x1, y1, x2, y2);
          }

          if (dist < 12) {
            setSelectedWireId(wire.id);
            return wire.id;
          }
        }
      }
    }

    // 4. Limpa seleções se clicou no vazio
    setSelectedComponentId(null);
    setSelectedWireId(null);
    setSelectedTextId(null);
    return null;
  };

  // Funções para ações do Menu de Contexto
  const handleRotateAction = (compId: string, deltaRotation: number = 90) => {
    const comp = components.find(c => c.id === compId);
    if (!comp) return;
    updateComponentRotation(compId, deltaRotation);
    setContextMenu(null);
  };

  const getActiveSelection = () => {
    const componentIds = selectedComponentIds.length > 0
      ? selectedComponentIds
      : (selectedComponentId ? [selectedComponentId] : []);
    const wireIds = selectedWireIds.length > 0
      ? selectedWireIds
      : (selectedWireId ? [selectedWireId] : []);

    return { componentIds, wireIds };
  };

  const copyActiveSelection = () => {
    const { componentIds, wireIds } = getActiveSelection();
    if (componentIds.length > 0 || wireIds.length > 0) {
      copyStoreItems(componentIds, wireIds);
    }
  };

  const duplicateActiveSelection = () => {
    copyActiveSelection();
    const pasted = pasteStoreSelection();
    if (!pasted) return;

    setSelectedComponentIds(pasted.componentIds);
    setSelectedWireIds(pasted.wireIds);
    setSelectedComponentId(pasted.componentIds.length === 1 ? pasted.componentIds[0] : null);
    setSelectedWireId(pasted.componentIds.length === 0 && pasted.wireIds.length === 1 ? pasted.wireIds[0] : null);
  };

  const pasteActiveClipboard = (targetGridPosition?: { x: number; y: number }) => {
    const pasted = pasteStoreSelection(targetGridPosition);
    if (!pasted) return false;

    setSelectedComponentIds(pasted.componentIds);
    setSelectedWireIds(pasted.wireIds);
    setSelectedComponentId(pasted.componentIds.length === 1 ? pasted.componentIds[0] : null);
    setSelectedWireId(pasted.componentIds.length === 0 && pasted.wireIds.length === 1 ? pasted.wireIds[0] : null);
    return true;
  };

  const isContextComponentInMultiSelection = (componentId: string) =>
    selectedComponentIds.length > 1 && selectedComponentIds.includes(componentId);

  const handleCopyAction = (compId: string) => {
    const comp = components.find(c => c.id === compId);
    if (comp) {
      const copiedComp = JSON.parse(JSON.stringify(comp));
      setClipboard(copiedComp);
      useStore.setState({
        clipboard: {
          components: [copiedComp],
          wires: []
        }
      });
    }
    setContextMenu(null);
  };

  const handleDuplicateAction = (compId: string) => {
    const comp = components.find(c => c.id === compId);
    if (!comp) return;

    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 5);
    const newId = `${comp.type}_${timestamp}_${randomStr}`;

    const duplicatedComp: CircuitComponent = {
      ...comp,
      id: newId,
      name: `${comp.name.split(' ')[0]} ${randomStr.toUpperCase()}`,
      x: comp.x + 2,
      y: comp.y + 2,
      properties: JSON.parse(JSON.stringify(comp.properties)),
      terminals: comp.terminals.map(term => ({
        ...term,
        x: comp.x + 2 + term.relX,
        y: comp.y + 2 + term.relY
      }))
    };

    const updated = updateComponentTerminals(duplicatedComp);
    addComponent(updated);
    setSelectedComponentId(updated.id);
    setContextMenu(null);
  };

  const handleRemoveAction = (compId: string) => {
    removeComponent(compId);
    setContextMenu(null);
  };

  const handlePasteAction = (gridX: number, gridY: number) => {
    if (!clipboard) return;

    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 5);
    const newId = `${clipboard.type}_${timestamp}_${randomStr}`;

    const pastedComp: CircuitComponent = {
      ...clipboard,
      id: newId,
      name: `${clipboard.name.split(' ')[0]} ${randomStr.toUpperCase()}`,
      x: gridX,
      y: gridY,
      properties: JSON.parse(JSON.stringify(clipboard.properties)),
      terminals: clipboard.terminals.map(term => ({
        ...term,
        x: gridX + term.relX,
        y: gridY + term.relY
      }))
    };

    const updated = updateComponentTerminals(pastedComp);
    addComponent(updated);
    setSelectedComponentId(updated.id);
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  };

  const getOrInsertJunctionAtWire = (
    x: number,
    y: number,
    gridX: number,
    gridY: number,
    currentTerminal: { componentId: string; terminalId: string } | null
  ): { componentId: string; terminalId: string } | null => {
    if (currentTerminal) return currentTerminal;

    // Procura fio colidindo
    let clickedWire: CircuitWire | null = null;
    let clickedWireDist = Infinity;
    
    for (const wire of wires) {
      const manualRouteDist = getDistanceToWirePath(wire, x, y);
      if (manualRouteDist !== null) {
        if (manualRouteDist < 8 && manualRouteDist < clickedWireDist) {
          clickedWire = wire;
          clickedWireDist = manualRouteDist;
        }
        continue;
      }

      const compFrom = components.find(c => c.id === wire.from.componentId);
      const compTo = components.find(c => c.id === wire.to.componentId);
      if (compFrom && compTo) {
        const termFrom = compFrom.terminals.find(t => t.id === wire.from.terminalId);
        const termTo = compTo.terminals.find(t => t.id === wire.to.terminalId);
        if (termFrom && termTo) {
          const x1 = termFrom.x * GRID_SIZE;
          const y1 = termFrom.y * GRID_SIZE;
          const x2 = termTo.x * GRID_SIZE;
          const y2 = termTo.y * GRID_SIZE;
          
          let wDist: number;
          const verticalFirst = wire.verticalFirst ?? false;
          const bendOffset = wire.bendOffset;
          
          if (x1 !== x2 && y1 !== y2) {
            if (bendOffset !== undefined) {
              if (verticalFirst) {
                const yMid = y1 + bendOffset * GRID_SIZE;
                wDist = Math.min(
                  getDistanceToSegment(x, y, x1, y1, x1, yMid),
                  getDistanceToSegment(x, y, x1, yMid, x2, yMid),
                  getDistanceToSegment(x, y, x2, yMid, x2, y2)
                );
              } else {
                const xMid = x1 + bendOffset * GRID_SIZE;
                wDist = Math.min(
                  getDistanceToSegment(x, y, x1, y1, xMid, y1),
                  getDistanceToSegment(x, y, xMid, y1, xMid, y2),
                  getDistanceToSegment(x, y, xMid, y2, x2, y2)
                );
              }
            } else {
              if (verticalFirst) {
                wDist = Math.min(
                  getDistanceToSegment(x, y, x1, y1, x1, y2),
                  getDistanceToSegment(x, y, x1, y2, x2, y2)
                );
              } else {
                wDist = Math.min(
                  getDistanceToSegment(x, y, x1, y1, x2, y1),
                  getDistanceToSegment(x, y, x2, y1, x2, y2)
                );
              }
            }
          } else {
            wDist = getDistanceToSegment(x, y, x1, y1, x2, y2);
          }
          
          if (wDist < 8 && wDist < clickedWireDist) {
            clickedWire = wire;
            clickedWireDist = wDist;
          }
        }
      }
    }

    if (clickedWire) {
      const junctionComp = createCircuitComponent('junction', gridX, gridY);
      addComponent(junctionComp);
      
      // Remove o fio antigo
      removeWire(clickedWire.id);
      
      // Cria dois novos fios dividindo o antigo
      const timestamp = Date.now();
      const w1: CircuitWire = {
        id: `wire_${timestamp}_a`,
        from: clickedWire.from,
        to: { componentId: junctionComp.id, terminalId: 'j1' }
      };
      const w2: CircuitWire = {
        id: `wire_${timestamp}_b`,
        from: { componentId: junctionComp.id, terminalId: 'j1' },
        to: clickedWire.to
      };
      
      addWire(w1);
      addWire(w2);
      
      return { componentId: junctionComp.id, terminalId: 'j1' };
    }

    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Fecha o menu de contexto se aberto
    if (contextMenu) {
      setContextMenu(null);
    }

    // ESTILO PROTEUS: Tratamento do botão direito
    if (e.button === 2) {
      e.preventDefault(); // Impede comportamento padrão e abortos de mousemove
      
      if (wireStart) {
        setWireStart(null);
        setWireRoutePoints([]);
        setTempVerticalFirst(false);
        setActiveTool('select');
        return;
      }

      const now = Date.now();
      const diff = now - lastRightClickRef.current;
      lastRightClickRef.current = now;

      if (diff < 300) {
        const { x, y } = getGridCoordsFromEvent(e);
        const clickedId = trySelectElementAt(x, y);
        if (clickedId) {
          if (isWireId(clickedId)) {
            removeWire(clickedId);
          } else {
            removeComponent(clickedId);
          }
          return;
        }
      }

      // Right-click selection (lasso) disabled
      return;
      const canvas = canvasRef.current;
      if (canvas) {
        const mouseX = e.nativeEvent.offsetX;
        const mouseY = e.nativeEvent.offsetY;
        setSelectionBox({
          startX: mouseX,
          startY: mouseY,
          currentX: mouseX,
          currentY: mouseY
        });
      }
      return;
    }

    // Tecla Espaço pressionada, botão do meio ou barra de espaço segurada ativam pan
    if (e.button === 1 || (e.button === 0 && (e.shiftKey || isSpacePressed))) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button !== 0) return; // Só botão esquerdo
    
    const { x, y, gridX, gridY } = getGridCoordsFromEvent(e);

    // Se a ferramenta for de colocação (componentes ou texto), insere antes de qualquer seleção.
    if (activeTool !== 'select' && activeTool !== 'wire' && activeTool !== 'delete') {
      if (activeTool === 'text') {
        setTextPrompt({
          visible: true,
          text: '',
          mode: 'add',
          gridX,
          gridY
        });
        return;
      }

      const newComp = createCircuitComponent(activeTool, gridX, gridY);
      addComponent(newComp);
      setActiveTool('select');
      setSelectedComponentId(newComp.id);
      return;
    }

    // ESTILO PROTEUS: Duplo clique esquerdo abre modal de propriedades
    const clickedId = trySelectElementAt(x, y);
    if (clickedId) {
      if (!isWireId(clickedId)) {
        const now = Date.now();
        const diff = now - lastLeftClickRef.current;
        lastLeftClickRef.current = now;
        if (diff < 300 && lastLeftClickCompIdRef.current === clickedId) {
          if (clickedId.startsWith('text_')) {
            const textToEdit = texts.find(t => t.id === clickedId);
            if (textToEdit) {
              setTextPrompt({
                visible: true,
                text: textToEdit.text,
                mode: 'edit',
                targetId: clickedId
              });
            }
          } else {
            setPropertiesModalCompId(clickedId);
          }
          setWireStart(null);
          setWireRoutePoints([]);
          lastLeftClickCompIdRef.current = null;
          return;
        }
        // Atualiza último clique esquerdo
        lastLeftClickCompIdRef.current = clickedId;
      } else {
        // Clicou em fio
        lastLeftClickCompIdRef.current = null;
      }
    } else if (activeTool === 'select') {
      // Nenhum elemento clicado – inicia caixa de seleção (lasso) com botão esquerdo
      const canvas = canvasRef.current;
      if (canvas) {
        const mouseX = e.nativeEvent.offsetX;
        const mouseY = e.nativeEvent.offsetY;
        setSelectionBox({
          startX: mouseX,
          startY: mouseY,
          currentX: mouseX,
          currentY: mouseY
        });
      }
      lastLeftClickCompIdRef.current = null;
      return;
    }

    // Modo Desenhar Fio (Wire)
    if (activeTool === 'wire') {
      // Verifica se clicamos em algum terminal de componente
      let clickedTerminal: { componentId: string; terminalId: string } | null = null;
      
      for (const comp of components) {
        for (const term of comp.terminals) {
          // Snap ao terminal se clicou perto dele (dentro de 12px)
          const termX = term.x * GRID_SIZE;
          const termY = term.y * GRID_SIZE;
          const dist = Math.sqrt((x - termX) ** 2 + (y - termY) ** 2);
          
          if (dist < 12) {
            clickedTerminal = { componentId: comp.id, terminalId: term.id };
            break;
          }
        }
        if (clickedTerminal) break;
      }

      // Se o clique caiu sobre o corpo/label do componente, tenta prender no terminal
      // mais próximo dele. Isso deixa a criação de fios mais robusta em componentes
      // com rótulos e badges grandes, como as pontas de prova.
      if (!clickedTerminal && clickedId && !isWireId(clickedId) && !clickedId.startsWith('text_')) {
        const comp = components.find(c => c.id === clickedId);
        if (comp && comp.terminals.length > 0) {
          let nearestTerminal: { componentId: string; terminalId: string } | null = null;
          let nearestDistance = Infinity;

          for (const term of comp.terminals) {
            const termX = term.x * GRID_SIZE;
            const termY = term.y * GRID_SIZE;
            const dist = Math.sqrt((x - termX) ** 2 + (y - termY) ** 2);
            if (dist < nearestDistance) {
              nearestDistance = dist;
              nearestTerminal = { componentId: comp.id, terminalId: term.id };
            }
          }

          if (nearestTerminal && nearestDistance < 30) {
            clickedTerminal = nearestTerminal;
          }
        }
      }

      // ESTILO PROTEUS: Tenta interceptar e dividir fio em um nó de junção
      clickedTerminal = getOrInsertJunctionAtWire(x, y, gridX, gridY, clickedTerminal);

      if (clickedTerminal) {
        if (!wireStart) {
          // Primeiro clique: Define origem do fio
          setWireStart(clickedTerminal);
          setWireRoutePoints([]);
        } else {
          // Segundo clique: Conecta o fio
          // Impede conectar o mesmo terminal
          if (wireStart.componentId === clickedTerminal.componentId && wireStart.terminalId === clickedTerminal.terminalId) {
            setWireStart(null);
            setWireRoutePoints([]);
            return;
          }

          const wireId = `wire_${Date.now()}`;
          const newWire: CircuitWire = {
            id: wireId,
            from: wireStart,
            to: clickedTerminal,
            verticalFirst: tempVerticalFirst,
            routePoints: wireRoutePoints.length > 0 ? wireRoutePoints : undefined
          };
          
          addWire(newWire);
          setWireStart(null);
          setWireRoutePoints([]);
          setTempVerticalFirst(false);
          // Permanece no modo 'wire' para desenhar mais fios
        }
      } else {
        // Clicou fora dos pinos/fios (no vazio): registra uma curva/waypoint sem criar nó elétrico
        if (wireStart) {
          setWireRoutePoints(prev => [...prev, { x: gridX, y: gridY }]);
          setTempVerticalFirst(false);
        }
      }
      return;
    }

    // Modo Seleção/Arraste
    if (activeTool === 'select') {
      const selectedId = trySelectElementAt(x, y);
      const dragGrid = getDragGridCoords(x, y, gridX, gridY);

      if (selectedId) {
        const hasMultiSelection = selectedComponentIds.length > 0 || selectedWireIds.length > 0;
        const clickedSelectedComponent = !isWireId(selectedId) && selectedComponentIds.includes(selectedId);
        const clickedSelectedWire = isWireId(selectedId) && selectedWireIds.includes(selectedId);

        if (hasMultiSelection && (clickedSelectedComponent || clickedSelectedWire) && beginGroupDrag(dragGrid.x, dragGrid.y)) {
          return;
        }

        if (isWireId(selectedId)) {
          setDraggedWireId(selectedId);
          const wire = wires.find(w => w.id === selectedId);
          if (wire?.routePoints && wire.routePoints.length > 0) {
            let closestIndex = 0;
            let closestDistance = Infinity;
            wire.routePoints.forEach((point, index) => {
              const dist = Math.sqrt((dragGrid.x - point.x) ** 2 + (dragGrid.y - point.y) ** 2);
              if (dist < closestDistance) {
                closestIndex = index;
                closestDistance = dist;
              }
            });
            const point = wire.routePoints[closestIndex];
            setDraggedWireRoutePointIndex(closestIndex);
            setDragOffset({
              x: dragGrid.x - point.x,
              y: dragGrid.y - point.y
            });
            return;
          }

          setDraggedWireRoutePointIndex(null);
          const compFrom = components.find(c => c.id === wire?.from.componentId);
          const termFrom = compFrom?.terminals.find(t => t.id === wire?.from.terminalId);
          const compTo = components.find(c => c.id === wire?.to.componentId);
          const termTo = compTo?.terminals.find(t => t.id === wire?.to.terminalId);
          if (wire && termFrom && termTo) {
            const defaultOffset = wire.verticalFirst ? (termTo.y - termFrom.y) / 2 : (termTo.x - termFrom.x) / 2;
            const currentOffset = wire.bendOffset !== undefined ? wire.bendOffset : defaultOffset;
            setDragOffset({
              x: dragGrid.x - termFrom.x - currentOffset,
              y: dragGrid.y - termFrom.y - currentOffset
            });
          }
        } else if (selectedId.startsWith('text_')) {
          const textItem = texts.find(t => t.id === selectedId);
          if (textItem) {
            setDraggedComponentId(textItem.id);
            setDragOffset({
              x: dragGrid.x - textItem.x,
              y: dragGrid.y - textItem.y
            });
            setSelectedComponentIds([]);
            setSelectedWireIds([]);
            groupDragOffsetsRef.current = {};
          }
        } else {
          const comp = components.find(c => c.id === selectedId);
          if (comp) {
            const labelHit = getComponentLabelHit(x, y);
            if (labelHit?.comp.id === comp.id) {
              const labelBaseY = getComponentLabelBaseY(comp) / GRID_SIZE;
              const currentOffset = comp.labelOffset ?? { x: 0, y: 0 };
              const localGridX = labelHit.local.x / GRID_SIZE;
              const localGridY = (labelHit.local.y / GRID_SIZE) - labelBaseY;
              pushHistory();
              setDraggedLabelComponentId(comp.id);
              setDragOffset({
                x: localGridX - currentOffset.x,
                y: localGridY - currentOffset.y
              });
              setSelectedComponentIds([]);
              setSelectedWireIds([]);
              groupDragOffsetsRef.current = {};
              return;
            }

            // Lógica de Toggle em chaves elétricas (interage imediatamente na simulação se clicado)
            if (comp.type === 'switch') {
              const curState = comp.properties.state?.value ?? false;
              updateComponentProperty(comp.id, 'state', !curState);
              return; // Evita arrastar a chave ao apenas dar um clique rápido
            }

            // Lógica de setinhas do Potenciômetro
            if (comp.type === 'pot') {
              const dx = x - comp.x * GRID_SIZE;
              const dy = y - comp.y * GRID_SIZE;
              // Rotaciona (dx, dy) inversamente para bater com as coordenadas locais do desenho
              let localX = dx;
              let localY = dy;
              if (comp.rotation === 90) { localX = dy; localY = -dx; }
              else if (comp.rotation === 180) { localX = -dx; localY = -dy; }
              else if (comp.rotation === 270) { localX = -dy; localY = dx; }

              const distUp = Math.sqrt((localX - (-20)) ** 2 + (localY - (-10)) ** 2);
              const distDown = Math.sqrt((localX - (-20)) ** 2 + (localY - 10) ** 2);
              
              if (distUp <= 6) { // 6px de margem
                const curSetting = Number(comp.properties.setting?.value ?? 50);
                updateComponentProperty(comp.id, 'setting', Math.min(100, curSetting + 5));
                return;
              } else if (distDown <= 6) {
                const curSetting = Number(comp.properties.setting?.value ?? 50);
                updateComponentProperty(comp.id, 'setting', Math.max(0, curSetting - 5));
                return;
              }
            }

            setDraggedComponentId(comp.id);
            setDragOffset({
              x: dragGrid.x - comp.x,
              y: dragGrid.y - comp.y
            });

            // Limpa seleção múltipla pois ele clicou em outro item individual
            setSelectedComponentIds([]);
            setSelectedWireIds([]);
            groupDragOffsetsRef.current = {};
            groupDragStartRef.current = null;
            groupWireRoutePointsRef.current = {};
            setIsDraggingGroup(false);
          }
        }
      } else {
        // Clicou no vazio do canvas: limpa a seleção múltipla
        setSelectedComponentIds([]);
        setSelectedWireIds([]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Se estiver desenhando a caixa de seleção
    if (selectionBox) {
      const mouseX = e.nativeEvent.offsetX;
      const mouseY = e.nativeEvent.offsetY;
      setSelectionBox(prev => prev ? { ...prev, currentX: mouseX, currentY: mouseY } : null);
      return;
    }

    const { x, y, gridX, gridY } = getGridCoordsFromEvent(e);
    const dragGrid = getDragGridCoords(x, y, gridX, gridY);
    setMouseGridPos({ x: gridX, y: gridY });

    // ESTILO PROTEUS: Verifica se está pairando sobre algum terminal para indicar fiação inteligente
    let hovering = false;
    for (const comp of components) {
      for (const term of comp.terminals) {
        const termX = term.x * GRID_SIZE;
        const termY = term.y * GRID_SIZE;
        const dist = Math.sqrt((x - termX) ** 2 + (y - termY) ** 2);
        
        if (dist < 12) {
          hovering = true;
          break;
        }
      }
      if (hovering) break;
    }

    if (!hovering) {
      // Verifica se está pairando sobre algum fio para fiação inteligente em fios (junções)
      for (const wire of wires) {
        const manualRouteDist = getDistanceToWirePath(wire, x, y);
        if (manualRouteDist !== null) {
          if (manualRouteDist < 12) {
            hovering = true;
            break;
          }
          continue;
        }

        const compFrom = components.find(c => c.id === wire.from.componentId);
        const compTo = components.find(c => c.id === wire.to.componentId);
        if (compFrom && compTo) {
          const termFrom = compFrom.terminals.find(t => t.id === wire.from.terminalId);
          const termTo = compTo.terminals.find(t => t.id === wire.to.terminalId);
          if (termFrom && termTo) {
            const x1 = termFrom.x * GRID_SIZE;
            const y1 = termFrom.y * GRID_SIZE;
            const x2 = termTo.x * GRID_SIZE;
            const y2 = termTo.y * GRID_SIZE;
            
            let wDist: number;
            const verticalFirst = wire.verticalFirst ?? false;
            const bendOffset = wire.bendOffset;
            
            if (x1 !== x2 && y1 !== y2) {
              if (bendOffset !== undefined) {
                if (verticalFirst) {
                  const yMid = y1 + bendOffset * GRID_SIZE;
                  wDist = Math.min(
                    getDistanceToSegment(x, y, x1, y1, x1, yMid),
                    getDistanceToSegment(x, y, x1, yMid, x2, yMid),
                    getDistanceToSegment(x, y, x2, yMid, x2, y2)
                  );
                } else {
                  const xMid = x1 + bendOffset * GRID_SIZE;
                  wDist = Math.min(
                    getDistanceToSegment(x, y, x1, y1, xMid, y1),
                    getDistanceToSegment(x, y, xMid, y1, xMid, y2),
                    getDistanceToSegment(x, y, xMid, y2, x2, y2)
                  );
                }
              } else {
                if (verticalFirst) {
                  wDist = Math.min(
                    getDistanceToSegment(x, y, x1, y1, x1, y2),
                    getDistanceToSegment(x, y, x1, y2, x2, y2)
                  );
                } else {
                  wDist = Math.min(
                    getDistanceToSegment(x, y, x1, y1, x2, y1),
                    getDistanceToSegment(x, y, x2, y1, x2, y2)
                  );
                }
              }
            } else {
              wDist = getDistanceToSegment(x, y, x1, y1, x2, y2);
            }
            
            if (wDist < 12) {
              hovering = true;
              break;
            }
          }
        }
      }
    }

    setIsHoveringTerminal(hovering);

    if (isPanning) {
      const dx = (e.clientX - panStart.x) / viewport.zoom;
      const dy = (e.clientY - panStart.y) / viewport.zoom;
      setViewport({
        x: viewport.x + dx,
        y: viewport.y + dy
      });
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (isDraggingGroup) {
      const groupDeltaX = groupDragStartRef.current ? dragGrid.x - groupDragStartRef.current.x : 0;
      const groupDeltaY = groupDragStartRef.current ? dragGrid.y - groupDragStartRef.current.y : 0;
      const updatedComponents = components.map(c => {
        if (selectedComponentIds.includes(c.id)) {
          const offset = groupDragOffsetsRef.current[c.id];
          if (offset) {
            let targetX = dragGrid.x - offset.x;
            let targetY = dragGrid.y - offset.y;
            if (snapToGrid) {
              targetX = Math.round(targetX);
              targetY = Math.round(targetY);
            }
            return updateComponentTerminals({ ...c, x: targetX, y: targetY });
          }
        }
        return c;
      });

      const updatedWires = wires.map(wire => {
        const originalRoutePoints = groupWireRoutePointsRef.current[wire.id];
        if (!originalRoutePoints) return wire;

        return {
          ...wire,
          routePoints: originalRoutePoints.map(point => ({
            x: point.x + groupDeltaX,
            y: point.y + groupDeltaY
          }))
        };
      });

      useStore.setState({
        components: updatedComponents,
        wires: updatedWires
      });
    } else if (draggedLabelComponentId) {
      const comp = components.find(c => c.id === draggedLabelComponentId);
      if (comp) {
        const local = worldToComponentLocal(comp, x, y);
        const labelBaseY = getComponentLabelBaseY(comp) / GRID_SIZE;
        let targetX = (local.x / GRID_SIZE) - dragOffset.x;
        let targetY = (local.y / GRID_SIZE) - labelBaseY - dragOffset.y;

        if (snapToGrid) {
          targetX = Math.round(targetX * 2) / 2;
          targetY = Math.round(targetY * 2) / 2;
        }

        updateComponentLabelOffset(draggedLabelComponentId, targetX, targetY);
      }
    } else if (draggedComponentId) {
      if (draggedComponentId.startsWith('text_')) {
        let targetX = dragGrid.x - dragOffset.x;
        let targetY = dragGrid.y - dragOffset.y;

        if (snapToGrid) {
          targetX = Math.round(targetX);
          targetY = Math.round(targetY);
        }

        updateTextPosition(draggedComponentId, targetX, targetY);
      } else {
        let targetX = dragGrid.x - dragOffset.x;
        let targetY = dragGrid.y - dragOffset.y;

        if (snapToGrid) {
          targetX = Math.round(targetX);
          targetY = Math.round(targetY);
        }

        updateComponentPosition(draggedComponentId, targetX, targetY);
      }
    } else if (draggedWireId) {
      const wire = wires.find(w => w.id === draggedWireId);
      if (wire?.routePoints && draggedWireRoutePointIndex !== null) {
        let targetX = dragGrid.x - dragOffset.x;
        let targetY = dragGrid.y - dragOffset.y;

        if (snapToGrid) {
          targetX = Math.round(targetX);
          targetY = Math.round(targetY);
        }

        updateWireRoutePoint(draggedWireId, draggedWireRoutePointIndex, targetX, targetY);
        return;
      }

      const compFrom = components.find(c => c.id === wire?.from.componentId);
      const termFrom = compFrom?.terminals.find(t => t.id === wire?.from.terminalId);
      if (wire && termFrom) {
        let targetOffset = wire.verticalFirst
          ? (dragGrid.y - termFrom.y - dragOffset.y)
          : (dragGrid.x - termFrom.x - dragOffset.x);

        if (snapToGrid) {
          targetOffset = Math.round(targetOffset);
        }

        updateWireBendOffset(draggedWireId, targetOffset);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsPanning(false);
    setIsDraggingGroup(false);
    setDraggedComponentId(null);
    setDraggedLabelComponentId(null);
    setDraggedWireId(null);
    setDraggedWireRoutePointIndex(null);
    groupDragStartRef.current = null;
    groupWireRoutePointsRef.current = {};

    // Se soltou o botão direito: abre o menu de contexto customizado
    if (e.button === 2) {
      e.preventDefault();
      const { x, y, gridX, gridY } = getGridCoordsFromEvent(e);
      const clickedId = trySelectElementAt(x, y);
      const rect = containerRef.current?.getBoundingClientRect();
      const menuX = e.clientX - (rect?.left ?? 0);
      const menuY = e.clientY - (rect?.top ?? 0);

      setContextMenu({
        visible: true,
        x: menuX,
        y: menuY,
        componentId: clickedId || '',
        gridX,
        gridY
      });
      return;
    }

    // Se soltou o botão esquerdo e a caixa de seleção estava ativa
    if (e.button === 0 && selectionBox) {
      const dx = Math.abs(selectionBox.currentX - selectionBox.startX);
      const dy = Math.abs(selectionBox.currentY - selectionBox.startY);

      if (dx > 5 || dy > 5) {
        // Foi um arraste com o botão esquerdo: calcula seleção de lasso
        const canvas = canvasRef.current;
        if (canvas) {
          const x1 = Math.min(selectionBox.startX, selectionBox.currentX);
          const x2 = Math.max(selectionBox.startX, selectionBox.currentX);
          const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
          const y2 = Math.max(selectionBox.startY, selectionBox.currentY);

          // Limites mundiais (world coordinates)
          const wX1 = (x1 / viewport.zoom) - viewport.x;
          const wX2 = (x2 / viewport.zoom) - viewport.x;
          const wY1 = (y1 / viewport.zoom) - viewport.y;
          const wY2 = (y2 / viewport.zoom) - viewport.y;

          // Seleciona componentes dentro do lasso
          const newlySelectedCompIds = components.filter(comp => {
            const cx = comp.x * GRID_SIZE;
            const cy = comp.y * GRID_SIZE;
            return cx >= wX1 && cx <= wX2 && cy >= wY1 && cy <= wY2;
          }).map(c => c.id);

          // Seleciona fios cujos terminais de origem e destino estejam na caixa
          const newlySelectedWireIds = wires.filter(wire => {
            const compFrom = components.find(c => c.id === wire.from.componentId);
            const compTo = components.find(c => c.id === wire.to.componentId);
            if (compFrom && compTo) {
              const tFrom = compFrom.terminals.find(t => t.id === wire.from.terminalId);
              const tTo = compTo.terminals.find(t => t.id === wire.to.terminalId);
              if (tFrom && tTo) {
                const fx = tFrom.x * GRID_SIZE;
                const fy = tFrom.y * GRID_SIZE;
                const tx = tTo.x * GRID_SIZE;
                const ty = tTo.y * GRID_SIZE;
                return fx >= wX1 && fx <= wX2 && fy >= wY1 && fy <= wY2 &&
                       tx >= wX1 && tx <= wX2 && ty >= wY1 && ty <= wY2;
              }
            }
            return false;
          }).map(w => w.id);

          setSelectedComponentIds(newlySelectedCompIds);
          setSelectedWireIds(newlySelectedWireIds);

          if (newlySelectedCompIds.length === 1 && newlySelectedWireIds.length === 0) {
            setSelectedComponentId(newlySelectedCompIds[0]);
          } else {
            setSelectedComponentId(null);
          }
        }
      } else {
        // Foi um clique simples no vazio: limpa seleções
        setSelectedComponentIds([]);
        setSelectedWireIds([]);
        setSelectedComponentId(null);
      }
      setSelectionBox(null);
    }
  };

  // Zoom no scroll centrado na posição do mouse
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Coordenadas sob o mouse
    const worldX = (mouseX / viewport.zoom) - viewport.x;
    const worldY = (mouseY / viewport.zoom) - viewport.y;

    const zoomFactor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    const nextZoom = Math.max(0.4, Math.min(viewport.zoom * zoomFactor, 3.0));

    // Corrige pan para manter o ponto do mouse estacionário durante zoom
    const nextPanX = (mouseX / nextZoom) - worldX;
    const nextPanY = (mouseY / nextZoom) - worldY;

    setViewport({
      zoom: nextZoom,
      x: nextPanX,
      y: nextPanY
    });
  };

  // Escuta atalhos de teclado como R (girar) e Delete (excluir)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se o foco está em inputs de texto
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Ctrl + Z / Ctrl + Y (Undo / Redo)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      // Rotação (tecla R ou tecla + do teclado numérico/comum)
      if ((e.key.toLowerCase() === 'r' || e.key === '+') && selectedComponentId) {
        e.preventDefault();
        const deltaRotation = e.altKey ? 180 : (e.shiftKey ? -90 : 90);
        updateComponentRotation(selectedComponentId, deltaRotation);
      }

      // Espelhamento X (tecla X)
      if (e.key.toLowerCase() === 'x' && selectedComponentId) {
        e.preventDefault();
        toggleComponentMirrorX(selectedComponentId);
      }

      // Espelhamento Y (tecla Y)
      if (e.key.toLowerCase() === 'y' && selectedComponentId) {
        e.preventDefault();
        toggleComponentMirrorY(selectedComponentId);
      }

      // Ctrl + A (Selecionar Tudo)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedComponentIds(components.map(c => c.id));
        setSelectedWireIds(wires.map(w => w.id));
      }

      // Ctrl + C (Copiar)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopImmediatePropagation();
        copyActiveSelection();
      }

      // Ctrl + V (Colar)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (storeClipboard) {
          pasteActiveClipboard({ x: mouseGridPos.x, y: mouseGridPos.y });
        } else if (clipboard) {
          handlePasteAction(mouseGridPos.x, mouseGridPos.y);
        }
      }

      // Ctrl + D (Duplicar)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        e.stopImmediatePropagation();
        duplicateActiveSelection();
      }

      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (selectedComponentIds.length > 0 || selectedWireIds.length > 0) {
          const wiresToKeep = wires.filter(w => !selectedWireIds.includes(w.id));
          const activeComponents = components.filter(c => !selectedComponentIds.includes(c.id));
          const finalWires = wiresToKeep.filter(w => 
            activeComponents.some(c => c.id === w.from.componentId) && 
            activeComponents.some(c => c.id === w.to.componentId)
          );
          
          useStore.setState({
            components: activeComponents,
            wires: finalWires
          });
          setSelectedComponentIds([]);
          setSelectedWireIds([]);
        } else if (selectedComponentId) {
          removeComponent(selectedComponentId);
        } else if (selectedWireId) {
          removeWire(selectedWireId);
        } else if (selectedTextId) {
          removeText(selectedTextId);
        }
      }

      // Segurar Barra de Espaço para Pan
      if (e.key === ' ') {
        if (activeTool === 'wire' && wireStart) {
          e.preventDefault();
          setTempVerticalFirst(prev => !prev);
        } else {
          e.preventDefault();
          setIsSpacePressed(true);
        }
      }

      // Atalho W para Ferramenta Fio
      if (e.key.toLowerCase() === 'w') {
        setActiveTool('wire');
      }
      // Atalho V para Ferramenta Cursor
      if (e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      }
      // Atalho T para Ferramenta Texto
      if (e.key.toLowerCase() === 't') {
        setActiveTool('text');
      }
      // ESC para cancelar desenho de fio e retornar para ferramenta Cursor (select)
      if (e.key === 'Escape') {
        e.preventDefault();
        setWireStart(null);
        setWireRoutePoints([]);
        setTempVerticalFirst(false);
        setActiveTool('select');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  // Keyboard listeners deliberately close over the latest editor state listed below; local action
  // handlers are omitted because they are recreated every render and only delegate to store actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedComponentId,
    selectedWireId,
    components,
    wires,
    removeComponent,
    removeWire,
    updateComponentRotation,
    setActiveTool,
    clipboard,
    storeClipboard,
    mouseGridPos,
    toggleComponentMirrorX,
    toggleComponentMirrorY,
    activeTool,
    wireStart,
    tempVerticalFirst,
    isSpacePressed,
    selectedComponentIds,
    selectedWireIds,
    copyStoreItems,
    pasteStoreSelection
  ]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{
          cursor: isPanning 
            ? 'grabbing' 
            : (isSpacePressed 
                ? 'grab' 
                : (isHoveringTerminal || activeTool === 'wire' ? 'crosshair' : (activeTool === 'select' ? 'default' : 'crosshair')))
        }}
        className="block w-full h-full touch-none"
      />
      {contextMenu?.visible && (
        <div
          style={{
            position: 'absolute',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000
          }}
          className="w-44 py-1.5 rounded-xl shadow-2xl backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-xs flex flex-col gap-0.5 bg-white/90 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100"
        >
          {contextMenu.componentId ? (
            isWireId(contextMenu.componentId) ? (
              <>
                <button
                  onClick={() => {
                    toggleWireRoute(contextMenu.componentId);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Inverter Curva</span>
                </button>
                <hr className="my-1 border-slate-200/50 dark:border-slate-700/50" />
                <button
                  onClick={() => {
                    removeWire(contextMenu.componentId);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 transition-colors cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Fio</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setPropertiesModalCompId(contextMenu.componentId);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Editar Propriedades</span>
                </button>
                <hr className="my-0.5 border-slate-200/50 dark:border-slate-700/50" />
                <button
                  onClick={() => handleRotateAction(contextMenu.componentId, 90)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Girar horário (90°)</span>
                </button>
                <button
                  onClick={() => handleRotateAction(contextMenu.componentId, -90)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-indigo-500 -scale-x-100" />
                  <span>Girar anti-horário</span>
                </button>
                <button
                  onClick={() => handleRotateAction(contextMenu.componentId, 180)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Girar 180°</span>
                </button>
                <button
                  onClick={() => {
                    toggleComponentMirrorX(contextMenu.componentId);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-cyan-500 -scale-x-100" />
                  <span>Espelhar X (Mirror X)</span>
                </button>
                <button
                  onClick={() => {
                    toggleComponentMirrorY(contextMenu.componentId);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-sky-500 -scale-y-100" />
                  <span>Espelhar Y (Mirror Y)</span>
                </button>
                <button
                  onClick={() => {
                    if (isContextComponentInMultiSelection(contextMenu.componentId)) {
                      copyActiveSelection();
                      setContextMenu(null);
                    } else {
                      handleCopyAction(contextMenu.componentId);
                    }
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-blue-500" />
                  <span>Copiar</span>
                </button>
                <button
                  onClick={() => {
                    if (isContextComponentInMultiSelection(contextMenu.componentId)) {
                      duplicateActiveSelection();
                      setContextMenu(null);
                    } else {
                      handleDuplicateAction(contextMenu.componentId);
                    }
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Duplicar</span>
                </button>
                <hr className="my-1 border-slate-200/50 dark:border-slate-700/50" />
                <button
                  onClick={() => handleRemoveAction(contextMenu.componentId)}
                  className="w-full px-3 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 transition-colors cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              </>
            )
          ) : (
            <>
              <button
                onClick={() => {
                  setSelectedComponentIds(components.map(c => c.id));
                  setSelectedWireIds(wires.map(w => w.id));
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>Selecionar Tudo</span>
              </button>
              <hr className="my-0.5 border-slate-200/50 dark:border-slate-700/50" />
              <button
                  onClick={() => {
                    if (storeClipboard) {
                      pasteActiveClipboard({ x: contextMenu.gridX, y: contextMenu.gridY });
                      setContextMenu(null);
                    } else {
                      handlePasteAction(contextMenu.gridX, contextMenu.gridY);
                    }
                }}
                disabled={!storeClipboard && !clipboard}
                className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <PasteIcon className="w-3.5 h-3.5 text-indigo-500" />
                <span>Colar</span>
              </button>
            </>
          )}
        </div>
      )}

      {propertiesModalCompId && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col backdrop-blur-md text-slate-800 dark:text-slate-100">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold font-mono text-xs">
                  {components.find(c => c.id === propertiesModalCompId)?.type.substring(0, 3).toUpperCase() || 'COMP'}
                </div>
                <div className="flex-1">
                  <input
                    autoFocus
                    type="text"
                    value={components.find(c => c.id === propertiesModalCompId)?.name || ''}
                    onChange={(e) => updateComponentName(propertiesModalCompId, e.target.value)}
                    className="text-sm font-bold w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition-colors px-1 -ml-1 text-slate-800 dark:text-slate-100"
                    placeholder="Nome do Componente"
                  />
                  <p className="text-[10px] text-slate-400 font-mono">
                    {propertiesModalCompId}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPropertiesModalCompId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg cursor-pointer bg-transparent border-0 outline-none"
              >
                &times;
              </button>
            </div>

            {/* Corpo */}
            <div className="px-5 py-4 space-y-4 max-h-[350px] overflow-y-auto">
              {components.find(c => c.id === propertiesModalCompId) && Object.entries(components.find(c => c.id === propertiesModalCompId)!.properties).map(([key, prop]) => (
                <div key={key} className="flex flex-col space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {prop.label}
                  </label>
                  <div className="flex items-center space-x-2">
                    {prop.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(prop.value)}
                        onChange={(e) => {
                          updateComponentProperty(propertiesModalCompId, key, e.target.checked);
                        }}
                        className="rounded text-indigo-600 bg-slate-100 dark:bg-slate-800 outline-none w-4 h-4 cursor-pointer"
                      />
                    ) : prop.type === 'select' ? (
                      <select
                        value={String(prop.value)}
                        onChange={(e) => {
                          updateComponentProperty(propertiesModalCompId, key, e.target.value);
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
                          updateComponentProperty(propertiesModalCompId, key, val);
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

            {/* Rodapé */}
            <div className="px-5 py-3 border-t border-slate-200/50 dark:border-slate-800/50 flex items-center justify-end bg-slate-50/50 dark:bg-slate-950/20">
              <button
                onClick={() => setPropertiesModalCompId(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer border-0"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Input de Texto */}
      {textPrompt.visible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-[400px] border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {textPrompt.mode === 'add' ? 'Adicionar Texto' : 'Editar Texto'}
              </h3>
            </div>
            <div className="p-4">
              <textarea
                value={textPrompt.text}
                onChange={(e) => setTextPrompt({ ...textPrompt, text: e.target.value })}
                className="w-full h-32 p-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 resize-none"
                placeholder="Digite o texto aqui..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (textPrompt.text.trim()) {
                      if (textPrompt.mode === 'add') {
                        addText({
                          id: `text_${Date.now()}`,
                          text: textPrompt.text.trim(),
                          x: textPrompt.gridX!,
                          y: textPrompt.gridY!,
                          size: 14
                        });
                        setActiveTool('select');
                      } else if (textPrompt.mode === 'edit' && textPrompt.targetId) {
                        updateText(textPrompt.targetId, textPrompt.text.trim());
                      }
                    }
                    setTextPrompt({ visible: false, text: '', mode: 'add' });
                  } else if (e.key === 'Escape') {
                    setTextPrompt({ visible: false, text: '', mode: 'add' });
                  }
                }}
              />
            </div>
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                onClick={() => setTextPrompt({ visible: false, text: '', mode: 'add' })}
              >
                CANCELAR
              </button>
              <button
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                onClick={() => {
                  if (textPrompt.text.trim()) {
                    if (textPrompt.mode === 'add') {
                      addText({
                        id: `text_${Date.now()}`,
                        text: textPrompt.text.trim(),
                        x: textPrompt.gridX!,
                        y: textPrompt.gridY!,
                        size: 14
                      });
                      setActiveTool('select');
                    } else if (textPrompt.mode === 'edit' && textPrompt.targetId) {
                      updateText(textPrompt.targetId, textPrompt.text.trim());
                    }
                  }
                  setTextPrompt({ visible: false, text: '', mode: 'add' });
                }}
              >
                SALVAR
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
