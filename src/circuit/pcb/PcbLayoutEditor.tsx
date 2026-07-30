import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { RotateCw, Route, MousePointer2, Maximize } from 'lucide-react';
import type { CircuitComponent, CircuitWire, PcbLayoutComponent, PcbRoute } from '../../types/circuit';

const PX_PER_UNIT = 32;

interface PcbLayoutEditorProps {
  components: CircuitComponent[];
  wires: CircuitWire[];
  boardName: string;
  boardDimensions: { width: number; height: number };
  boardColor: string;
  layout: Record<string, PcbLayoutComponent>;
  setLayout: (layout: Record<string, PcbLayoutComponent>) => void;
  routes: Record<string, PcbRoute>;
  setRoutes: (routes: Record<string, PcbRoute>) => void;
}

export default function PcbLayoutEditor({
  components,
  wires,
  boardName,
  boardDimensions,
  boardColor,
  layout,
  setLayout,
  routes,
  setRoutes
}: PcbLayoutEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [tool, setTool] = useState<'select' | 'route'>('select');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => setDimensions({
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight)
    });

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const boardRect = useMemo(() => {
    const width = boardDimensions.width * PX_PER_UNIT;
    const height = boardDimensions.height * PX_PER_UNIT;
    return {
      x: (dimensions.width - width) / 2,
      y: (dimensions.height - height) / 2,
      width,
      height
    };
  }, [boardDimensions, dimensions]);

  const getFallbackLayout = () => {
    if (components.length === 0) return {};

    const cols = Math.max(1, Math.ceil(Math.sqrt(components.length)));
    const spacingX = Math.max(1.6, boardDimensions.width / (cols + 1));
    const rows = Math.ceil(components.length / cols);
    const spacingY = Math.max(1.4, boardDimensions.height / (rows + 1));

    return Object.fromEntries(components.map((comp, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return [comp.id, {
        x: -boardDimensions.width / 2 + spacingX * (col + 1),
        y: -boardDimensions.height / 2 + spacingY * (row + 1),
        rotation: comp.rotation
      }];
    }));
  };

  const effectiveLayout = useMemo(() => ({
    ...getFallbackLayout(),
    ...layout
  }), [components, layout, boardDimensions]);

  const boardToScreen = (x: number, y: number) => ({
    x: boardRect.x + boardRect.width / 2 + x * PX_PER_UNIT,
    y: boardRect.y + boardRect.height / 2 + y * PX_PER_UNIT
  });

  const screenToBoard = (x: number, y: number) => ({
    x: (x - boardRect.x - boardRect.width / 2) / PX_PER_UNIT,
    y: (y - boardRect.y - boardRect.height / 2) / PX_PER_UNIT
  });

  const getComponentAt = (x: number, y: number) => {
    for (let i = components.length - 1; i >= 0; i--) {
      const comp = components[i];
      const pos = effectiveLayout[comp.id];
      if (!pos) continue;
      const screen = boardToScreen(pos.x, pos.y);
      if (Math.abs(x - screen.x) <= 24 && Math.abs(y - screen.y) <= 18) return comp;
    }
    return null;
  };

  const getTerminalPosition = (comp: CircuitComponent, terminalId: string) => {
    const pos = effectiveLayout[comp.id];
    const term = comp.terminals.find(item => item.id === terminalId);
    if (!pos || !term) return null;

    const angle = ((pos.rotation ?? comp.rotation) * Math.PI) / 180;
    const relX = term.relX * 0.35;
    const relY = term.relY * 0.35;
    return {
      x: pos.x + relX * Math.cos(angle) - relY * Math.sin(angle),
      y: pos.y + relX * Math.sin(angle) + relY * Math.cos(angle)
    };
  };

  const autoPlace = () => {
    setLayout(getFallbackLayout());
  };

  const rotateSelected = () => {
    if (!selectedComponentId) return;
    const comp = components.find(item => item.id === selectedComponentId);
    const current = effectiveLayout[selectedComponentId];
    if (!comp || !current) return;

    setLayout({
      ...layout,
      [selectedComponentId]: {
        ...current,
        rotation: (((current.rotation ?? comp.rotation) + 90) % 360 + 360) % 360
      }
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    ctx.fillStyle = boardColor;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.fillRect(boardRect.x, boardRect.y, boardRect.width, boardRect.height);
    ctx.strokeRect(boardRect.x, boardRect.y, boardRect.width, boardRect.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    for (let x = boardRect.x; x <= boardRect.x + boardRect.width; x += PX_PER_UNIT) {
      ctx.beginPath();
      ctx.moveTo(x, boardRect.y);
      ctx.lineTo(x, boardRect.y + boardRect.height);
      ctx.stroke();
    }
    for (let y = boardRect.y; y <= boardRect.y + boardRect.height; y += PX_PER_UNIT) {
      ctx.beginPath();
      ctx.moveTo(boardRect.x, y);
      ctx.lineTo(boardRect.x + boardRect.width, y);
      ctx.stroke();
    }

    wires.forEach(wire => {
      const fromComp = components.find(comp => comp.id === wire.from.componentId);
      const toComp = components.find(comp => comp.id === wire.to.componentId);
      if (!fromComp || !toComp) return;
      const from = getTerminalPosition(fromComp, wire.from.terminalId);
      const to = getTerminalPosition(toComp, wire.to.terminalId);
      if (!from || !to) return;

      const route = routes[wire.id]?.points;
      const path = [from, ...(route || []), to].map(point => boardToScreen(point.x, point.y));
      ctx.beginPath();
      path.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = routes[wire.id] ? '#d97706' : 'rgba(248,250,252,0.55)';
      ctx.setLineDash(routes[wire.id] ? [] : [5, 5]);
      ctx.lineWidth = selectedWireId === wire.id ? 4 : 2;
      ctx.stroke();
      ctx.setLineDash([]);
    });

    components.forEach(comp => {
      const pos = effectiveLayout[comp.id];
      if (!pos) return;
      const screen = boardToScreen(pos.x, pos.y);
      const isSelected = selectedComponentId === comp.id;

      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(((pos.rotation ?? comp.rotation) * Math.PI) / 180);
      ctx.fillStyle = isSelected ? '#e0e7ff' : '#f8fafc';
      ctx.strokeStyle = isSelected ? '#6366f1' : '#334155';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.roundRect(-24, -16, 48, 32, 5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      comp.terminals.forEach(term => {
        const termPos = getTerminalPosition(comp, term.id);
        if (!termPos) return;
        const termScreen = boardToScreen(termPos.x, termPos.y);
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#92400e';
        ctx.beginPath();
        ctx.arc(termScreen.x, termScreen.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(comp.name, screen.x, screen.y + 28);
    });
  }, [components, wires, dimensions, boardRect, boardColor, effectiveLayout, routes, selectedComponentId, selectedWireId]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const comp = getComponentAt(mouseX, mouseY);

    if (comp) {
      const pos = effectiveLayout[comp.id];
      setSelectedComponentId(comp.id);
      setSelectedWireId(null);
      setDrag({ id: comp.id, offsetX: mouseX - boardToScreen(pos.x, pos.y).x, offsetY: mouseY - boardToScreen(pos.x, pos.y).y });
      return;
    }

    if (tool === 'route') {
      const boardPoint = screenToBoard(mouseX, mouseY);
      const nextWire = wires.find(wire => selectedWireId === wire.id) || wires[0];
      if (nextWire) {
        setSelectedWireId(nextWire.id);
        setRoutes({
          ...routes,
          [nextWire.id]: {
            points: [...(routes[nextWire.id]?.points || []), boardPoint]
          }
        });
      }
    }
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left - drag.offsetX;
    const mouseY = event.clientY - rect.top - drag.offsetY;
    const boardPoint = screenToBoard(mouseX, mouseY);
    const comp = components.find(item => item.id === drag.id);
    const current = effectiveLayout[drag.id];
    if (!comp || !current) return;

    setLayout({
      ...layout,
      [drag.id]: {
        x: Math.max(-boardDimensions.width / 2, Math.min(boardDimensions.width / 2, boardPoint.x)),
        y: Math.max(-boardDimensions.height / 2, Math.min(boardDimensions.height / 2, boardPoint.y)),
        rotation: current.rotation ?? comp.rotation
      }
    });
  };

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col bg-slate-100 dark:bg-slate-950">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-xs">
        <span className="font-bold text-slate-700 dark:text-slate-200 mr-2">{boardName}</span>
        <button onClick={() => setTool('select')} className={`flex items-center gap-1 px-2 py-1 rounded ${tool === 'select' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
          <MousePointer2 size={13} />
          <span>Posicionar</span>
        </button>
        <button onClick={() => setTool('route')} className={`flex items-center gap-1 px-2 py-1 rounded ${tool === 'route' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
          <Route size={13} />
          <span>Trilhas</span>
        </button>
        <button onClick={rotateSelected} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
          <RotateCw size={13} />
          <span>Girar</span>
        </button>
        <button onClick={autoPlace} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 ml-auto">
          <Maximize size={13} />
          <span>Auto posicionar</span>
        </button>
        {selectedWireId && (
          <button onClick={() => setRoutes({ ...routes, [selectedWireId]: { points: [] } })} className="px-2 py-1 rounded bg-amber-100 text-amber-800">
            Limpar trilha
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
        className="flex-1 cursor-crosshair"
      />
    </div>
  );
}
