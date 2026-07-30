import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../state/useStore';
import type { CircuitComponent, CircuitWire } from '../types/circuit';

describe('Zustand Circuit Store', () => {
  beforeEach(() => {
    // Reseta o estado do store antes de cada teste
    useStore.getState().clearCircuit();
    useStore.getState().setIsSimulating(false);
    useStore.getState().setTheme('dark');
    useStore.setState({ clipboard: null });
  });

  it('deve inicializar com valores padrão corretos', () => {
    const state = useStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.isSimulating).toBe(false);
    expect(state.components.length).toBe(0);
    expect(state.wires.length).toBe(0);
    expect(state.activeTool).toBe('select');
  });

  it('deve alternar o tema do simulador', () => {
    const state = useStore.getState();
    
    state.setTheme('light');
    expect(useStore.getState().theme).toBe('light');
    
    state.setTheme('dark');
    expect(useStore.getState().theme).toBe('dark');
  });

  it('deve alterar o estado da simulação', () => {
    const state = useStore.getState();
    expect(state.isSimulating).toBe(false);
    
    state.setIsSimulating(true);
    expect(useStore.getState().isSimulating).toBe(true);
  });

  it('deve gerenciar componentes no circuito', () => {
    const state = useStore.getState();
    
    const resistor: CircuitComponent = {
      id: 'resistor-1',
      type: 'resistor',
      name: 'Resistor R1',
      x: 100,
      y: 200,
      rotation: 0,
      properties: {
        resistance: {
          name: 'resistance',
          label: 'Resistência',
          value: 1000,
          unit: 'Ω',
          type: 'number',
          description: 'Valor da resistência'
        }
      },
      terminals: [
        { id: 't1', relX: -20, relY: 0, x: 80, y: 200 },
        { id: 't2', relX: 20, relY: 0, x: 120, y: 200 }
      ]
    };

    state.addComponent(resistor);
    expect(useStore.getState().components.length).toBe(1);
    expect(useStore.getState().components[0].id).toBe('resistor-1');

    // Remover componente
    state.removeComponent('resistor-1');
    expect(useStore.getState().components.length).toBe(0);
  });

  it('deve desfazer e refazer alterações no circuito', () => {
    const state = useStore.getState();
    
    const resistor: CircuitComponent = {
      id: 'resistor-2',
      type: 'resistor',
      name: 'Resistor R2',
      x: 150,
      y: 150,
      rotation: 0,
      properties: {},
      terminals: []
    };

    // Adiciona componente e gera histórico
    state.addComponent(resistor);
    expect(useStore.getState().components.length).toBe(1);

    // Desfazer
    state.undo();
    expect(useStore.getState().components.length).toBe(0);

    // Refazer
    state.redo();
    expect(useStore.getState().components.length).toBe(1);
  });

  it('deve copiar, colar e duplicar componentes e fios', () => {
    const state = useStore.getState();
    
    const resistor: CircuitComponent = {
      id: 'resistor-test',
      type: 'resistor',
      name: 'Resistor R10',
      x: 10,
      y: 10,
      rotation: 0,
      properties: {},
      terminals: [
        { id: 't1', relX: -2, relY: 0, x: 8, y: 10 },
        { id: 't2', relX: 2, relY: 0, x: 12, y: 10 }
      ]
    };

    state.addComponent(resistor);
    state.setSelectedComponentId('resistor-test');

    // Duplicar
    state.duplicateSelection();
    expect(useStore.getState().components.length).toBe(2);
    
    const copyComp = useStore.getState().components[1];
    expect(copyComp.x).toBe(13); // 10 + 3
    expect(copyComp.y).toBe(13); // 10 + 3
    expect(copyComp.name).toContain('Copia');
  });

  it('deve copiar e colar seleções múltiplas com fios internos', () => {
    const state = useStore.getState();

    const resistorA: CircuitComponent = {
      id: 'resistor-a',
      type: 'resistor',
      name: 'Resistor A',
      x: 10,
      y: 10,
      rotation: 0,
      properties: {},
      terminals: [
        { id: 't1', relX: -2, relY: 0, x: 8, y: 10 },
        { id: 't2', relX: 2, relY: 0, x: 12, y: 10 }
      ]
    };
    const resistorB: CircuitComponent = {
      id: 'resistor-b',
      type: 'resistor',
      name: 'Resistor B',
      x: 16,
      y: 10,
      rotation: 0,
      properties: {},
      terminals: [
        { id: 't1', relX: -2, relY: 0, x: 14, y: 10 },
        { id: 't2', relX: 2, relY: 0, x: 18, y: 10 }
      ]
    };
    const wire: CircuitWire = {
      id: 'wire-a-b',
      from: { componentId: 'resistor-a', terminalId: 't2' },
      to: { componentId: 'resistor-b', terminalId: 't1' }
    };

    state.addComponent(resistorA);
    state.addComponent(resistorB);
    state.addWire(wire);
    state.copyItems(['resistor-a', 'resistor-b']);
    state.pasteSelection({ x: 30, y: 25 });

    const next = useStore.getState();
    expect(next.components.length).toBe(4);
    expect(next.wires.length).toBe(2);

    const pasted = next.components.slice(2);
    expect(pasted[0]).toMatchObject({ x: 30, y: 25 });
    expect(pasted[1]).toMatchObject({ x: 36, y: 25 });

    const pastedWire = next.wires[1];
    expect(pastedWire.from.componentId).toBe(pasted[0].id);
    expect(pastedWire.to.componentId).toBe(pasted[1].id);
  });

  it('deve girar nos sentidos horario, anti-horario e 180 graus', () => {
    const state = useStore.getState();

    const resistor: CircuitComponent = {
      id: 'resistor-rotate',
      type: 'resistor',
      name: 'Resistor Rotate',
      x: 10,
      y: 10,
      rotation: 0,
      properties: {},
      terminals: [
        { id: 't1', relX: -2, relY: 0, x: 8, y: 10 },
        { id: 't2', relX: 2, relY: 0, x: 12, y: 10 }
      ]
    };

    state.addComponent(resistor);
    state.updateComponentRotation('resistor-rotate', -90);
    expect(useStore.getState().components[0].rotation).toBe(270);

    state.updateComponentRotation('resistor-rotate', 180);
    expect(useStore.getState().components[0].rotation).toBe(90);

    state.updateComponentRotation('resistor-rotate', 90);
    expect(useStore.getState().components[0].rotation).toBe(180);
  });

  it('deve colar componente na posição do cursor mantendo terminais alinhados', () => {
    const state = useStore.getState();

    const resistor: CircuitComponent = {
      id: 'resistor-cursor',
      type: 'resistor',
      name: 'Resistor R20',
      x: 10,
      y: 10,
      rotation: 0,
      properties: {},
      terminals: [
        { id: 't1', relX: -2, relY: 0, x: 8, y: 10 },
        { id: 't2', relX: 2, relY: 0, x: 12, y: 10 }
      ]
    };

    state.addComponent(resistor);
    state.setSelectedComponentId('resistor-cursor');
    state.copySelection();
    state.pasteSelection({ x: 30, y: 25 });

    const pastedComp = useStore.getState().components[1];
    expect(pastedComp.x).toBe(30);
    expect(pastedComp.y).toBe(25);
    expect(pastedComp.terminals[0].x).toBe(28);
    expect(pastedComp.terminals[0].y).toBe(25);
    expect(pastedComp.terminals[1].x).toBe(32);
    expect(pastedComp.terminals[1].y).toBe(25);
  });

  it('deve normalizar terminais de peças carregadas com escala antiga', () => {
    const state = useStore.getState();

    state.loadProject({
      project: {
        id: 'legacy-project',
        name: 'Projeto legado',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      components: [{
        id: 'function-generator-legacy',
        type: 'function_generator',
        name: 'Gerador legado',
        x: 20,
        y: 12,
        rotation: 0,
        properties: {},
        terminals: [
          { id: 'p', relX: -40, relY: 0, x: -20, y: 12 },
          { id: 'n', relX: 40, relY: 0, x: 60, y: 12 }
        ]
      }],
      wires: [],
      texts: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      projectDevices: []
    });

    const normalized = useStore.getState().components[0];
    expect(normalized.terminals[0]).toMatchObject({ id: 'p', relX: -2, relY: 0, x: 18, y: 12 });
    expect(normalized.terminals[1]).toMatchObject({ id: 'n', relX: 2, relY: 0, x: 22, y: 12 });
  });
});
