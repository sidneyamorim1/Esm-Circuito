import { describe, it, expect } from 'vitest';
import { analyzeCircuit, explainCircuit, generateCircuitFromPrompt } from '../services/aiService';
import { createCircuitComponent } from '../utils/circuitUtils';
import type { CircuitWire } from '../types/circuit';

describe('aiService - Copiloto de IA Faustad', () => {
  it('deve diagnosticar canvas vazio', () => {
    const diag = analyzeCircuit([], []);
    expect(diag.summary).toContain('vazio');
    expect(diag.issues.length).toBeGreaterThan(0);
  });

  it('deve alertar sobre ausência de terra (GND) e LED sem resistor', () => {
    const src = createCircuitComponent('source_dc', 10, 10);
    const led = createCircuitComponent('led', 20, 10);
    const wires: CircuitWire[] = [
      { id: 'w1', from: { componentId: src.id, terminalId: 'p' }, to: { componentId: led.id, terminalId: 'a' } }
    ];

    const diag = analyzeCircuit([src, led], wires);
    expect(diag.issues.some(i => i.title.includes('Ausência de Aterramento'))).toBe(true);
    expect(diag.issues.some(i => i.title.includes('sem Resistor Limitador'))).toBe(true);
  });

  it('deve gerar explicação didática do circuito', () => {
    const src = createCircuitComponent('source_dc', 10, 10);
    const res = createCircuitComponent('resistor', 15, 6);
    const text = explainCircuit([src, res], []);

    expect(text).toContain('Análise Didática');
    expect(text).toContain('Resistor');
  });

  it('deve gerar template de circuito a partir de prompt em português', () => {
    const generated = generateCircuitFromPrompt('Monte um divisor de tensão');
    expect(generated).not.toBeNull();
    expect(generated?.components.length).toBe(4);
    expect(generated?.name).toContain('Divisor');
  });

  it('deve gerar circuito regulador Zener 24v para 5v', () => {
    const zenerCircuit = generateCircuitFromPrompt('monte um circuito zenner 24v para 5v regulador');
    expect(zenerCircuit).not.toBeNull();
    expect(zenerCircuit?.name).toContain('Zener');
    expect(zenerCircuit?.components.some(c => c.type === 'zener')).toBe(true);
  });
});
