import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { RotateCw, Route, MousePointer2, Maximize, Move, Trash2, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import type { CircuitComponent, CircuitWire, PcbLayoutComponent, PcbRoute } from '../../types/circuit';
import { getPcbConnections, getPcbPhysicalComponents } from './pcbNetlist';

const PX_PER_UNIT = 32;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.8;
const TOP_COPPER = '#FF0000';     // Classic Proteus Red
const BOTTOM_COPPER = '#0000FF';  // Classic Proteus Blue
const AIRWIRE = '#00FF00';        // Classic Proteus Green Ratsnest
const PROTEUS_BG = '#000000';     // Black background
const PROTEUS_GRID_MAJOR = '#222222';
const PROTEUS_GRID_MINOR = '#111111';
const PROTEUS_OUTLINE = '#FFFF00'; // Yellow outline
const PROTEUS_SILK = '#00FFFF';    // Classic Cyan Silk
const PROTEUS_PAD = '#FF00FF';     // Magenta pads
const PROTEUS_PAD_HOLE = '#000000'; // Black holes

const ROUTE_COLOR_PRESETS = [
  { label: 'Top Copper (Red)', value: TOP_COPPER },
  { label: 'Bottom Copper (Blue)', value: BOTTOM_COPPER },
  { label: 'Inner 1', value: '#008000' },
  { label: 'Inner 2', value: '#800080' },
  { label: 'Silk', value: PROTEUS_SILK },
  { label: 'White', value: '#ffffff' }
];

type PcbLayer = 'top' | 'bottom';
type BoardPoint = { x: number; y: number };
type RouteDrag =
  | {
      kind: 'point';
      wireId: string;
      pointIndex: number;
      startMouse: BoardPoint;
      startPoints: BoardPoint[];
    }
  | {
      kind: 'segment';
      wireId: string;
      segmentIndex: number;
      orientation: 'horizontal' | 'vertical' | 'free';
      startMouse: BoardPoint;
      startPoints: BoardPoint[];
    };
type ComponentDrag = { id: string; offsetX: number; offsetY: number };

interface FootprintSpec {
  ref: string;
  kind: 'axial' | 'diode' | 'terminal' | 'testpoint' | 'via' | 'capacitor' | 'ic' | 'generic';
  width: number;
  height: number;
  padShape?: 'round' | 'square' | 'oval';
}

interface PcbLayoutEditorProps {
  components: CircuitComponent[];
  wires: CircuitWire[];
  boardName: string;
  boardDimensions: { width: number; height: number };
  showMountingHoles: boolean;
  mountingHoleDiameter: number;
  mountingHoleMargin: number;
  showSolderPads: boolean;
  solderPadDiameter: number;
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
  showMountingHoles,
  mountingHoleDiameter,
  mountingHoleMargin,
  showSolderPads,
  solderPadDiameter,
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
  const [drag, setDrag] = useState<ComponentDrag | null>(null);
  const [routeDrag, setRouteDrag] = useState<RouteDrag | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [panStart, setPanStart] = useState<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);
  const [activeLayer, setActiveLayer] = useState<PcbLayer>('top');
  const [trackWidth, setTrackWidth] = useState(0.18);
  const [showRatsnest, setShowRatsnest] = useState(true);
  const [routeMenu, setRouteMenu] = useState<{ x: number; y: number; wireId: string } | null>(null);

  const pcbComponents = useMemo(
    () => getPcbPhysicalComponents(components),
    [components]
  );

  const pcbWires = useMemo(
    () => getPcbConnections(components, wires),
    [components, wires]
  );

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        setIsSpacePressed(true);
        return;
      }

      if (event.code === 'Escape') {
        event.preventDefault();
        finishPointerAction();
        setRouteMenu(null);
        setSelectedWireId(null);
        setSelectedComponentId(null);
        return;
      }

      if ((event.code === 'Delete' || event.code === 'Backspace') && selectedWireId && routes[selectedWireId]) {
        event.preventDefault();
        const nextRoutes = { ...routes };
        delete nextRoutes[selectedWireId];
        setRoutes(nextRoutes);
        setSelectedWireId(null);
        setRouteMenu(null);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setIsSpacePressed(false);
        finishPointerAction();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [routes, selectedWireId]);

  const boardRect = useMemo(() => {
    const width = boardDimensions.width * PX_PER_UNIT * zoom;
    const height = boardDimensions.height * PX_PER_UNIT * zoom;
    return {
      x: (dimensions.width - width) / 2 + pan.x,
      y: (dimensions.height - height) / 2 + pan.y,
      width,
      height
    };
  }, [boardDimensions, dimensions, pan, zoom]);

  const getFallbackLayout = () => {
    if (pcbComponents.length === 0) return {};

    const cols = Math.max(1, Math.ceil(Math.sqrt(pcbComponents.length)));
    const spacingX = Math.max(1.6, boardDimensions.width / (cols + 1));
    const rows = Math.ceil(pcbComponents.length / cols);
    const spacingY = Math.max(1.4, boardDimensions.height / (rows + 1));

    return Object.fromEntries(pcbComponents.map((comp, index) => {
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
  }), [pcbComponents, layout, boardDimensions]);

  const boardToScreen = (x: number, y: number) => ({
    x: boardRect.x + boardRect.width / 2 + x * PX_PER_UNIT * zoom,
    y: boardRect.y + boardRect.height / 2 + y * PX_PER_UNIT * zoom
  });

  const screenToBoard = (x: number, y: number) => ({
    x: (x - boardRect.x - boardRect.width / 2) / (PX_PER_UNIT * zoom),
    y: (y - boardRect.y - boardRect.height / 2) / (PX_PER_UNIT * zoom)
  });

  const clampToBoard = (point: BoardPoint) => ({
    x: Math.max(-boardDimensions.width / 2, Math.min(boardDimensions.width / 2, point.x)),
    y: Math.max(-boardDimensions.height / 2, Math.min(boardDimensions.height / 2, point.y))
  });

  const getComponentAt = (x: number, y: number) => {
    for (let i = pcbComponents.length - 1; i >= 0; i--) {
      const comp = pcbComponents[i];
      const pos = effectiveLayout[comp.id];
      if (!pos) continue;
      const screen = boardToScreen(pos.x, pos.y);
      const fp = getFootprintSpec(comp);
      if (Math.abs(x - screen.x) <= (fp.width / 2 + 10) * zoom && Math.abs(y - screen.y) <= (fp.height / 2 + 10) * zoom) return comp;
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

  const getTerminalAt = (screenX: number, screenY: number) => {
    for (let i = pcbComponents.length - 1; i >= 0; i--) {
      const comp = pcbComponents[i];
      for (let t = comp.terminals.length - 1; t >= 0; t--) {
        const term = comp.terminals[t];
        const position = getTerminalPosition(comp, term.id);
        if (!position) continue;
        const screen = boardToScreen(position.x, position.y);
        if (Math.hypot(screenX - screen.x, screenY - screen.y) <= Math.max(12, (solderPadDiameter / 20) * PX_PER_UNIT * zoom + 8)) {
          return { componentId: comp.id, terminalId: term.id };
        }
      }
    }

    return null;
  };

  const findWireForTerminal = (componentId: string, terminalId: string) => {
    const isTerminal = (endpoint: CircuitWire['from']) => endpoint.componentId === componentId && endpoint.terminalId === terminalId;
    return (
      pcbWires.find(wire => selectedWireId === wire.id && (isTerminal(wire.from) || isTerminal(wire.to))) ??
      pcbWires.find(wire => !routes[wire.id] && (isTerminal(wire.from) || isTerminal(wire.to))) ??
      pcbWires.find(wire => isTerminal(wire.from) || isTerminal(wire.to)) ??
      null
    );
  };

  const autoPlace = () => {
    setLayout(getFallbackLayout());
    setSelectedComponentId(null);
    setSelectedWireId(null);
  };

  const isPcbWireRoute = (routeId: string) => pcbWires.some(wire => wire.id === routeId);
  const isManualRoute = (routeId: string) => Boolean(routes[routeId]?.manual) || (!isPcbWireRoute(routeId) && Boolean(routes[routeId]));
  const createManualRouteId = () => `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const getWireEndpoints = (wire: CircuitWire) => {
    const fromComp = pcbComponents.find(comp => comp.id === wire.from.componentId);
    const toComp = pcbComponents.find(comp => comp.id === wire.to.componentId);
    if (!fromComp || !toComp) return null;

    const from = getTerminalPosition(fromComp, wire.from.terminalId);
    const to = getTerminalPosition(toComp, wire.to.terminalId);
    if (!from || !to) return null;

    return { from, to };
  };

  const makeOrthogonalRoute = (wire: CircuitWire): PcbRoute | null => {
    const endpoints = getWireEndpoints(wire);
    if (!endpoints) return null;

    const { from, to } = endpoints;
    if (Math.abs(from.x - to.x) < 0.01 || Math.abs(from.y - to.y) < 0.01) {
      return { points: [] };
    }

    const horizontalFirst = Math.abs(from.x - to.x) >= Math.abs(from.y - to.y);
    return {
      points: horizontalFirst
        ? [{ x: to.x, y: from.y }]
        : [{ x: from.x, y: to.y }],
      layer: activeLayer,
      width: trackWidth
    };
  };

  const autoRouteWire = (wireId: string) => {
    const wire = pcbWires.find(item => item.id === wireId);
    if (!wire) return;

    const route = makeOrthogonalRoute(wire);
    if (!route) return;

    setRoutes({
      ...routes,
      [wireId]: route
    });
  };

  const autoRouteAll = () => {
    const nextRoutes: Record<string, PcbRoute> = {};
    pcbWires.forEach(wire => {
      const route = makeOrthogonalRoute(wire);
      if (route) nextRoutes[wire.id] = route;
    });
    setRoutes(nextRoutes);
  };

  const setLayerForSelection = (layer: PcbLayer) => {
    setActiveLayer(layer);
    if (!selectedWireId) return;

    if (isManualRoute(selectedWireId)) {
      updateRouteById(selectedWireId, { layer });
      return;
    }

    const selectedWire = pcbWires.find(wire => wire.id === selectedWireId);
    if (!selectedWire) return;

    const existingRoute = routes[selectedWireId];
    const route = existingRoute ?? makeOrthogonalRoute(selectedWire);
    if (!route) return;

    setRoutes({
      ...routes,
      [selectedWireId]: {
        ...route,
        layer,
        width: route.width ?? trackWidth
      }
    });
  };

  const setTrackWidthForSelection = (width: number) => {
    setTrackWidth(width);
    if (!selectedWireId) return;

    if (isManualRoute(selectedWireId)) {
      updateRouteById(selectedWireId, { width });
      return;
    }

    const selectedWire = pcbWires.find(wire => wire.id === selectedWireId);
    if (!selectedWire) return;

    const existingRoute = routes[selectedWireId];
    const route = existingRoute ?? makeOrthogonalRoute(selectedWire);
    if (!route) return;

    setRoutes({
      ...routes,
      [selectedWireId]: {
        ...route,
        layer: route.layer ?? activeLayer,
        width
      }
    });
  };

  const updateRouteById = (wireId: string, patch: Partial<PcbRoute>) => {
    if (routes[wireId]?.manual || (!isPcbWireRoute(wireId) && routes[wireId])) {
      setRoutes({
        ...routes,
        [wireId]: {
          ...routes[wireId],
          ...patch
        }
      });
      return;
    }

    const selectedWire = pcbWires.find(wire => wire.id === wireId);
    if (!selectedWire) return;

    const existingRoute = routes[wireId];
    const route = existingRoute ?? makeOrthogonalRoute(selectedWire);
    if (!route) return;

    setRoutes({
      ...routes,
      [wireId]: {
        ...route,
        ...patch
      }
    });
  };

  const deleteRouteById = (wireId: string) => {
    const nextRoutes = { ...routes };
    delete nextRoutes[wireId];
    setRoutes(nextRoutes);
    if (selectedWireId === wireId) setSelectedWireId(null);
    setRouteMenu(null);
  };

  const clearSelectedRoute = () => {
    if (!selectedWireId) return;
    const nextRoutes = { ...routes };
    delete nextRoutes[selectedWireId];
    setRoutes(nextRoutes);
  };

  const clearAllRoutes = () => {
    setRoutes({});
    setSelectedWireId(null);
  };

  const getDistanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lengthSquared));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  };

  const getRoutePointAt = (screenX: number, screenY: number, wireId: string) => {
    const route = routes[wireId];
    if (!route) return null;

    for (let i = route.points.length - 1; i >= 0; i--) {
      const point = boardToScreen(route.points[i].x, route.points[i].y);
      if (Math.hypot(screenX - point.x, screenY - point.y) <= Math.max(10, 8 * zoom)) {
        return i;
      }
    }

    return null;
  };

  const getWireHitAt = (screenX: number, screenY: number) => {
    for (let i = pcbWires.length - 1; i >= 0; i--) {
      const wire = pcbWires[i];
      const endpoints = getWireEndpoints(wire);
      if (!endpoints) continue;

      const boardPath = [endpoints.from, ...(routes[wire.id]?.points || []), endpoints.to];
      const screenPath = boardPath.map(point => boardToScreen(point.x, point.y));
      for (let p = 0; p < screenPath.length - 1; p++) {
        const dist = getDistanceToSegment(screenX, screenY, screenPath[p].x, screenPath[p].y, screenPath[p + 1].x, screenPath[p + 1].y);
        const hitRadius = routes[wire.id]
          ? Math.max(18, ((routes[wire.id].width ?? 0.18) * PX_PER_UNIT * zoom) + 12)
          : 18;
        if (dist <= hitRadius) {
          return { wire, segmentIndex: p, boardPath };
        }
      }
    }
    return null;
  };

  const getManualRouteHitAt = (screenX: number, screenY: number) => {
    const manualIds = Object.keys(routes).filter(routeId => isManualRoute(routeId));
    for (let i = manualIds.length - 1; i >= 0; i--) {
      const routeId = manualIds[i];
      const route = routes[routeId];
      if (!route || route.points.length < 2) continue;

      const screenPath = route.points.map(point => boardToScreen(point.x, point.y));
      for (let p = 0; p < screenPath.length - 1; p++) {
        const dist = getDistanceToSegment(screenX, screenY, screenPath[p].x, screenPath[p].y, screenPath[p + 1].x, screenPath[p + 1].y);
        const hitRadius = Math.max(18, ((route.width ?? 0.18) * PX_PER_UNIT * zoom) + 12);
        if (dist <= hitRadius) {
          return { routeId, segmentIndex: p, boardPath: route.points };
        }
      }
    }

    return null;
  };

  const selectWire = (wire: CircuitWire) => {
    setSelectedWireId(wire.id);
    setActiveLayer(routes[wire.id]?.layer ?? activeLayer);
    setSelectedComponentId(null);
  };

  const selectRoute = (routeId: string) => {
    setSelectedWireId(routeId);
    setActiveLayer(routes[routeId]?.layer ?? activeLayer);
    setSelectedComponentId(null);
  };

  const getSegmentOrientation = (a: BoardPoint, b: BoardPoint): 'horizontal' | 'vertical' | 'free' => {
    if (Math.abs(a.x - b.x) < Math.abs(a.y - b.y) * 0.35) return 'vertical';
    if (Math.abs(a.y - b.y) < Math.abs(a.x - b.x) * 0.35) return 'horizontal';
    return 'free';
  };

  const insertRouteBend = (wireId: string, segmentIndex: number, point: BoardPoint, fallbackRoute?: PcbRoute) => {
    const route = fallbackRoute ?? routes[wireId];
    const endpoints = pcbWires.find(wire => wire.id === wireId);
    if (!endpoints) return null;

    const wireEnds = getWireEndpoints(endpoints);
    if (!wireEnds) return null;

    const existingPoints = route?.points ?? [];
    const path = [wireEnds.from, ...existingPoints, wireEnds.to];
    const start = path[segmentIndex];
    const end = path[segmentIndex + 1];
    if (!start || !end) return null;

    const horizontalFirst = Math.abs(start.x - end.x) >= Math.abs(start.y - end.y);
    const bendPoints = horizontalFirst
      ? [
          clampToBoard({ x: point.x, y: start.y }),
          clampToBoard({ x: point.x, y: end.y })
        ]
      : [
          clampToBoard({ x: start.x, y: point.y }),
          clampToBoard({ x: end.x, y: point.y })
        ];

    const insertIndex = segmentIndex;
    const points = [
      ...existingPoints.slice(0, insertIndex),
      ...bendPoints,
      ...existingPoints.slice(insertIndex)
    ];

    return {
      route: {
        ...route,
        points,
        layer: route?.layer ?? activeLayer,
        width: route?.width ?? trackWidth
      },
      pointIndex: insertIndex,
      points
    };
  };

  const getDrcIssues = () => {
    const issues: string[] = [];

    pcbComponents.forEach(comp => {
      const pos = effectiveLayout[comp.id];
      if (!pos) return;
      if (Math.abs(pos.x) > boardDimensions.width / 2 || Math.abs(pos.y) > boardDimensions.height / 2) {
        issues.push(`${comp.name} fora da placa`);
      }
      comp.terminals.forEach(term => {
        const termPos = getTerminalPosition(comp, term.id);
        if (!termPos) return;
        if (Math.abs(termPos.x) > boardDimensions.width / 2 || Math.abs(termPos.y) > boardDimensions.height / 2) {
          issues.push(`Pad ${term.label || term.id} de ${comp.name} fora da placa`);
        }
      });
    });

    pcbWires.forEach(wire => {
      const endpoints = getWireEndpoints(wire);
      if (!endpoints) return;
      const points = [endpoints.from, ...(routes[wire.id]?.points || []), endpoints.to];
      points.forEach(point => {
        if (Math.abs(point.x) > boardDimensions.width / 2 || Math.abs(point.y) > boardDimensions.height / 2) {
          issues.push(`Trilha ${wire.id} passa fora da placa`);
        }
      });
    });

    return issues;
  };

  const getFootprintSpec = (comp: CircuitComponent): FootprintSpec => {
    if (comp.type === 'resistor' || comp.type === 'pot') return { ref: 'R', kind: 'axial', width: 76, height: 24, padShape: 'round' };
    if (comp.type === 'zener') return { ref: 'ZD', kind: 'diode', width: 76, height: 24, padShape: 'square' };
    if (comp.type === 'diodo' || comp.type === 'led') return { ref: comp.type === 'led' ? 'LED' : 'D', kind: 'diode', width: 76, height: 24, padShape: 'square' };
    if (comp.type.startsWith('capacitor')) return { ref: 'C', kind: 'capacitor', width: 52, height: 44, padShape: 'round' };
    if (comp.type === 'inductor') return { ref: 'L', kind: 'axial', width: 76, height: 26, padShape: 'round' };
    if (comp.type === 'ground') return { ref: 'GND', kind: 'testpoint', width: 36, height: 36, padShape: 'square' };
    if (comp.type === 'junction') return { ref: 'VIA', kind: 'via', width: 22, height: 22, padShape: 'round' };
    if (comp.type === 'probe_dc' || comp.type === 'probe_ac') return { ref: 'TP', kind: 'testpoint', width: 34, height: 34, padShape: 'round' };
    if (comp.type.startsWith('source') || comp.type === 'bench_supply') return { ref: 'J', kind: 'terminal', width: 64, height: 38, padShape: 'square' };
    if (comp.type.startsWith('logic') || comp.type.startsWith('transistor')) return { ref: 'U', kind: 'ic', width: 62, height: 44, padShape: 'round' };
    return { ref: comp.type.slice(0, 3).toUpperCase(), kind: 'generic', width: 52, height: 32, padShape: 'round' };
  };

  const drawPad = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    selected = false,
    shape: 'round' | 'square' = 'round'
  ) => {
    ctx.save();
    ctx.fillStyle = selected ? '#ff62ff' : PROTEUS_PAD;
    ctx.strokeStyle = selected ? '#ffffff' : '#7e22ce';
    ctx.lineWidth = Math.max(1.2, 1.5 * zoom);
    ctx.beginPath();
    if (shape === 'square') {
      ctx.roundRect(x - radius, y - radius, radius * 2, radius * 2, Math.max(2, 2 * zoom));
    } else {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PROTEUS_PAD_HOLE;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.8, radius * 0.32), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawFootprint = (
    ctx: CanvasRenderingContext2D,
    comp: CircuitComponent,
    screen: { x: number; y: number },
    rotation: number,
    isSelected: boolean
  ) => {
    const silk = isSelected ? '#ffffff' : PROTEUS_SILK;
    const footprint = getFootprintSpec(comp);
    
    // Para identificar qual o nome de referência (R, C, U, etc)
    // Se o usuário renomear o componente, usamos o nome dele se for curto (ex: R1, U2), senão usamos a ref base
    const isShortName = comp.name.length <= 4 && /^[a-zA-Z]+\d+$/.test(comp.name);
    const label = isShortName ? comp.name : footprint.ref;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = silk;
    ctx.fillStyle = silk;
    ctx.lineWidth = Math.max(1.4, 1.7 * zoom);

    if (footprint.kind === 'via') {
      ctx.restore();
      return;
    }

    ctx.font = `bold ${Math.max(9, 10 * zoom)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const padRadius = Math.max(3, (solderPadDiameter / 20) * PX_PER_UNIT * zoom);
    const clearance = padRadius + 4 * zoom;

    // Calcular bounding box local dos terminais
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    if (comp.terminals.length > 0) {
      const xs = comp.terminals.map(t => (t.relX * 0.35) * PX_PER_UNIT * zoom);
      const ys = comp.terminals.map(t => (t.relY * 0.35) * PX_PER_UNIT * zoom);
      minX = Math.min(...xs);
      maxX = Math.max(...xs);
      minY = Math.min(...ys);
      maxY = Math.max(...ys);
    }

    // Componentes de 2 terminais (Axiais: Resistores, Diodos, Capacitores, etc)
    if (comp.terminals.length === 2 && footprint.kind !== 'testpoint' && footprint.kind !== 'terminal') {
      const t1 = { x: (comp.terminals[0].relX * 0.35) * PX_PER_UNIT * zoom, y: (comp.terminals[0].relY * 0.35) * PX_PER_UNIT * zoom };
      const t2 = { x: (comp.terminals[1].relX * 0.35) * PX_PER_UNIT * zoom, y: (comp.terminals[1].relY * 0.35) * PX_PER_UNIT * zoom };
      
      const dx = t2.x - t1.x;
      const dy = t2.y - t1.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.rotate(angle);
      
      const bodyLength = Math.max(8 * zoom, length - clearance * 2);
      const bodyWidth = Math.max(12 * zoom, length * 0.25);

      if (footprint.kind === 'diode') {
        ctx.strokeRect(-bodyLength/2, -bodyWidth/2, bodyLength, bodyWidth);
        // Marca do cátodo
        ctx.beginPath();
        ctx.moveTo(bodyLength/2 - 4 * zoom, -bodyWidth/2);
        ctx.lineTo(bodyLength/2 - 4 * zoom, bodyWidth/2);
        ctx.stroke();
      } else if (footprint.kind === 'capacitor') {
        // Capacitor footprint no ARES (duas placas)
        ctx.beginPath();
        ctx.moveTo(-3 * zoom, -bodyWidth/2);
        ctx.lineTo(-3 * zoom, bodyWidth/2);
        ctx.moveTo(3 * zoom, -bodyWidth/2);
        ctx.lineTo(3 * zoom, bodyWidth/2);
        ctx.stroke();
      } else {
        // Resistor (Caixa simples)
        ctx.strokeRect(-bodyLength/2, -bodyWidth/2, bodyLength, bodyWidth);
      }
      
      ctx.restore();
      ctx.fillText(label, 0, -(bodyWidth/2 + 8 * zoom));
      ctx.restore();
      return;
    }

    // Terminais (Borneira, Fonte) e Testpoints
    if (footprint.kind === 'terminal' || footprint.kind === 'testpoint') {
      const w = Math.max(maxX - minX + clearance * 2, 24 * zoom);
      const h = Math.max(maxY - minY + clearance * 2, 24 * zoom);
      ctx.strokeRect(minX - clearance, minY - clearance, w, h);
      ctx.fillText(label, 0, minY - clearance - 8 * zoom);
      ctx.restore();
      return;
    }

    // Transistores e CIs (> 2 terminais)
    const w = Math.max(maxX - minX + clearance, 16 * zoom);
    const h = Math.max(maxY - minY + clearance, 16 * zoom);
    
    // O silk envolve todos os pads, mas com margem
    // Em CIs tipo DIP, a caixa envelopa os pinos
    ctx.strokeRect(minX - padRadius, minY - padRadius, w + padRadius*2, h + padRadius*2);
    
    // Marca do pino 1 (notch no centro superior)
    if (comp.terminals.length >= 4) {
      ctx.beginPath();
      ctx.arc(0, minY - padRadius, 4 * zoom, 0, Math.PI);
      ctx.stroke();
    }

    ctx.fillText(label, 0, 0);
    ctx.restore();
  };

  const rotateSelected = () => {
    if (!selectedComponentId) return;
    const comp = pcbComponents.find(item => item.id === selectedComponentId);
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
    ctx.fillStyle = PROTEUS_BG;
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    ctx.save();
    const minorStep = (PX_PER_UNIT * zoom) / 2;
    const majorStep = PX_PER_UNIT * zoom * 2;
    ctx.strokeStyle = PROTEUS_GRID_MINOR;
    ctx.lineWidth = 1;
    for (let x = boardRect.x; x <= boardRect.x + boardRect.width; x += minorStep) {
      ctx.beginPath();
      ctx.moveTo(x, boardRect.y);
      ctx.lineTo(x, boardRect.y + boardRect.height);
      ctx.stroke();
    }
    for (let y = boardRect.y; y <= boardRect.y + boardRect.height; y += minorStep) {
      ctx.beginPath();
      ctx.moveTo(boardRect.x, y);
      ctx.lineTo(boardRect.x + boardRect.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = PROTEUS_GRID_MAJOR;
    for (let x = boardRect.x; x <= boardRect.x + boardRect.width; x += majorStep) {
      ctx.beginPath();
      ctx.moveTo(x, boardRect.y);
      ctx.lineTo(x, boardRect.y + boardRect.height);
      ctx.stroke();
    }
    for (let y = boardRect.y; y <= boardRect.y + boardRect.height; y += majorStep) {
      ctx.beginPath();
      ctx.moveTo(boardRect.x, y);
      ctx.lineTo(boardRect.x + boardRect.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = PROTEUS_OUTLINE;
    ctx.lineWidth = Math.max(1.5, 2 * zoom);
    ctx.strokeRect(boardRect.x, boardRect.y, boardRect.width, boardRect.height);

    if (showMountingHoles) {
      const mountingHoleRadius = Math.max(2, (mountingHoleDiameter / 20) * PX_PER_UNIT * zoom);
      const holeMarginPx = (mountingHoleMargin / 10) * PX_PER_UNIT * zoom;
      [
        { x: boardRect.x + holeMarginPx, y: boardRect.y + holeMarginPx },
        { x: boardRect.x + boardRect.width - holeMarginPx, y: boardRect.y + holeMarginPx },
        { x: boardRect.x + holeMarginPx, y: boardRect.y + boardRect.height - holeMarginPx },
        { x: boardRect.x + boardRect.width - holeMarginPx, y: boardRect.y + boardRect.height - holeMarginPx }
      ].forEach(hole => {
        ctx.fillStyle = PROTEUS_BG;
        ctx.strokeStyle = PROTEUS_SILK;
        ctx.lineWidth = Math.max(1, zoom);
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, mountingHoleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    pcbWires.forEach(wire => {
      const fromComp = pcbComponents.find(comp => comp.id === wire.from.componentId);
      const toComp = pcbComponents.find(comp => comp.id === wire.to.componentId);
      if (!fromComp || !toComp) return;
      const from = getTerminalPosition(fromComp, wire.from.terminalId);
      const to = getTerminalPosition(toComp, wire.to.terminalId);
      if (!from || !to) return;

      const route = routes[wire.id]?.points;
      const path = [from, ...(route || []), to].map(point => boardToScreen(point.x, point.y));
      if (routes[wire.id]) {
        const routeLayer = routes[wire.id].layer ?? 'top';
        const routeWidth = Math.max(3, (routes[wire.id].width ?? 0.18) * PX_PER_UNIT * zoom);
        const routeColor = routes[wire.id].color ?? (routeLayer === 'top' ? TOP_COPPER : BOTTOM_COPPER);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        path.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = selectedWireId === wire.id ? '#ffffff' : routeColor;
        ctx.lineWidth = selectedWireId === wire.id ? routeWidth + 4 : routeWidth + 1.5;
        ctx.globalAlpha = selectedWireId === wire.id ? 0.34 : 0.22;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        path.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = selectedWireId === wire.id ? '#ffffff' : routeColor;
        ctx.lineWidth = selectedWireId === wire.id ? routeWidth + 1 : routeWidth;
        ctx.stroke();
      } else if (showRatsnest) {
        ctx.beginPath();
        path.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = selectedWireId === wire.id ? '#93c5fd' : AIRWIRE;
        ctx.setLineDash([]);
        ctx.lineWidth = selectedWireId === wire.id ? 1.8 : 0.85;
        ctx.stroke();
      }

      if (selectedWireId === wire.id) {
        path.forEach(point => {
          ctx.fillStyle = '#22c55e';
          ctx.strokeStyle = '#bbf7d0';
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    });

    Object.entries(routes).forEach(([routeId, route]) => {
      if (!isManualRoute(routeId) || route.points.length === 0) return;

      const path = route.points.map(point => boardToScreen(point.x, point.y));
      const routeLayer = route.layer ?? 'top';
      const routeWidth = Math.max(3, (route.width ?? 0.18) * PX_PER_UNIT * zoom);
      const routeColor = route.color ?? (routeLayer === 'top' ? TOP_COPPER : BOTTOM_COPPER);

      if (path.length >= 2) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        path.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = selectedWireId === routeId ? '#ffffff' : routeColor;
        ctx.lineWidth = selectedWireId === routeId ? routeWidth + 4 : routeWidth + 1.5;
        ctx.globalAlpha = selectedWireId === routeId ? 0.34 : 0.22;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        path.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = selectedWireId === routeId ? '#ffffff' : routeColor;
        ctx.lineWidth = selectedWireId === routeId ? routeWidth + 1 : routeWidth;
        ctx.stroke();
      }

      path.forEach(point => {
        const isSelected = selectedWireId === routeId;
        ctx.fillStyle = isSelected ? '#22c55e' : PROTEUS_PAD;
        ctx.strokeStyle = isSelected ? '#bbf7d0' : '#7e22ce';
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(4, (solderPadDiameter / 22) * PX_PER_UNIT * zoom), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = PROTEUS_PAD_HOLE;
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(1.6, 2 * zoom), 0, Math.PI * 2);
        ctx.fill();
      });
    });

    pcbComponents.forEach(comp => {
      const pos = effectiveLayout[comp.id];
      if (!pos) return;
      const screen = boardToScreen(pos.x, pos.y);
      const isSelected = selectedComponentId === comp.id;

      drawFootprint(ctx, comp, screen, pos.rotation ?? comp.rotation, isSelected);

      comp.terminals.forEach(term => {
        const termPos = getTerminalPosition(comp, term.id);
        if (!termPos) return;
        const termScreen = boardToScreen(termPos.x, termPos.y);
        if (showSolderPads) {
          const footprint = getFootprintSpec(comp);
          const isPinOne = term.id === 'p' || term.id === 'a' || term.id === 't1' || term.id === 'line';
          const padShape = isPinOne ? 'square' : (footprint.padShape === 'oval' ? 'round' : footprint.padShape ?? 'round');
          const padRadius = Math.max(3, (solderPadDiameter / 20) * PX_PER_UNIT * zoom);
          drawPad(ctx, termScreen.x, termScreen.y, padRadius, isSelected, padShape);
        }
      });

    });

    const issues = getDrcIssues();
    ctx.restore();

    ctx.fillStyle = 'rgba(226,232,240,0.95)';
    ctx.fillRect(0, dimensions.height - 28, dimensions.width, 28);
    ctx.fillStyle = issues.length > 0 ? '#dc2626' : '#16a34a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      issues.length > 0
        ? `✕ ${issues.length} DRC error(s): ${issues[0]}`
        : `✓ No DRC errors`,
      14,
      dimensions.height - 14
    );
    ctx.fillStyle = activeLayer === 'top' ? TOP_COPPER : BOTTOM_COPPER;
    ctx.textAlign = 'right';
      ctx.fillText(`${activeLayer === 'top' ? 'Top Copper' : 'Bottom Copper'} | ${pcbWires.length - Object.keys(routes).filter(routeId => pcbWires.some(wire => wire.id === routeId)).length} missing`, dimensions.width - 14, dimensions.height - 14);
  }, [
    pcbComponents,
    pcbWires,
    dimensions,
    boardRect,
    effectiveLayout,
    routes,
    selectedComponentId,
    selectedWireId,
    zoom,
    showRatsnest,
    activeLayer,
    showMountingHoles,
    mountingHoleDiameter,
    mountingHoleMargin,
    showSolderPads,
    solderPadDiameter
  ]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (event.button === 2) return;
    setRouteMenu(null);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.detail > 1) return;

    if (event.button === 1 || event.altKey || event.shiftKey || isSpacePressed) {
      setIsPanning(true);
      setPanStart({ mouseX, mouseY, panX: pan.x, panY: pan.y });
      return;
    }

    if (tool === 'select') {
      const comp = getComponentAt(mouseX, mouseY);
      if (comp) {
        const pos = effectiveLayout[comp.id];
        setSelectedComponentId(comp.id);
        setSelectedWireId(null);
        setDrag({ id: comp.id, offsetX: mouseX - boardToScreen(pos.x, pos.y).x, offsetY: mouseY - boardToScreen(pos.x, pos.y).y });
        return;
      }
    }

    if (tool === 'route') {
      const terminalHit = getTerminalAt(mouseX, mouseY);
      if (terminalHit) {
        const terminalWire = findWireForTerminal(terminalHit.componentId, terminalHit.terminalId);
        if (terminalWire) {
          selectWire(terminalWire);
          if (!routes[terminalWire.id]) {
            setRoutes({
              ...routes,
              [terminalWire.id]: {
                points: [],
                layer: activeLayer,
                width: trackWidth
              }
            });
          }
          return;
        }
      }
    }

    const wireHit = getWireHitAt(mouseX, mouseY);
    const wire = wireHit?.wire ?? null;
    if (wireHit) {
      selectWire(wireHit.wire);
      const boardPoint = clampToBoard(screenToBoard(mouseX, mouseY));
      const route = routes[wireHit.wire.id];
      const routePointIndex = getRoutePointAt(mouseX, mouseY, wireHit.wire.id);

      if (tool === 'route' && !route) {
        setRoutes({
          ...routes,
          [wireHit.wire.id]: {
            points: [],
            layer: activeLayer,
            width: trackWidth
          }
        });
        return;
      }

      if (routePointIndex !== null && route) {
        setRouteDrag({
          kind: 'point',
          wireId: wireHit.wire.id,
          pointIndex: routePointIndex,
          startMouse: boardPoint,
          startPoints: route.points.map(point => ({ ...point }))
        });
        return;
      }

      if (!route || route.points.length === 0) return;

      setRouteDrag({
        kind: 'segment',
        wireId: wireHit.wire.id,
        segmentIndex: wireHit.segmentIndex,
        orientation: getSegmentOrientation(wireHit.boardPath[wireHit.segmentIndex], wireHit.boardPath[wireHit.segmentIndex + 1]),
        startMouse: boardPoint,
        startPoints: route.points.map(point => ({ ...point }))
      });
      return;
    }

    const manualHit = getManualRouteHitAt(mouseX, mouseY);
    if (manualHit) {
      selectRoute(manualHit.routeId);
      const route = routes[manualHit.routeId];
      const boardPoint = clampToBoard(screenToBoard(mouseX, mouseY));
      const routePointIndex = getRoutePointAt(mouseX, mouseY, manualHit.routeId);

      if (routePointIndex !== null) {
        setRouteDrag({
          kind: 'point',
          wireId: manualHit.routeId,
          pointIndex: routePointIndex,
          startMouse: boardPoint,
          startPoints: route.points.map(point => ({ ...point }))
        });
        return;
      }

      setRouteDrag({
        kind: 'segment',
        wireId: manualHit.routeId,
        segmentIndex: manualHit.segmentIndex,
        orientation: getSegmentOrientation(manualHit.boardPath[manualHit.segmentIndex], manualHit.boardPath[manualHit.segmentIndex + 1]),
        startMouse: boardPoint,
        startPoints: route.points.map(point => ({ ...point }))
      });
      return;
    }

    const comp = getComponentAt(mouseX, mouseY);

    if (comp) {
      const pos = effectiveLayout[comp.id];
      setSelectedComponentId(comp.id);
      setSelectedWireId(null);
      setDrag({ id: comp.id, offsetX: mouseX - boardToScreen(pos.x, pos.y).x, offsetY: mouseY - boardToScreen(pos.x, pos.y).y });
      return;
    }

    if (wire) {
      selectWire(wire);
      return;
    }

    if (tool === 'route') {
      const boardPoint = clampToBoard(screenToBoard(mouseX, mouseY));
      const selectedRoute = selectedWireId ? routes[selectedWireId] : null;

      if (selectedWireId && selectedRoute) {
        setRoutes({
          ...routes,
          [selectedWireId]: {
            ...selectedRoute,
            points: [...selectedRoute.points, boardPoint],
            layer: selectedRoute.layer ?? activeLayer,
            width: selectedRoute.width ?? trackWidth
          }
        });
      } else {
        const routeId = createManualRouteId();
        setSelectedWireId(routeId);
        setSelectedComponentId(null);
        setRoutes({
          ...routes,
          [routeId]: {
            points: [boardPoint],
            layer: activeLayer,
            width: trackWidth,
            manual: true
          }
        });
      }
      return;
    }

    setSelectedComponentId(null);
    setSelectedWireId(null);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const wireHit = getWireHitAt(mouseX, mouseY);
    const manualHit = getManualRouteHitAt(mouseX, mouseY);

    if (manualHit) {
      selectRoute(manualHit.routeId);
      setRouteMenu({
        x: Math.min(mouseX, Math.max(0, dimensions.width - 230)),
        y: Math.min(mouseY, Math.max(0, dimensions.height - 260)),
        wireId: manualHit.routeId
      });
      return;
    }

    if (!wireHit || !routes[wireHit.wire.id]) {
      setRouteMenu(null);
      return;
    }

    selectWire(wireHit.wire);
    setRouteMenu({
      x: Math.min(mouseX, Math.max(0, dimensions.width - 230)),
      y: Math.min(mouseY, Math.max(0, dimensions.height - 260)),
      wireId: wireHit.wire.id
    });
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const wireHit = getWireHitAt(mouseX, mouseY);
    const manualHit = getManualRouteHitAt(mouseX, mouseY);

    if (manualHit) {
      const routePointIndex = getRoutePointAt(mouseX, mouseY, manualHit.routeId);
      if (routePointIndex !== null) return;

      const boardPoint = clampToBoard(screenToBoard(mouseX, mouseY));
      const route = routes[manualHit.routeId];
      const points = [
        ...route.points.slice(0, manualHit.segmentIndex + 1),
        boardPoint,
        ...route.points.slice(manualHit.segmentIndex + 1)
      ];

      selectRoute(manualHit.routeId);
      setRoutes({
        ...routes,
        [manualHit.routeId]: {
          ...route,
          points
        }
      });
      return;
    }

    if (!wireHit) return;

    const route = routes[wireHit.wire.id];
    const routePointIndex = getRoutePointAt(mouseX, mouseY, wireHit.wire.id);
    if (routePointIndex !== null) return;

    const boardPoint = clampToBoard(screenToBoard(mouseX, mouseY));
    const insertedBend = insertRouteBend(wireHit.wire.id, wireHit.segmentIndex, boardPoint, route);
    if (insertedBend) {
      selectWire(wireHit.wire);
      setRoutes({
        ...routes,
        [wireHit.wire.id]: insertedBend.route
      });
      setRouteDrag({
        kind: 'segment',
        wireId: wireHit.wire.id,
        segmentIndex: insertedBend.pointIndex + 1,
        orientation: getSegmentOrientation(
          insertedBend.points[insertedBend.pointIndex],
          insertedBend.points[insertedBend.pointIndex + 1]
        ),
        startMouse: boardPoint,
        startPoints: insertedBend.points
      });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rawMouseX = event.clientX - rect.left;
    const rawMouseY = event.clientY - rect.top;

    if (isPanning && panStart) {
      setPan({
        x: panStart.panX + rawMouseX - panStart.mouseX,
        y: panStart.panY + rawMouseY - panStart.mouseY
      });
      return;
    }

    if (routeDrag) {
      const boardPoint = clampToBoard(screenToBoard(rawMouseX, rawMouseY));
      const delta = {
        x: boardPoint.x - routeDrag.startMouse.x,
        y: boardPoint.y - routeDrag.startMouse.y
      };
      const existingRoute = routes[routeDrag.wireId];
      if (!existingRoute) return;

      const points = routeDrag.startPoints.map(point => ({ ...point }));

      if (routeDrag.kind === 'point') {
        points[routeDrag.pointIndex] = clampToBoard({
          x: routeDrag.startPoints[routeDrag.pointIndex].x + delta.x,
          y: routeDrag.startPoints[routeDrag.pointIndex].y + delta.y
        });
      } else if (routeDrag.orientation === 'horizontal') {
        const firstPointIndex = routeDrag.segmentIndex - 1;
        const secondPointIndex = routeDrag.segmentIndex;
        [firstPointIndex, secondPointIndex].forEach(pointIndex => {
          if (pointIndex >= 0 && pointIndex < points.length) {
            points[pointIndex] = clampToBoard({
              ...points[pointIndex],
              y: routeDrag.startPoints[pointIndex].y + delta.y
            });
          }
        });
      } else if (routeDrag.orientation === 'vertical') {
        const firstPointIndex = routeDrag.segmentIndex - 1;
        const secondPointIndex = routeDrag.segmentIndex;
        [firstPointIndex, secondPointIndex].forEach(pointIndex => {
          if (pointIndex >= 0 && pointIndex < points.length) {
            points[pointIndex] = clampToBoard({
              ...points[pointIndex],
              x: routeDrag.startPoints[pointIndex].x + delta.x
            });
          }
        });
      } else {
        points.forEach((point, index) => {
          points[index] = clampToBoard({
            x: point.x + delta.x,
            y: point.y + delta.y
          });
        });
      }

      setRoutes({
        ...routes,
        [routeDrag.wireId]: {
          ...existingRoute,
          points
        }
      });
      return;
    }

    if (!drag) return;
    const mouseX = rawMouseX - drag.offsetX;
    const mouseY = rawMouseY - drag.offsetY;
    const boardPoint = clampToBoard(screenToBoard(mouseX, mouseY));
    const comp = pcbComponents.find(item => item.id === drag.id);
    const current = effectiveLayout[drag.id];
    if (!comp || !current) return;

    setLayout({
      ...layout,
      [drag.id]: {
        x: boardPoint.x,
        y: boardPoint.y,
        rotation: current.rotation ?? comp.rotation
      }
    });
  };

  const finishPointerAction = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
    setRouteDrag(null);
    setIsPanning(false);
    setPanStart(null);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const before = screenToBoard(mouseX, mouseY);
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor));
    const nextBoardWidth = boardDimensions.width * PX_PER_UNIT * nextZoom;
    const nextBoardHeight = boardDimensions.height * PX_PER_UNIT * nextZoom;
    const nextPanX = mouseX - dimensions.width / 2 - before.x * PX_PER_UNIT * nextZoom;
    const nextPanY = mouseY - dimensions.height / 2 - before.y * PX_PER_UNIT * nextZoom;
    setZoom(nextZoom);
    setPan({
      x: nextPanX + nextBoardWidth / 2 - nextBoardWidth / 2,
      y: nextPanY + nextBoardHeight / 2 - nextBoardHeight / 2
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const canvasCursor = isPanning || routeDrag
    ? 'grabbing'
    : (isSpacePressed ? 'grab' : (tool === 'route' ? 'crosshair' : 'default'));
  const menuRoute = routeMenu ? routes[routeMenu.wireId] : null;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-slate-100 dark:bg-slate-950">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 text-xs flex-wrap">
        <div className="flex items-center gap-2 mr-2 pr-3 border-r border-slate-200 dark:border-slate-700">
          <span className="px-2 py-1 rounded bg-indigo-600 text-white font-black uppercase tracking-wide">Layout PCB</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">{boardName}</span>
        </div>
        <div className="flex items-center gap-1 pr-3 border-r border-slate-200 dark:border-slate-700">
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
        </div>
        <div className="flex items-center gap-1 pr-3 border-r border-slate-200 dark:border-slate-700">
        <button onClick={() => selectedWireId ? autoRouteWire(selectedWireId) : autoRouteAll()} className="flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Wand2 size={13} />
          <span>{selectedWireId ? 'Auto trilha' : 'Auto trilhas'}</span>
        </button>
        <div className={`flex items-center overflow-hidden rounded border ${selectedWireId ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-700'}`}>
          <button
            onClick={() => setLayerForSelection('top')}
            className={`px-2 py-1 ${activeLayer === 'top' ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800'} ${selectedWireId ? 'font-black' : ''}`}
            title={selectedWireId ? 'Mover trilha selecionada para Top Copper' : 'Camada das próximas trilhas'}
          >
            Top
          </button>
          <button
            onClick={() => setLayerForSelection('bottom')}
            className={`px-2 py-1 ${activeLayer === 'bottom' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'} ${selectedWireId ? 'font-black' : ''}`}
            title={selectedWireId ? 'Mover trilha selecionada para Bottom Copper' : 'Camada das próximas trilhas'}
          >
            Bottom
          </button>
        </div>
        <label className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
          <span>Trilha</span>
          <select
            value={trackWidth}
            onChange={(event) => setTrackWidthForSelection(Number(event.target.value))}
            className="bg-transparent outline-none font-mono"
          >
            <option value={0.15}>0.15</option>
            <option value={0.18}>0.18</option>
            <option value={0.25}>0.25</option>
            <option value={0.4}>0.40</option>
          </select>
          <span>u</span>
        </label>
        </div>
        <div className="flex items-center gap-1 pr-3 border-r border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setShowRatsnest(value => !value)}
          className={`px-2 py-1 rounded ${showRatsnest ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800'}`}
        >
          Ratsnest
        </button>
        <button onClick={autoPlace} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
          <Maximize size={13} />
          <span>Auto posicionar</span>
        </button>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setZoom(value => Math.max(MIN_ZOOM, value * 0.9))} className="p-1.5 rounded bg-slate-100 dark:bg-slate-800" title="Diminuir zoom">
            <ZoomOut size={13} />
          </button>
          <button onClick={resetView} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800" title="Centralizar">
            <Move size={13} />
            <span>{Math.round(zoom * 100)}%</span>
          </button>
          <button onClick={() => setZoom(value => Math.min(MAX_ZOOM, value * 1.1))} className="p-1.5 rounded bg-slate-100 dark:bg-slate-800" title="Aumentar zoom">
            <ZoomIn size={13} />
          </button>
        </div>
        {selectedWireId && (
          <>
            <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 font-bold">
              Trilha selecionada
            </span>
            <button onClick={() => autoRouteWire(selectedWireId)} className="px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Rotear selecionada
            </button>
            <button onClick={clearSelectedRoute} className="flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300">
              <Trash2 size={13} />
              Limpar trilha
            </button>
          </>
        )}
        {Object.keys(routes).length > 0 && (
          <button onClick={clearAllRoutes} className="px-2 py-1 rounded bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300">
            Limpar todas
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerAction}
        onPointerCancel={finishPointerAction}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        className="flex-1"
        style={{ cursor: canvasCursor, touchAction: 'none' }}
      />
      {routeMenu && menuRoute && (
        <div
          className="absolute z-30 w-[220px] rounded-md border border-slate-200 bg-white p-2 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
          style={{ left: routeMenu.x, top: routeMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
            <span className="font-black text-slate-800 dark:text-slate-100">Editar trilha</span>
            <button
              onClick={() => setRouteMenu(null)}
              className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Fechar"
            >
              x
            </button>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1">
            <button
              onClick={() => {
                setActiveLayer('top');
                updateRouteById(routeMenu.wireId, { layer: 'top', color: undefined });
              }}
              className={`rounded px-2 py-1 font-bold ${menuRoute.layer !== 'bottom' ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
            >
              Top
            </button>
            <button
              onClick={() => {
                setActiveLayer('bottom');
                updateRouteById(routeMenu.wireId, { layer: 'bottom', color: undefined });
              }}
              className={`rounded px-2 py-1 font-bold ${menuRoute.layer === 'bottom' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
            >
              Bottom
            </button>
          </div>
          <label className="mb-2 block">
            <span className="mb-1 block font-bold text-slate-600 dark:text-slate-300">Espessura</span>
            <select
              value={menuRoute.width ?? trackWidth}
              onChange={(event) => {
                const width = Number(event.target.value);
                setTrackWidth(width);
                updateRouteById(routeMenu.wireId, { width });
              }}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono outline-none dark:border-slate-700 dark:bg-slate-800"
            >
              <option value={0.15}>0.15 u</option>
              <option value={0.18}>0.18 u</option>
              <option value={0.25}>0.25 u</option>
              <option value={0.4}>0.40 u</option>
              <option value={0.6}>0.60 u</option>
            </select>
          </label>
          <div className="mb-2">
            <span className="mb-1 block font-bold text-slate-600 dark:text-slate-300">Cor</span>
            <div className="grid grid-cols-6 gap-1">
              {ROUTE_COLOR_PRESETS.map(color => (
                <button
                  key={color.value}
                  onClick={() => updateRouteById(routeMenu.wireId, { color: color.value })}
                  className="h-7 rounded border border-slate-300 dark:border-slate-700"
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
            <input
              type="color"
              value={menuRoute.color ?? (menuRoute.layer === 'bottom' ? BOTTOM_COPPER : TOP_COPPER)}
              onChange={(event) => updateRouteById(routeMenu.wireId, { color: event.target.value })}
              className="mt-2 h-8 w-full rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <button
            onClick={() => deleteRouteById(routeMenu.wireId)}
            className="flex w-full items-center justify-center gap-1 rounded bg-red-600 px-2 py-1.5 font-black text-white"
          >
            <Trash2 size={13} />
            Excluir trilha
          </button>
        </div>
      )}
    </div>
  );
}
