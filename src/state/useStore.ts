import { create } from 'zustand';
import type { CircuitComponent, CircuitWire, CircuitText, Viewport, ProjectMetadata, ComponentProperty } from '../types/circuit';
import { normalizeComponentGeometry, updateComponentTerminals } from '../utils/circuitUtils';

export type ToolType = 'select' | 'wire' | 'delete' | string;

interface CircuitStore {
  // Configurações Globais / Temas
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  gridVisible: boolean;
  toggleGrid: () => void;
  snapToGrid: boolean;
  toggleSnapToGrid: () => void;

  // Visualização e Viewport (Zoom e Pan)
  viewport: Viewport;
  setViewport: (viewport: Partial<Viewport>) => void;
  resetViewport: () => void;

  // Estado da Simulação
  isSimulating: boolean;
  setIsSimulating: (isSimulating: boolean) => void;
  simulationSpeed: number;
  setSimulationSpeed: (speed: number) => void;
  currentAnimationSpeed: number;
  setCurrentAnimationSpeed: (speed: number) => void;
  timestep: number;
  setTimestep: (timestep: number) => void;
  clearSimulationState: () => void;

  // Projetos
  project: ProjectMetadata;
  setProjectName: (name: string) => void;
  loadProject: (projectData: any) => void;
  projectDevices: string[];
  addProjectDevice: (type: string) => void;
  removeProjectDevice: (type: string) => void;

  // Componentes e Conexões
  components: CircuitComponent[];
  wires: CircuitWire[];
  texts: CircuitText[];
  selectedComponentId: string | null;
  selectedWireId: string | null;
  selectedTextId: string | null;
  activeTool: ToolType;
  
  // Ações sobre Componentes/Fios
  addComponent: (component: CircuitComponent) => void;
  removeComponent: (id: string) => void;
  updateComponentPosition: (id: string, x: number, y: number) => void;
  updateComponentRotation: (id: string, deltaRotation: number) => void;
  toggleComponentMirrorX: (id: string) => void;
  toggleComponentMirrorY: (id: string) => void;
  updateComponentProperty: (componentId: string, propertyKey: string, value: any) => void;
  updateComponentLabelOffset: (id: string, x: number, y: number) => void;
  addWire: (wire: CircuitWire) => void;
  removeWire: (id: string) => void;
  toggleWireRoute: (wireId: string) => void;
  updateWireBendOffset: (wireId: string, offset: number) => void;
  updateWireRoutePoint: (wireId: string, pointIndex: number, x: number, y: number) => void;
  addText: (text: CircuitText) => void;
  removeText: (id: string) => void;
  updateText: (id: string, text: string) => void;
  updateTextPosition: (id: string, x: number, y: number) => void;
  updateTextProperty: (id: string, propertyKey: keyof CircuitText, value: any) => void;
  updateComponentName: (id: string, name: string) => void;
  setSelectedComponentId: (id: string | null) => void;
  setSelectedWireId: (id: string | null) => void;
  setSelectedTextId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  
  // Limpeza
  clearCircuit: () => void;

  // Histórico (Undo / Redo básico)
  undoStack: string[];
  redoStack: string[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Área de Transferência e Duplicação
  clipboard: { components: CircuitComponent[]; wires: CircuitWire[] } | null;
  copySelection: () => void;
  pasteSelection: (targetGridPosition?: { x: number; y: number }) => void;
  duplicateSelection: () => void;
}

const initialViewport: Viewport = { x: 0, y: 0, zoom: 1 };
const initialProject: ProjectMetadata = {
  id: 'default-project',
  name: 'Meu Circuito Sem Nome',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const useStore = create<CircuitStore>((set, get) => ({
  // Temas
  theme: (typeof localStorage !== 'undefined' && localStorage.getItem('theme') === 'dark' ? 'dark' : 'light') as 'light' | 'dark',
  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', theme);
    }
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    set({ theme });
  },
  gridVisible: true,
  toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
  snapToGrid: true,
  toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),

  // Viewport
  viewport: initialViewport,
  setViewport: (vp) => set((state) => ({ viewport: { ...state.viewport, ...vp } })),
  resetViewport: () => set({ viewport: initialViewport }),

  // Simulação
  isSimulating: false,
  setIsSimulating: (isSimulating) => set((state) => {
    if (isSimulating) return { isSimulating };

    return {
      isSimulating,
      components: state.components.map(c => {
        const next = { ...c };
        delete next.simulationState;
        return next;
      }),
      wires: state.wires.map(w => {
        const next = { ...w };
        delete next.simulationState;
        return next;
      })
    };
  }),
  simulationSpeed: 1,
  setSimulationSpeed: (simulationSpeed) => set({ simulationSpeed }),
  currentAnimationSpeed: 1,
  setCurrentAnimationSpeed: (currentAnimationSpeed) => set({ currentAnimationSpeed }),
  timestep: 0.0001, // 100 microseconds padrão
  setTimestep: (timestep) => set({ timestep }),
  clearSimulationState: () => set((state) => ({
    components: state.components.map(c => {
      const newC = { ...c };
      delete newC.simulationState;
      return newC;
    }),
    wires: state.wires.map(w => {
      const newW = { ...w };
      delete newW.simulationState;
      return newW;
    })
  })),

  // Projetos
  project: initialProject,
  setProjectName: (name) => set((state) => ({
    project: { ...state.project, name, updatedAt: new Date().toISOString() }
  })),
  loadProject: (projectData) => set({
    project: projectData.project || initialProject,
    snapToGrid: projectData.settings?.snapToGrid ?? get().snapToGrid,
    simulationSpeed: projectData.settings?.simulationSpeed ?? get().simulationSpeed,
    currentAnimationSpeed: projectData.settings?.currentAnimationSpeed ?? get().currentAnimationSpeed,
    timestep: projectData.settings?.timestep ?? get().timestep,
    components: (projectData.components || []).map((comp: CircuitComponent) => normalizeComponentGeometry(comp)),
    wires: projectData.wires || [],
    texts: projectData.texts || [],
    viewport: projectData.viewport || initialViewport,
    projectDevices: projectData.projectDevices || [],
    selectedComponentId: null,
    selectedWireId: null,
    selectedTextId: null,
    activeTool: 'select',
    undoStack: [],
    redoStack: []
  }),
  projectDevices: [],
  addProjectDevice: (type) => set((state) => ({
    projectDevices: state.projectDevices.includes(type) ? state.projectDevices : [...state.projectDevices, type]
  })),
  removeProjectDevice: (type) => set((state) => ({
    projectDevices: state.projectDevices.filter(d => d !== type)
  })),

  // Circuito
  components: [],
  wires: [],
  texts: [],
  selectedComponentId: null,
  selectedWireId: null,
  selectedTextId: null,
  activeTool: 'select',

  // Ações
  addComponent: (component) => {
    get().pushHistory();
    const normalizedComponent = normalizeComponentGeometry(component);
    set((state) => ({
      components: [...state.components, normalizedComponent],
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  removeComponent: (id) => {
    get().pushHistory();
    set((state) => ({
      components: state.components.filter((c) => c.id !== id),
      wires: state.wires.filter((w) => w.from.componentId !== id && w.to.componentId !== id),
      selectedComponentId: state.selectedComponentId === id ? null : state.selectedComponentId,
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateComponentPosition: (id, x, y) => {
    set((state) => ({
      components: state.components.map((c) => (
        c.id === id ? updateComponentTerminals({ ...c, x, y }) : c
      )),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateComponentRotation: (id, deltaRotation) => {
    get().pushHistory();
    set((state) => ({
      components: state.components.map((c) =>
        c.id === id ? updateComponentTerminals({ ...c, rotation: (c.rotation + deltaRotation) % 360 }) : c
      ),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  toggleComponentMirrorX: (id) => {
    get().pushHistory();
    set((state) => ({
      components: state.components.map((c) =>
        c.id === id ? updateComponentTerminals({ ...c, mirrorX: !c.mirrorX }) : c
      ),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  toggleComponentMirrorY: (id) => {
    get().pushHistory();
    set((state) => ({
      components: state.components.map((c) =>
        c.id === id ? updateComponentTerminals({ ...c, mirrorY: !c.mirrorY }) : c
      ),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateComponentProperty: (componentId, propertyKey, value) => {
    get().pushHistory();
    set((state) => ({
      components: state.components.map((c) => {
        if (c.id === componentId) {
          const existingProp = c.properties[propertyKey];
          const newProp: ComponentProperty = existingProp
            ? { ...existingProp, value }
            : {
                name: propertyKey,
                label: propertyKey,
                type: typeof value === 'number' ? 'number' : 'text',
                value
              };
          return {
            ...c,
            properties: {
              ...c.properties,
              [propertyKey]: newProp
            }
          };
        }
        return c;
      }),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateComponentName: (id, name) => {
    get().pushHistory();
    set((state) => ({
      components: state.components.map((c) => (c.id === id ? { ...c, name } : c)),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateComponentLabelOffset: (id, x, y) => {
    set((state) => ({
      components: state.components.map((c) => (c.id === id ? { ...c, labelOffset: { x, y } } : c)),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  addWire: (wire) => {
    get().pushHistory();
    set((state) => ({
      wires: [...state.wires, wire],
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  removeWire: (id) => {
    get().pushHistory();
    set((state) => ({
      wires: state.wires.filter((w) => w.id !== id),
      selectedWireId: state.selectedWireId === id ? null : state.selectedWireId,
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  toggleWireRoute: (wireId) => {
    get().pushHistory();
    set((state) => ({
      wires: state.wires.map((w) =>
        w.id === wireId ? { ...w, verticalFirst: !w.verticalFirst } : w
      ),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateWireBendOffset: (wireId, offset) => {
    get().pushHistory();
    set((state) => ({
      wires: state.wires.map((w) => (w.id === wireId ? { ...w, bendOffset: offset } : w)),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateWireRoutePoint: (wireId, pointIndex, x, y) => {
    get().pushHistory();
    set((state) => ({
      wires: state.wires.map((w) => {
        if (w.id !== wireId || !w.routePoints?.[pointIndex]) return w;
        return {
          ...w,
          routePoints: w.routePoints.map((point, index) => (
            index === pointIndex ? { x, y } : point
          ))
        };
      }),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  addText: (text) => {
    get().pushHistory();
    set((state) => ({
      texts: [...state.texts, text],
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  removeText: (id) => {
    get().pushHistory();
    set((state) => ({
      texts: state.texts.filter(t => t.id !== id),
      selectedTextId: state.selectedTextId === id ? null : state.selectedTextId,
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateText: (id, text) => {
    get().pushHistory();
    set((state) => ({
      texts: state.texts.map(t => t.id === id ? { ...t, text } : t),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateTextPosition: (id, x, y) => {
    set((state) => ({
      texts: state.texts.map(t => t.id === id ? { ...t, x, y } : t),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  updateTextProperty: (id, propertyKey, value) => {
    get().pushHistory();
    set((state) => ({
      texts: state.texts.map(t => t.id === id ? { ...t, [propertyKey]: value } : t),
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  setSelectedComponentId: (id) => set({ selectedComponentId: id, selectedWireId: null, selectedTextId: null }),
  setSelectedWireId: (id) => set({ selectedWireId: id, selectedComponentId: null, selectedTextId: null }),
  setSelectedTextId: (id) => set({ selectedTextId: id, selectedComponentId: null, selectedWireId: null }),
  setActiveTool: (tool) => set({ activeTool: tool, selectedComponentId: null, selectedWireId: null, selectedTextId: null }),
  
  // Limpeza
  clearCircuit: () => {
    get().pushHistory();
    set((state) => ({
      components: [],
      wires: [],
      texts: [],
      selectedComponentId: null,
      selectedWireId: null,
      selectedTextId: null,
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },

  // Histórico
  undoStack: [],
  redoStack: [],
  pushHistory: () => {
    const stateSnapshot = JSON.stringify({
      components: get().components,
      wires: get().wires,
      texts: get().texts,
      viewport: get().viewport,
    });
    set((state) => ({
      undoStack: [...state.undoStack, stateSnapshot],
      redoStack: [], // Limpa redo quando nova ação ocorre
    }));
  },
  undo: () => {
    const { undoStack, components, wires, texts, viewport } = get();
    if (undoStack.length === 0) return;
    
    const previousSnapshotStr = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    
    const currentSnapshotStr = JSON.stringify({ components, wires, texts, viewport });
    const previousSnapshot = JSON.parse(previousSnapshotStr);
    
    set((state) => ({
      components: previousSnapshot.components,
      wires: previousSnapshot.wires,
      texts: previousSnapshot.texts || [],
      viewport: previousSnapshot.viewport,
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, currentSnapshotStr],
      selectedComponentId: null,
      selectedWireId: null,
    }));
  },
  redo: () => {
    const { redoStack, components, wires, texts, viewport } = get();
    if (redoStack.length === 0) return;
    
    const nextSnapshotStr = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    
    const currentSnapshotStr = JSON.stringify({ components, wires, texts, viewport });
    const nextSnapshot = JSON.parse(nextSnapshotStr);
    
    set((state) => ({
      components: nextSnapshot.components,
      wires: nextSnapshot.wires,
      texts: nextSnapshot.texts || [],
      viewport: nextSnapshot.viewport,
      undoStack: [...state.undoStack, currentSnapshotStr],
      redoStack: newRedoStack,
      selectedComponentId: null,
      selectedWireId: null,
    }));
  },

  // Área de Transferência & Duplicação
  clipboard: null,
  copySelection: () => {
    const { selectedComponentId, selectedWireId, components, wires } = get();
    if (!selectedComponentId && !selectedWireId) return;

    if (selectedComponentId) {
      const comp = components.find(c => c.id === selectedComponentId);
      if (!comp) return;

      const attachedWires = wires.filter(w => w.from.componentId === comp.id && w.to.componentId === comp.id);
      set({
        clipboard: {
          components: [JSON.parse(JSON.stringify(comp))],
          wires: JSON.parse(JSON.stringify(attachedWires))
        }
      });
    } else if (selectedWireId) {
      const wire = wires.find(w => w.id === selectedWireId);
      if (!wire) return;
      set({
        clipboard: {
          components: [],
          wires: [JSON.parse(JSON.stringify(wire))]
        }
      });
    }
  },
  pasteSelection: (targetGridPosition) => {
    const { clipboard } = get();
    if (!clipboard || (clipboard.components.length === 0 && clipboard.wires.length === 0)) return;

    get().pushHistory();

    const idMap: Record<string, string> = {};
    const newComponents: CircuitComponent[] = [];
    const anchorComponent = clipboard.components[0];
    const offsetX = targetGridPosition && anchorComponent ? targetGridPosition.x - anchorComponent.x : 3;
    const offsetY = targetGridPosition && anchorComponent ? targetGridPosition.y - anchorComponent.y : 3;

    // Copia componentes mantendo o desenho relativo; quando houver posição-alvo,
    // cola o primeiro componente exatamente nesse ponto do grid.
    clipboard.components.forEach(comp => {
      const newId = `${comp.type}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`;
      idMap[comp.id] = newId;

      const newX = comp.x + offsetX;
      const newY = comp.y + offsetY;

      const newComp: CircuitComponent = {
        ...JSON.parse(JSON.stringify(comp)),
        id: newId,
        name: `${comp.name} Copia`,
        x: newX,
        y: newY,
        terminals: comp.terminals.map(t => ({
          ...t,
          x: t.x + offsetX,
          y: t.y + offsetY
        }))
      };

      newComponents.push(normalizeComponentGeometry(newComp));
    });

    // Copia fios internos entre os componentes copiados
    const newWires: CircuitWire[] = [];
    clipboard.wires.forEach(wire => {
      const newFromId = idMap[wire.from.componentId] || wire.from.componentId;
      const newToId = idMap[wire.to.componentId] || wire.to.componentId;

      const newWire: CircuitWire = {
        ...JSON.parse(JSON.stringify(wire)),
        id: `wire_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
        from: { ...wire.from, componentId: newFromId },
        to: { ...wire.to, componentId: newToId },
        routePoints: wire.routePoints && idMap[wire.from.componentId] && idMap[wire.to.componentId]
          ? wire.routePoints.map(point => ({ x: point.x + offsetX, y: point.y + offsetY }))
          : wire.routePoints
      };

      newWires.push(newWire);
    });

    const lastNewCompId = newComponents.length > 0 ? newComponents[newComponents.length - 1].id : null;

    set((state) => ({
      components: [...state.components, ...newComponents],
      wires: [...state.wires, ...newWires],
      selectedComponentId: lastNewCompId || state.selectedComponentId,
      project: { ...state.project, updatedAt: new Date().toISOString() }
    }));
  },
  duplicateSelection: () => {
    get().copySelection();
    get().pasteSelection();
  }
}));
