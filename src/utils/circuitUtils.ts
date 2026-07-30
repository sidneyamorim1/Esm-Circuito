import type { CircuitComponent, Terminal, ComponentProperty } from '../types/circuit';

const SI_PREFIX_MULTIPLIERS: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  'µ': 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
};

export function parseSiValue(input: string | number): number {
  if (typeof input === 'number') return input;

  const normalized = input.trim().replace(',', '.');
  if (!normalized) return Number.NaN;

  const match = normalized.match(/^([-+]?\d*\.?\d+)\s*([pnuµmkKM]?)\s*[a-zA-ZΩ]*$/);
  if (!match) return Number(normalized);

  const value = Number(match[1]);
  const multiplier = SI_PREFIX_MULTIPLIERS[match[2]] ?? 1;
  return value * multiplier;
}

export function formatSiValue(value: number, unit = ''): string {
  if (!Number.isFinite(value)) return '';

  const abs = Math.abs(value);
  const prefixes = [
    { prefix: 'M', multiplier: 1e6 },
    { prefix: 'k', multiplier: 1e3 },
    { prefix: 'm', multiplier: 1e-3 },
    { prefix: 'u', multiplier: 1e-6 },
    { prefix: 'n', multiplier: 1e-9 },
    { prefix: 'p', multiplier: 1e-12 }
  ];

  const selected = prefixes.find(item => abs >= item.multiplier && abs / item.multiplier < 1000);
  if (!selected) return `${value}${unit}`;

  const scaled = value / selected.multiplier;
  return `${Number(scaled.toPrecision(4))}${selected.prefix}${unit}`;
}

// Função para rotacionar coordenadas inteiras de terminais
export function rotateTerminalCoords(relX: number, relY: number, rotation: number): { relX: number; relY: number } {
  const angle = (rotation % 360 + 360) % 360;
  
  if (angle === 90) {
    return { relX: -relY, relY: relX };
  } else if (angle === 180) {
    return { relX: -relX, relY: -relY };
  } else if (angle === 270) {
    return { relX: relY, relY: -relX };
  }
  
  return { relX, relY };
}

// Recalcula as coordenadas absolutas (grid) dos terminais com base no centro do componente e na rotação (suportando espelhamento)
export function updateComponentTerminals(comp: CircuitComponent): CircuitComponent {
  const mirrorX = comp.mirrorX ?? false;
  const mirrorY = comp.mirrorY ?? false;

  const updatedTerminals = comp.terminals.map(term => {
    // Se espelhado, inverte a coordenada relativa do terminal antes da rotação
    const relX = mirrorX ? -term.relX : term.relX;
    const relY = mirrorY ? -term.relY : term.relY;

    const rotated = rotateTerminalCoords(relX, relY, comp.rotation);
    return {
      ...term,
      x: comp.x + rotated.relX,
      y: comp.y + rotated.relY
    };
  });

  return {
    ...comp,
    terminals: updatedTerminals
  };
}

// Cria propriedades padrões para cada tipo de componente
function getDefaultProperties(type: string): Record<string, ComponentProperty> {
  const props: Record<string, ComponentProperty> = {};

  switch (type) {
    case 'resistor':
      props.resistance = {
        name: 'resistance',
        label: 'Resistência',
        value: 1000,
        unit: 'Ω',
        type: 'number',
        description: 'Oposição do componente ao fluxo de corrente'
      };
      break;
    case 'source_dc':
    case 'bench_supply':
      props.voltage = {
        name: 'voltage',
        label: type === 'bench_supply' ? 'Tensão Ajustável' : 'Tensão DC',
        value: 5,
        unit: 'V',
        type: 'number',
        description: 'Tensão contínua fornecida'
      };
      if (type === 'bench_supply') {
        props.currentLimit = {
          name: 'currentLimit',
          label: 'Limite de Corrente',
          value: 1,
          unit: 'A',
          type: 'number',
          description: 'Corrente máxima permitida pela fonte de bancada'
        };
      }
      break;
    case 'source_ac':
      props.amplitude = {
        name: 'amplitude',
        label: 'Amplitude (Pico)',
        value: 5,
        unit: 'V',
        type: 'number',
        description: 'Tensão de pico da onda senoidal'
      };
      props.frequency = {
        name: 'frequency',
        label: 'Frequência',
        value: 60,
        unit: 'Hz',
        type: 'number',
        description: 'Ciclos por segundo da oscilação'
      };
      props.offset = {
        name: 'offset',
        label: 'Offset DC',
        value: 0,
        unit: 'V',
        type: 'number',
        description: 'Deslocamento de corrente contínua da onda'
      };
      props.phase = {
        name: 'phase',
        label: 'Fase Inicial',
        value: 0,
        unit: '°',
        type: 'number',
        description: 'Deslocamento angular em graus'
      };
      break;
    case 'source_pulse':
      props.amplitude = {
        name: 'amplitude',
        label: 'Amplitude (Pico)',
        value: 5,
        unit: 'V',
        type: 'number',
        description: 'Tensão de pico do pulso'
      };
      props.frequency = {
        name: 'frequency',
        label: 'Frequência',
        value: 1000,
        unit: 'Hz',
        type: 'number',
        description: 'Frequência de repetição dos pulsos'
      };
      props.dutyCycle = {
        name: 'dutyCycle',
        label: 'Duty Cycle',
        value: 50,
        unit: '%',
        type: 'number',
        description: 'Percentagem de tempo do ciclo em nível alto'
      };
      props.offset = {
        name: 'offset',
        label: 'Offset',
        value: 0,
        unit: 'V',
        type: 'number',
        description: 'Nível de tensão em nível baixo'
      };
      break;
    case 'function_generator':
      props.waveform = {
        name: 'waveform',
        label: 'Forma de Onda',
        value: 'sine',
        type: 'select',
        options: ['sine', 'square', 'triangle', 'sawtooth'],
        description: 'Forma de onda (Senoidal, Quadrada, Triangular, Dente de Serra)'
      };
      props.frequency = {
        name: 'frequency',
        label: 'Frequência',
        value: 1000,
        unit: 'Hz',
        type: 'number',
        description: 'Frequência do sinal em Hertz'
      };
      props.amplitude = {
        name: 'amplitude',
        label: 'Amplitude (Pico)',
        value: 5,
        unit: 'V',
        type: 'number',
        description: 'Tensão de pico a partir de 0V'
      };
      props.offset = {
        name: 'offset',
        label: 'Offset DC',
        value: 0,
        unit: 'V',
        type: 'number',
        description: 'Tensão contínua somada ao sinal'
      };
      props.dutyCycle = {
        name: 'dutyCycle',
        label: 'Ciclo de Trabalho',
        value: 50,
        unit: '%',
        type: 'number',
        description: 'Porcentagem de ciclo ativo para onda quadrada'
      };
      break;
    case 'source_current':
      props.current = {
        name: 'current',
        label: 'Corrente',
        value: 0.01,
        unit: 'A',
        type: 'number',
        description: 'Corrente constante fornecida pelo ramo'
      };
      break;
    case 'capacitor':
    case 'capacitor_ceramic':
    case 'capacitor_polyester':
      props.capacitance = {
        name: 'capacitance',
        label: 'Capacitância',
        value: 1e-6,
        unit: 'F',
        type: 'number',
        description: 'Aceita valores como 470uF, 100nF, 22pF ou 0.00047F'
      };
      break;
    case 'inductor':
      props.inductance = {
        name: 'inductance',
        label: 'Indutância',
        value: 1e-3,
        unit: 'H',
        type: 'number',
        description: 'Inércia elétrica do componente a variações de corrente'
      };
      break;
    case 'transistor_bjt_npn':
    case 'transistor_bjt_pnp':
      props.beta = {
        name: 'beta',
        label: 'Ganho (hFE)',
        value: 100,
        type: 'number',
        description: 'Ganho de corrente DC do transistor (Beta/hFE)'
      };
      break;
    case 'switch':
      props.state = {
        name: 'state',
        label: 'Fechado',
        value: false,
        type: 'boolean',
        description: 'Define se a chave está fechada (conduzindo)'
      };
      break;
    case 'diodo':
      break;
    case 'led':
      props.color = {
        name: 'color',
        label: 'Cor do LED',
        value: 'red',
        type: 'select',
        options: ['red', 'green', 'blue', 'yellow', 'orange', 'white'],
        description: 'Cor visual do LED no esquema e na placa 3D'
      };
      break;
    case 'ldr':
      props.light = {
        name: 'light',
        label: 'Intensidade de Luz',
        value: 50,
        unit: '%',
        type: 'number',
        description: 'Intensidade luminosa incidindo sobre o fotoresistor'
      };
      break;
    case 'pot':
      props.resistance = {
        name: 'resistance',
        label: 'Resistência Total',
        value: 10000,
        unit: 'Ω',
        type: 'number',
        description: 'Resistência nominal total do potenciômetro'
      };
      props.setting = {
        name: 'setting',
        label: 'Posição do Cursor',
        value: 50,
        unit: '%',
        type: 'number',
        description: 'Posição do pino central de 0 a 100%'
      };
      break;
    case 'motor_dc':
      props.resistance = {
        name: 'resistance',
        label: 'Resistência Interna',
        value: 10,
        unit: 'Ω',
        type: 'number',
        description: 'Resistência da armadura do motor'
      };
      props.inductance = {
        name: 'inductance',
        label: 'Indutância',
        value: 1e-3,
        unit: 'H',
        type: 'number',
        description: 'Indutância da bobina'
      };
      break;
    case 'relay':
      props.coilResistance = {
        name: 'coilResistance',
        label: 'Resistência da Bobina',
        value: 100,
        unit: 'Ω',
        type: 'number',
        description: 'Resistência elétrica da bobina do relé'
      };
      props.triggerVoltage = {
        name: 'triggerVoltage',
        label: 'Tensão de Acionamento',
        value: 5,
        unit: 'V',
        type: 'number',
        description: 'Tensão necessária para atracar o relé'
      };
      break;
    case 'multimeter':
      props.mode = {
        name: 'mode',
        label: 'Modo de Medição',
        value: 'voltage',
        type: 'select',
        options: ['voltage', 'current', 'continuity'],
        description: 'Seleciona medição de tensão, corrente ou continuidade'
      };
      break;
    case 'logic_analyzer':
      props.threshold = {
        name: 'threshold',
        label: 'Limiar Lógico',
        value: 2.5,
        unit: 'V',
        type: 'number',
        description: 'Tensão mínima para considerar nível lógico alto'
      };
      break;
    case 'net_label':
      props.netName = {
        name: 'netName',
        label: 'Nome da Rede',
        value: 'VCC',
        type: 'text',
        description: 'Terminais com o mesmo nome de rede são conectados eletricamente'
      };
      break;
  }

  return props;
}

// Cria os terminais relativos de acordo com o tipo
export function getDefaultTerminals(type: string): { id: string; relX: number; relY: number; label?: string }[] {
  if (type === 'junction') {
    return [{ id: 'j1', relX: 0, relY: 0, label: 'J' }];
  }
  
  if (type === 'ground') {
    return [{ id: 'gnd', relX: -1, relY: 0, label: 'GND' }];
  }
  
  if (type === 'diodo' || type === 'led' || type === 'zener') {
    return [
      { id: 'a', relX: -2, relY: 0, label: 'Anodo' },
      { id: 'c', relX: 2, relY: 0, label: 'Cathode' }
    ];
  }

  if (type === 'source_dc' || type === 'bench_supply' || type === 'source_ac' || type === 'source_pulse' || type === 'function_generator' || type === 'source_current' || type === 'voltmeter' || type === 'ammeter' || type === 'multimeter') {
    return [
      { id: 'p', relX: -2, relY: 0, label: '+' },
      { id: 'n', relX: 2, relY: 0, label: '-' }
    ];
  }

  if (type === 'logic_analyzer') {
    return [
      { id: 'd0', relX: -3, relY: -2, label: 'D0' },
      { id: 'd1', relX: -3, relY: -1, label: 'D1' },
      { id: 'd2', relX: -3, relY: 0, label: 'D2' },
      { id: 'd3', relX: -3, relY: 1, label: 'D3' },
      { id: 'gnd', relX: -3, relY: 2, label: 'GND' }
    ];
  }

  if (type === 'net_label') {
    return [{ id: 'net', relX: 0, relY: 0, label: 'NET' }];
  }

  if (type === 'oscilloscope') {
    return [
      { id: 'ch1', relX: -3, relY: -1, label: 'CH1' },
      { id: 'g1', relX: -3, relY: 1, label: 'G1' },
      { id: 'ch2', relX: 3, relY: -1, label: 'CH2' },
      { id: 'g2', relX: 3, relY: 1, label: 'G2' }
    ];
  }

  if (type === 'pot') {
    return [
      { id: 'a', relX: -2, relY: -1, label: 'A' },
      { id: 'b', relX: -2, relY: 1, label: 'B' },
      { id: 'w', relX: 2, relY: 0, label: 'W' }
    ];
  }

  if (type === 'logic_and' || type === 'logic_or') {
    return [
      { id: 'in1', relX: -2, relY: -1, label: 'In1' },
      { id: 'in2', relX: -2, relY: 1, label: 'In2' },
      { id: 'out', relX: 2, relY: 0, label: 'Out' }
    ];
  }

  if (type === 'logic_not') {
    return [
      { id: 'in', relX: -2, relY: 0, label: 'In' },
      { id: 'out', relX: 2, relY: 0, label: 'Out' }
    ];
  }

  if (type === 'transistor_bjt_npn' || type === 'transistor_bjt_pnp') {
    return [
      { id: 'c', relX: 1, relY: -2, label: 'C' }, // Coletor no topo
      { id: 'b', relX: -2, relY: 0, label: 'B' }, // Base na esquerda
      { id: 'e', relX: 1, relY: 2, label: 'E' }   // Emissor embaixo
    ];
  }

  if (type === 'relay') {
    return [
      { id: 'coil1', relX: -2, relY: -1, label: 'C1' },
      { id: 'coil2', relX: -2, relY: 1, label: 'C2' },
      { id: 'com', relX: 2, relY: 0, label: 'COM' },
      { id: 'nc', relX: 2, relY: -2, label: 'NC' },
      { id: 'no', relX: 2, relY: 2, label: 'NO' }
    ];
  }

  if (type === 'probe_dc' || type === 'probe_ac') {
    return [{ id: 'p', relX: 0, relY: 0, label: 'Probe' }];
  }

  // Resistor, LDR, capacitor, indutor, switch, motor_dc
  return [
    { id: 't1', relX: -2, relY: 0, label: 'T1' },
    { id: 't2', relX: 2, relY: 0, label: 'T2' }
  ];
}

// Cria um novo componente do circuito pronto para inserção no Canvas
export function createCircuitComponent(
  type: string,
  x: number,
  y: number,
  rotation: number = 0
): CircuitComponent {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 5);
  const id = `${type}_${timestamp}_${randomStr}`;

  const defaultNames: Record<string, string> = {
    junction: 'Junção',
    ground: 'Terra',
    resistor: 'Resistor',
    source_dc: 'Fonte DC',
    bench_supply: 'Fonte de Bancada',
    source_ac: 'Gerador AC',
    source_pulse: 'Pulso',
    function_generator: 'Gerador de Funções',
    source_current: 'Fonte Corrente',
    capacitor: 'Capacitor',
    capacitor_ceramic: 'Cap. Cerâmico',
    capacitor_polyester: 'Cap. Poliéster',
    inductor: 'Indutor',
    diodo: 'Diodo',
    zener: 'Diodo Zener',
    led: 'LED',
    ldr: 'LDR (Fotores.)',
    transistor_bjt_npn: 'Transistor NPN',
    transistor_bjt_pnp: 'Transistor PNP',
    switch: 'Switch',
    ammeter: 'Amperímetro',
    voltmeter: 'Voltímetro',
    oscilloscope: 'Osciloscópio',
    multimeter: 'Multímetro',
    logic_analyzer: 'Analisador Lógico',
    net_label: 'Net Label',
    probe_dc: 'Ponta de Prova DC',
    probe_ac: 'Ponta de Prova AC',
    pot: 'Potenciômetro',
    logic_and: 'Porta AND',
    logic_or: 'Porta OR',
    logic_not: 'Porta NOT',
    motor_dc: 'Motor DC',
    relay: 'Relé'
  };

  const name = `${defaultNames[type] || 'Componente'} ${randomStr.toUpperCase()}`;

  const defaultTerms = getDefaultTerminals(type);
  const terminals: Terminal[] = defaultTerms.map(term => ({
    ...term,
    x: x + term.relX,
    y: y + term.relY
  }));

  const component: CircuitComponent = {
    id,
    type,
    name,
    x,
    y,
    rotation,
    properties: getDefaultProperties(type),
    terminals
  };

  return updateComponentTerminals(component);
}

export function normalizeComponentGeometry(comp: CircuitComponent): CircuitComponent {
  const defaultTerminals = getDefaultTerminals(comp.type);
  const existingById = new Map(comp.terminals.map(term => [term.id, term]));

  const terminals: Terminal[] = defaultTerminals.map(defaultTerm => {
    const existing = existingById.get(defaultTerm.id);
    return {
      ...existing,
      ...defaultTerm,
      x: comp.x + defaultTerm.relX,
      y: comp.y + defaultTerm.relY
    };
  });

  return updateComponentTerminals({
    ...comp,
    terminals
  });
}
