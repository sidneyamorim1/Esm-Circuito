import { describe, it, expect, vi } from 'vitest';
import { analyzeCircuit, explainCircuit, generateCircuitFromPrompt, DEFAULT_AZURE_FOUNDRY_ENDPOINT, queryAzureFoundryApi } from '../services/aiService';
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

  it('deve conter o endpoint padrão do Azure AI Foundry para proj-eletronica', () => {
    expect(DEFAULT_AZURE_FOUNDRY_ENDPOINT).toBe('https://eletronica-sem-mimimi.services.ai.azure.com/api/projects/proj-eletronica');
  });

  it('deve realizar requisição com sucesso para o Azure AI Foundry mockado', async () => {
    const fakeResponse = {
      choices: [
        { message: { content: 'Resposta simulada do Azure AI Foundry para o circuito.' } }
      ]
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/threads')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: 'Not agent service' } })
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => fakeResponse
      } as Response;
    });

    const res = await queryAzureFoundryApi('dummy-key', DEFAULT_AZURE_FOUNDRY_ENDPOINT, 'Como funciona o resistor?', 'Resistor 1k');
    expect(res).toBe('Resposta simulada do Azure AI Foundry para o circuito.');
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

