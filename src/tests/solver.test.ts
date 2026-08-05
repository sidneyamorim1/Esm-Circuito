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
  it('mede corrente com multímetro em série no modo corrente', () => {
    const source = createCircuitComponent('source_dc', 0, 0);
    source.properties.voltage.value = 25;

    const seriesResistor = createCircuitComponent('resistor', 6, 0);
    seriesResistor.properties.resistance.value = 500;

    const multimeter = createCircuitComponent('multimeter', 12, 0);
    multimeter.properties.mode.value = 'current';

    const zener = createCircuitComponent('zener', 18, 2);
    zener.properties.zenerVoltage.value = 5.1;

    const load = createCircuitComponent('resistor', 24, 2);
    load.properties.resistance.value = 1000;

    const ground = createCircuitComponent('ground', 18, 6);

    const wires: CircuitWire[] = [
      {
        id: 'w_source_to_series',
        from: { componentId: source.id, terminalId: 'p' },
        to: { componentId: seriesResistor.id, terminalId: 't1' }
      },
      {
        id: 'w_series_to_meter',
        from: { componentId: seriesResistor.id, terminalId: 't2' },
        to: { componentId: multimeter.id, terminalId: 'p' }
      },
      {
        id: 'w_meter_to_zener',
        from: { componentId: multimeter.id, terminalId: 'n' },
        to: { componentId: zener.id, terminalId: 'c' }
      },
      {
        id: 'w_zener_to_load',
        from: { componentId: zener.id, terminalId: 'c' },
        to: { componentId: load.id, terminalId: 't1' }
      },
      {
        id: 'w_zener_to_ground',
        from: { componentId: zener.id, terminalId: 'a' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      },
      {
        id: 'w_load_to_ground',
        from: { componentId: load.id, terminalId: 't2' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      },
      {
        id: 'w_source_negative_to_ground',
        from: { componentId: source.id, terminalId: 'n' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      }
    ];

    const { result } = runSimulationStep(
      [source, seriesResistor, multimeter, zener, load, ground],
      wires,
      initialSolverState(),
      0.0001
    );

    expect(result.componentStates[load.id].voltage).toBeCloseTo(5.1, 1);
    expect(Math.abs(result.componentStates[multimeter.id].current)).toBeCloseTo((25 - 5.1) / 500, 2);
    expect(Math.abs(result.wireCurrents.w_series_to_meter)).toBeCloseTo((25 - 5.1) / 500, 2);
    expect(Math.abs(result.wireCurrents.w_meter_to_zener)).toBeCloseTo((25 - 5.1) / 500, 2);
  });

  it('mantém leitura e fluxo do multímetro em corrente sem terra explícito', () => {
    const source = createCircuitComponent('source_dc', 0, 0);
    source.properties.voltage.value = 21;

    const seriesResistor = createCircuitComponent('resistor', 6, 0);
    seriesResistor.properties.resistance.value = 100;

    const ammeter = createCircuitComponent('multimeter', 12, 0);
    ammeter.properties.mode.value = 'current';

    const zener = createCircuitComponent('zener', 18, 2);
    zener.properties.zenerVoltage.value = 5.1;

    const voltmeter = createCircuitComponent('multimeter', 24, 0);
    voltmeter.properties.mode.value = 'voltage';

    const wires: CircuitWire[] = [
      {
        id: 'w_source_to_series',
        from: { componentId: source.id, terminalId: 'p' },
        to: { componentId: seriesResistor.id, terminalId: 't1' }
      },
      {
        id: 'w_series_to_ammeter',
        from: { componentId: seriesResistor.id, terminalId: 't2' },
        to: { componentId: ammeter.id, terminalId: 'p' }
      },
      {
        id: 'w_ammeter_to_zener',
        from: { componentId: ammeter.id, terminalId: 'n' },
        to: { componentId: zener.id, terminalId: 'c' }
      },
      {
        id: 'w_zener_to_voltmeter_top',
        from: { componentId: zener.id, terminalId: 'c' },
        to: { componentId: voltmeter.id, terminalId: 'p' }
      },
      {
        id: 'w_voltmeter_to_source_negative',
        from: { componentId: voltmeter.id, terminalId: 'n' },
        to: { componentId: source.id, terminalId: 'n' }
      },
      {
        id: 'w_zener_to_source_negative',
        from: { componentId: zener.id, terminalId: 'a' },
        to: { componentId: source.id, terminalId: 'n' }
      }
    ];

    const { result } = runSimulationStep(
      [source, seriesResistor, ammeter, zener, voltmeter],
      wires,
      initialSolverState(),
      0.0001
    );

    const expectedCurrent = (21 - 5.1) / 100;
    expect(result.componentStates[voltmeter.id].voltage).toBeCloseTo(5.1, 1);
    expect(Math.abs(result.componentStates[ammeter.id].current)).toBeCloseTo(expectedCurrent, 2);
    expect(Math.abs(result.wireCurrents.w_series_to_ammeter)).toBeCloseTo(expectedCurrent, 2);
    expect(Math.abs(result.wireCurrents.w_ammeter_to_zener)).toBeCloseTo(expectedCurrent, 2);
  });

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

  it('não interrompe a simulação quando existe um componente isolado no esquema', () => {
    const ground = createCircuitComponent('ground', 0, 0);
    const resistor = createCircuitComponent('resistor', 12, 0);
    resistor.properties.resistance.value = 1000;

    const step = runSimulationStep([ground, resistor], [], initialSolverState(), 0.0001);

    expect(step.result.componentStates[resistor.id]).toBeTruthy();
    expect(step.result.componentStates[resistor.id].current).toBeCloseTo(0, 8);
    expect(Number.isFinite(step.result.componentStates[resistor.id].voltage)).toBe(true);
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

describe('Circuit solver Zener model', () => {
  it('usa a tensão Zener configurada na ruptura reversa', () => {
    const source = createCircuitComponent('source_dc', 0, 0);
    source.properties.voltage.value = 12;

    const seriesResistor = createCircuitComponent('resistor', 6, 0);
    seriesResistor.properties.resistance.value = 1000;

    const zener = createCircuitComponent('zener', 12, 2);
    zener.properties.zenerVoltage.value = 4.7;

    const load = createCircuitComponent('resistor', 16, 2);
    load.properties.resistance.value = 10000;

    const ground = createCircuitComponent('ground', 12, 6);

    const wires: CircuitWire[] = [
      {
        id: 'w_source_to_series',
        from: { componentId: source.id, terminalId: 'p' },
        to: { componentId: seriesResistor.id, terminalId: 't1' }
      },
      {
        id: 'w_series_to_zener_cathode',
        from: { componentId: seriesResistor.id, terminalId: 't2' },
        to: { componentId: zener.id, terminalId: 'c' }
      },
      {
        id: 'w_zener_to_load_top',
        from: { componentId: zener.id, terminalId: 'c' },
        to: { componentId: load.id, terminalId: 't1' }
      },
      {
        id: 'w_zener_anode_to_ground',
        from: { componentId: zener.id, terminalId: 'a' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      },
      {
        id: 'w_load_to_ground',
        from: { componentId: load.id, terminalId: 't2' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      },
      {
        id: 'w_source_negative_to_ground',
        from: { componentId: source.id, terminalId: 'n' },
        to: { componentId: ground.id, terminalId: 'gnd' }
      }
    ];

    const { result } = runSimulationStep([source, seriesResistor, zener, load, ground], wires, initialSolverState(), 0.0001);

    expect(result.componentStates[load.id].voltage).toBeCloseTo(4.7, 2);
    expect(result.componentStates[zener.id].voltage).toBeCloseTo(-4.7, 2);
    expect(result.componentStates[zener.id].current).toBeLessThan(0);
  });
});
