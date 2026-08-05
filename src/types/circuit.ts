export interface Terminal {
  id: string;
  x: number; // Posição absoluta no grid
  y: number;
  relX: number; // Posição relativa ao centro do componente
  relY: number;
  label?: string;
}

export interface ComponentProperty {
  name: string;
  label: string;
  value: number | string | boolean;
  unit?: string;
  type: 'number' | 'text' | 'boolean' | 'select';
  options?: string[];
  description?: string;
}

export interface CircuitComponent {
  id: string;
  type: string;
  name: string;
  x: number; // Coordenada X central no grid
  y: number; // Coordenada Y central no grid
  rotation: number; // 0, 90, 180, 270 graus
  properties: Record<string, ComponentProperty>;
  terminals: Terminal[];
  labelOffset?: { x: number; y: number }; // Posição relativa do nome em unidades de grid
  labelRotation?: number; // Rotação independente do nome em graus
  mirrorX?: boolean; // Espelhar horizontalmente
  mirrorY?: boolean; // Espelhar verticalmente
  simulationState?: {
    voltage?: number;
    current?: number;
    power?: number;
    [key: string]: any;
  };
}

export interface CircuitWire {
  id: string;
  from: { componentId: string; terminalId: string };
  to: { componentId: string; terminalId: string };
  routePoints?: { x: number; y: number }[]; // Pontos intermediários de roteamento sem criar nós elétricos
  verticalFirst?: boolean;
  bendOffset?: number; // Deslocamento de grade do ponto de dobra intermediário (Z-shape)
  simulationState?: {
    current?: number;
  };
}

export interface CircuitText {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color?: string;
  fontFamily?: string;
  bold?: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PcbLayoutComponent {
  x: number;
  y: number;
  rotation?: number;
}

export interface PcbRoute {
  points: { x: number; y: number }[];
  layer?: 'top' | 'bottom';
  width?: number;
  color?: string;
  manual?: boolean;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CircuitProject {
  format: string;
  version: string;
  project: ProjectMetadata;
  settings: {
    gridSize: number;
    snapToGrid: boolean;
    simulationSpeed: number;
    currentAnimationSpeed?: number;
    timestep: number;
  };
  components: CircuitComponent[];
  wires: CircuitWire[];
  texts?: CircuitText[];
  viewport: Viewport;
  board?: {
    name?: string;
    width: number;
    height: number;
    color: string;
    showMountingHoles?: boolean;
    mountingHoleDiameter?: number;
    mountingHoleMargin?: number;
    showSolderPads?: boolean;
    solderPadDiameter?: number;
  };
  pcbLayout?: Record<string, PcbLayoutComponent>;
  pcbRoutes?: Record<string, PcbRoute>;
}

export interface SimulationResult {
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  wireCurrents: Record<string, number>;
  componentStates: Record<string, {
    voltage: number;
    current: number;
    power: number;
    isBurned?: boolean;
    burnMessage?: string;
    custom?: Record<string, any>;
  }>;
}
