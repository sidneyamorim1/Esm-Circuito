import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../state/useStore';
import type { CircuitComponent, CircuitWire } from '../types/circuit';
import { createCircuitComponent, formatSiValue, parseSiValue } from '../utils/circuitUtils';

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

  it('deve aceitar capacitancia com prefixos como uF, nF e pF', () => {
    expect(parseSiValue('470uF')).toBeCloseTo(470e-6);
    expect(parseSiValue('100nF')).toBeCloseTo(100e-9);
    expect(parseSiValue('22pF')).toBeCloseTo(22e-12);
    expect(parseSiValue('')).toBeNaN();
    expect(formatSiValue(470e-6, 'F')).toBe('470uF');
    expect(formatSiValue(Number.NaN, 'F')).toBe('');
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

  it('deve copiar um componente com fio externo mantendo a conexão no colar', () => {
    const state = useStore.getState();

    const source = createCircuitComponent('source_dc', 10, 10);
    const resistor = createCircuitComponent('resistor', 16, 10);
    const ground = createCircuitComponent('ground', 22, 14);

    const externalWire: CircuitWire = {
      id: 'wire-source-resistor',
      from: { componentId: source.id, terminalId: 'p' },
      to: { componentId: resistor.id, terminalId: 't1' }
    };

    state.addComponent(source);
    state.addComponent(resistor);
    state.addComponent(ground);
    state.addWire(externalWire);

    state.copyItems([resistor.id]);
    state.pasteSelection({ x: 30, y: 20 });

    const next = useStore.getState();
    expect(next.components.length).toBe(4);
    expect(next.wires.length).toBe(2);

    const pastedResistor = next.components.find(c => c.name.includes('Copia') && c.type === 'resistor');
    expect(pastedResistor).toBeTruthy();

    const pastedWire = next.wires.find(w => w.id !== 'wire-source-resistor');
    expect(pastedWire).toBeTruthy();
    expect(pastedWire?.to.componentId).toBe(pastedResistor?.id);
    expect(pastedWire?.from.componentId).toBe(source.id);
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

  it('deve inserir pontas de prova DC e AC com um único terminal central', () => {
    const state = useStore.getState();

    const probeDc = createCircuitComponent('probe_dc', 12, 18, 0);
    const probeAc = createCircuitComponent('probe_ac', 14, 20, 90);

    state.addComponent(probeDc);
    state.addComponent(probeAc);

    const components = useStore.getState().components;
    expect(components).toHaveLength(2);
    expect(components[0].terminals).toHaveLength(1);
    expect(components[1].terminals).toHaveLength(1);
    expect(components[0].terminals[0]).toMatchObject({ id: 'p', x: 12, y: 18, relX: 0, relY: 0 });
    expect(components[1].terminals[0]).toMatchObject({ id: 'p', x: 14, y: 20, relX: 0, relY: 0 });
  });

  it('deve duplicar pontas de prova sem separar o terminal do corpo', () => {
    const state = useStore.getState();

    const probe = createCircuitComponent('probe_dc', 10, 10, 0);
    state.addComponent(probe);
    state.setSelectedComponentId(probe.id);

    state.duplicateSelection();

    const components = useStore.getState().components;
    expect(components).toHaveLength(2);

    const duplicated = components[1];
    expect(duplicated.type).toBe('probe_dc');
    expect(duplicated.terminals).toHaveLength(1);
    expect(duplicated.terminals[0]).toMatchObject({ id: 'p', relX: 0, relY: 0 });
    expect(duplicated.x).toBe(13);
    expect(duplicated.y).toBe(13);
  });

  it('deve rotacionar e espelhar pontas de prova sem mudar o ponto de medição', () => {
    const state = useStore.getState();

    const probe = createCircuitComponent('probe_ac', 7, 9, 0);
    state.addComponent(probe);

    state.updateComponentRotation(probe.id, 90);
    state.toggleComponentMirrorX(probe.id);
    state.toggleComponentMirrorY(probe.id);

    const updated = useStore.getState().components[0];
    expect(updated.terminals).toHaveLength(1);
    expect(updated.terminals[0]).toMatchObject({ id: 'p', x: 7, y: 9, relX: 0, relY: 0 });
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
