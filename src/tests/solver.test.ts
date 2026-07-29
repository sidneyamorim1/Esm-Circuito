import { describe, expect, it } from 'vitest';
import { runSimulationStep, type SolverState } from '../simulation/core/solver';
import { createCircuitComponent } from '../utils/circuitUtils';
import type { CircuitWire } from '../types/circuit';

const initialSolverState = (): SolverState => ({
  capacitorVoltages: {},
  capacitorCurrents: {},
  inductorVoltages: {},
  inductorCurrents: {},
  time: 0,
  nodeVoltages: {}
});

describe('Circuit solver current calculation', () => {
  it('calcula corrente de fio sem usar resistência artificial no MNA', () => {
    const source = createCircuitComponent('source_dc', 0, 0);
    source.properties.voltage.value = 5;

    const resistor = createCircuitComponent('resistor', 6, 0);
    resistor.properties.resistance.value = 1000;

    const ground = createCircuitComponent('ground', 4, 4);

    const wires: CircuitWire[] = [
      {
        id: 'w_source_to_resistor',
        from: { componentId: source.id, terminalId: 'p' },
        to: { componentId: resistor.id, terminalId: 't1' }
      },
      {
        id: 'w_resistor_to_ground',
        from: { componentId: resistor.id, terminalId: 't2' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      },
      {
        id: 'w_ground_to_source',
        from: { componentId: ground.id, terminalId: 'gnd' },
        to: { componentId: source.id, terminalId: 'n' }
      }
    ];

    const { result } = runSimulationStep([source, resistor, ground], wires, initialSolverState(), 0.0001);

    expect(result.componentStates[resistor.id].current).toBeCloseTo(0.005, 5);
    expect(result.componentStates[source.id].current).toBeCloseTo(0.005, 5);
    expect(result.wireCurrents.w_source_to_resistor).toBeCloseTo(0.005, 5);
    expect(result.wireCurrents.w_resistor_to_ground).toBeCloseTo(0.005, 5);
  });
});

describe('Circuit solver source waveforms', () => {
  it('interpreta a amplitude da fonte AC como valor de pico', () => {
    const source = createCircuitComponent('source_ac', 0, 0);
    source.properties.amplitude.value = 10;
    source.properties.frequency.value = 1000;
    source.properties.offset.value = 2;

    const ground = createCircuitComponent('ground', 4, 4);
    const resistor = createCircuitComponent('resistor', 6, 0);
    resistor.properties.resistance.value = 1000;

    const wires: CircuitWire[] = [
      {
        id: 'w_source_to_resistor',
        from: { componentId: source.id, terminalId: 'p' },
        to: { componentId: resistor.id, terminalId: 't1' }
      },
      {
        id: 'w_resistor_to_ground',
        from: { componentId: resistor.id, terminalId: 't2' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      },
      {
        id: 'w_ground_to_source',
        from: { componentId: ground.id, terminalId: 'gnd' },
        to: { componentId: source.id, terminalId: 'n' }
      }
    ];

    const stepAtPeak = runSimulationStep([source, resistor, ground], wires, {
      capacitorVoltages: {},
      capacitorCurrents: {},
      inductorVoltages: {},
      inductorCurrents: {},
      time: 0.00025,
      nodeVoltages: {}
    }, 0.0001);

    const stepAtTrough = runSimulationStep([source, resistor, ground], wires, {
      capacitorVoltages: {},
      capacitorCurrents: {},
      inductorVoltages: {},
      inductorCurrents: {},
      time: 0.00075,
      nodeVoltages: {}
    }, 0.0001);

    expect(stepAtPeak.result.componentStates[source.id].voltage).toBeCloseTo(12, 2);
    expect(stepAtTrough.result.componentStates[source.id].voltage).toBeCloseTo(-8, 2);
  });

  it('interpreta a amplitude do gerador de pulso como valor de pico', () => {
    const source = createCircuitComponent('source_pulse', 0, 0);
    source.properties.amplitude.value = 7;
    source.properties.frequency.value = 1000;
    source.properties.dutyCycle.value = 25;
    source.properties.offset.value = 1.5;

    const ground = createCircuitComponent('ground', 4, 4);
    const resistor = createCircuitComponent('resistor', 6, 0);
    resistor.properties.resistance.value = 1000;

    const wires: CircuitWire[] = [
      {
        id: 'w_source_to_resistor',
        from: { componentId: source.id, terminalId: 'p' },
        to: { componentId: resistor.id, terminalId: 't1' }
      },
      {
        id: 'w_resistor_to_ground',
        from: { componentId: resistor.id, terminalId: 't2' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      },
      {
        id: 'w_ground_to_source',
        from: { componentId: ground.id, terminalId: 'gnd' },
        to: { componentId: source.id, terminalId: 'n' }
      }
    ];

    const stepHigh = runSimulationStep([source, resistor, ground], wires, {
      capacitorVoltages: {},
      capacitorCurrents: {},
      inductorVoltages: {},
      inductorCurrents: {},
      time: 0.0001,
      nodeVoltages: {}
    }, 0.0001);

    const stepLow = runSimulationStep([source, resistor, ground], wires, {
      capacitorVoltages: {},
      capacitorCurrents: {},
      inductorVoltages: {},
      inductorCurrents: {},
      time: 0.0003,
      nodeVoltages: {}
    }, 0.0001);

    expect(stepHigh.result.componentStates[source.id].voltage).toBeCloseTo(8.5, 2);
    expect(stepLow.result.componentStates[source.id].voltage).toBeCloseTo(1.5, 2);
  });
});
