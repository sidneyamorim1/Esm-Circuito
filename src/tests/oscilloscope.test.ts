import { describe, expect, it } from 'vitest';
import { runSimulationStep, type SolverState } from '../simulation/core/solver';
import { createCircuitComponent } from '../utils/circuitUtils';
import type { CircuitWire } from '../types/circuit';

// Função utilitária de arredondamento de escala (idêntica à implementação do Osciloscópio)
export const snapToNiceScale = (val: number): number => {
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

// Algoritmo de Auto Tune do Osciloscópio
export const autoTuneOscilloscope = (points: { time: number; ch1?: number; ch2?: number }[]) => {
  if (points.length === 0) return null;

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

  const ch1Vpp = ch1Count > 0 ? ch1Max - ch1Min : 0;
  const ch2Vpp = ch2Count > 0 ? ch2Max - ch2Min : 0;

  const ch1Scale = ch1Vpp > 1e-9 ? snapToNiceScale(ch1Vpp / 4.5) : 5;
  const ch1Offset = ch1Count > 0 ? (ch1Max + ch1Min) / 2 : 0;

  const ch2Scale = ch2Vpp > 1e-9 ? snapToNiceScale(ch2Vpp / 4.5) : 5;
  const ch2Offset = ch2Count > 0 ? (ch2Max + ch2Min) / 2 : 0;

  // Estimação do período
  let estimatedPeriod = 0;
  if (ch1Count >= 6 && ch1Max > ch1Min) {
    const mid = (ch1Max + ch1Min) / 2;
    const crossings: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const v1 = points[i - 1].ch1!;
      const v2 = points[i].ch1!;
      if (v1 < mid && v2 >= mid) {
        const t1 = points[i - 1].time;
        const t2 = points[i].time;
        const tCross = t1 + (t2 - t1) * ((mid - v1) / (v2 - v1 || 1e-9));
        crossings.push(tCross);
      }
    }
    if (crossings.length >= 2) {
      const periods = [];
      for (let i = 1; i < crossings.length; i++) {
        periods.push(crossings[i] - crossings[i - 1]);
      }
      estimatedPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
    }
  }

  const timeWindow = estimatedPeriod > 0 ? Math.max(0.0001, Math.min(2.0, estimatedPeriod * 3)) : 0.02;

  return {
    ch1Scale,
    ch1Offset,
    ch2Scale,
    ch2Offset,
    timeWindow,
    triggerLevel: ch1Offset
  };
};

describe('Oscilloscope Auto Tuning & Signal Scaling', () => {
  it('arredonda a escala para valores padrão 1-2-5 (snapToNiceScale)', () => {
    expect(snapToNiceScale(1.1)).toBe(1);
    expect(snapToNiceScale(2.3)).toBe(2);
    expect(snapToNiceScale(4.8)).toBe(5);
    expect(snapToNiceScale(8.2)).toBe(10);
    expect(snapToNiceScale(0.043)).toBe(0.05);
    expect(snapToNiceScale(0.0012)).toBe(0.001);
  });

  it('ajusta automaticamente escala, offset e janela de tempo para uma onda senoidal de 60Hz', () => {
    const frequency = 60; // 60 Hz -> Período = 16.67ms
    const amplitude = 127; // 127V pico (254V Vpp)
    const points = [];

    for (let t = 0; t <= 0.1; t += 0.0005) {
      const v = amplitude * Math.sin(2 * Math.PI * frequency * t);
      points.push({ time: t, ch1: v });
    }

    const autoResult = autoTuneOscilloscope(points);
    expect(autoResult).not.toBeNull();

    // Para Vpp = 254V, 254 / 4.5 = 56.4 -> snapToNiceScale(56.4) = 50V/div
    expect(autoResult?.ch1Scale).toBe(50);
    // Para onda simétrica em relação a 0V, o offset deve ser 0V
    expect(autoResult?.ch1Offset).toBeCloseTo(0, 2);
    // Janela de tempo de 3x o período (3 * 1/60s = 0.05s)
    expect(autoResult?.timeWindow).toBeCloseTo(0.05, 2);
  });

  it('ajusta offset para sinal com componente DC (ex: senóide com offset de +12V)', () => {
    const dcOffset = 12;
    const acAmplitude = 2; // Vpp = 4V
    const points = [];

    for (let t = 0; t <= 0.05; t += 0.0002) {
      const v = dcOffset + acAmplitude * Math.sin(2 * Math.PI * 100 * t);
      points.push({ time: t, ch1: v });
    }

    const autoResult = autoTuneOscilloscope(points);
    expect(autoResult?.ch1Offset).toBeCloseTo(12, 1);
    expect(autoResult?.triggerLevel).toBeCloseTo(12, 1);
    // Vpp = 4V, 4 / 4.5 = 0.88 -> snapToNiceScale(0.88) = 1V/div
    expect(autoResult?.ch1Scale).toBe(1);
  });

  it('simula um gerador de onda senoidal conectado ao osciloscópio via solver', () => {
    const acSource = createCircuitComponent('source_ac', 0, 0);
    acSource.properties.amplitude.value = 10;
    acSource.properties.frequency.value = 1000;

    const resistor = createCircuitComponent('resistor', 8, 0);
    resistor.properties.resistance.value = 100;

    const ground = createCircuitComponent('ground', 2, 4);

    const wires: CircuitWire[] = [
      { id: 'w1', from: { componentId: acSource.id, terminalId: 'p' }, to: { componentId: resistor.id, terminalId: 't1' } },
      { id: 'w2', from: { componentId: resistor.id, terminalId: 't2' }, to: { componentId: ground.id, terminalId: 'gnd' } },
      { id: 'w3', from: { componentId: ground.id, terminalId: 'gnd' }, to: { componentId: acSource.id, terminalId: 'n' } }
    ];

    const solverState: SolverState = {
      capacitorVoltages: {},
      capacitorCurrents: {},
      inductorVoltages: {},
      inductorCurrents: {},
      time: 0,
      nodeVoltages: {}
    };

    const step1 = runSimulationStep([acSource, resistor, ground], wires, solverState, 0.0001);
    expect(step1.result.componentStates[resistor.id].voltage).toBeDefined();

    // Coleta pontos ao longo do tempo para simular o osciloscópio
    const samples = [];
    let currentState = solverState;
    for (let i = 0; i < 50; i++) {
      const step = runSimulationStep([acSource, resistor, ground], wires, currentState, 0.0001);
      currentState = step.nextState;
      samples.push({
        time: currentState.time,
        ch1: step.result.componentStates[acSource.id].voltage
      });
    }

    expect(samples.length).toBe(50);
    const tuned = autoTuneOscilloscope(samples);
    expect(tuned).not.toBeNull();
    expect(tuned?.ch1Scale).toBeGreaterThan(0);
  });

  it('mantém a amplitude de pico correta no gerador de funções para leitura do osciloscópio', () => {
    const fgen = createCircuitComponent('function_generator', 0, 0);
    fgen.properties.amplitude.value = 10;
    fgen.properties.frequency.value = 1000;
    fgen.properties.waveform.value = 'sine';

    const resistor = createCircuitComponent('resistor', 8, 0);
    resistor.properties.resistance.value = 100;

    const ground = createCircuitComponent('ground', 2, 4);

    const wires: CircuitWire[] = [
      {
        id: 'w1',
        from: { componentId: fgen.id, terminalId: 'p' },
        to: { componentId: resistor.id, terminalId: 't1' },
        routePoints: [
          { x: -2, y: 2 },
          { x: 6, y: 2 }
        ]
      },
      {
        id: 'w2',
        from: { componentId: resistor.id, terminalId: 't2' },
        to: { componentId: ground.id, terminalId: 'gnd' },
        routePoints: [
          { x: 10, y: 4 },
          { x: 1, y: 4 }
        ]
      },
      {
        id: 'w3',
        from: { componentId: ground.id, terminalId: 'gnd' },
        to: { componentId: fgen.id, terminalId: 'n' }
      }
    ];

    const components = [fgen, resistor, ground];
    let state: SolverState = {
      capacitorVoltages: {},
      capacitorCurrents: {},
      inductorVoltages: {},
      inductorCurrents: {},
      time: 0,
      nodeVoltages: {}
    };

    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < 250; i++) {
      const step = runSimulationStep(components, wires, state, 0.00001);
      state = step.nextState;
      const voltage = step.result.componentStates[fgen.id].voltage;
      min = Math.min(min, voltage);
      max = Math.max(max, voltage);
    }

    expect(max).toBeGreaterThan(9.5);
    expect(min).toBeLessThan(-9.5);
  });
});
