import { describe, expect, it } from 'vitest';
import {
  createCircuitComponent,
  normalizeComponentGeometry,
  updateComponentTerminals
} from '../utils/circuitUtils';

describe('Probe geometry', () => {
  it('mantém as pontas de prova DC e AC com um único terminal central', () => {
    const probeDc = createCircuitComponent('probe_dc', 12, 18, 0);
    const probeAc = createCircuitComponent('probe_ac', 12, 18, 0);

    expect(probeDc.terminals).toHaveLength(1);
    expect(probeAc.terminals).toHaveLength(1);
    expect(probeDc.terminals[0]).toMatchObject({ id: 'p', x: 12, y: 18, relX: 0, relY: 0 });
    expect(probeAc.terminals[0]).toMatchObject({ id: 'p', x: 12, y: 18, relX: 0, relY: 0 });
  });

  it('preserva a geometria da ponta de prova ao normalizar e atualizar terminais', () => {
    const probe = createCircuitComponent('probe_dc', 20, 30, 90);
    const moved = updateComponentTerminals({ ...probe, x: 25, y: 35, rotation: 270, mirrorX: true, mirrorY: true });
    const normalized = normalizeComponentGeometry(moved);

    expect(moved.terminals).toHaveLength(1);
    expect(moved.terminals[0]).toMatchObject({ id: 'p', x: 25, y: 35, relX: 0, relY: 0 });
    expect(normalized.terminals).toHaveLength(1);
    expect(normalized.terminals[0]).toMatchObject({ id: 'p', x: 25, y: 35, relX: 0, relY: 0 });
  });
});

describe('Component default properties', () => {
  it('cria e migra diodo Zener com tensão de ruptura editável', () => {
    const zener = createCircuitComponent('zener', 10, 10, 0);

    expect(zener.properties.zenerVoltage).toMatchObject({
      label: 'Tensão Zener',
      value: 5.1,
      unit: 'V',
      type: 'number'
    });

    const legacyZener = {
      ...zener,
      properties: {}
    };

    expect(normalizeComponentGeometry(legacyZener).properties.zenerVoltage.value).toBe(5.1);
  });
});
