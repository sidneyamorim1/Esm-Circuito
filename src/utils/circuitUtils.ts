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
export function getDefaultProperties(type: string): Record<string, ComponentProperty> {
  const props: Record<string, ComponentProperty> = {};

  switch (type) {
    case 'resistor':
    case 'resistor_5w':
    case 'resistor_smd':
      props.resistance = {
        name: 'resistance',
        label: 'Resistência',
        value: 1000,
        unit: 'Ω',
        type: 'number',
        description: 'Valor da resistência em Ohms'
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
    case 'transistor_2sc5200':
    case 'transistor_2sa1943':
    case 'transistor_tip41':
    case 'transistor_tip42':
      props.beta = {
        name: 'beta',
        label: 'Ganho (β/hFE)',
        value: (type === 'transistor_2sc5200' || type === 'transistor_2sa1943') ? 80 : (type === 'transistor_tip41' || type === 'transistor_tip42') ? 50 : 100,
        unit: '',
        type: 'number',
        description: 'Ganho de corrente do transistor'
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
    case 'zener':
      props.zenerVoltage = {
        name: 'zenerVoltage',
        label: 'Tensão Zener',
        value: 5.1,
        unit: 'V',
        type: 'number',
        description: 'Tensão de ruptura reversa usada para regular a saída'
      };
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
    case 'trimpot_multi':
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
    case 'megohmmeter':
      props.testVoltage = {
        name: 'testVoltage',
        label: 'Tensão de Teste',
        value: 500,
        unit: 'V',
        type: 'select',
        options: ['250', '500', '1000', '2500'],
        description: 'Tensão contínua (DC) injetada durante o teste de isolação'
      };
      props.isTesting = {
        name: 'isTesting',
        label: 'Teste Ativo',
        value: false,
        type: 'boolean',
        description: 'Liga/desliga a injeção de alta tensão'
      };
      break;
    case 'lamp':
      props.nominalVoltage = {
        name: 'nominalVoltage',
        label: 'Tensão Nominal',
        value: 12,
        unit: 'V',
        type: 'number',
        description: 'Tensão nominal da lâmpada'
      };
      props.nominalResistance = {
        name: 'nominalResistance',
        label: 'Resistência a Frio',
        value: 24,
        unit: 'Ω',
        type: 'number',
        description: 'Resistência em Ohms'
      };
      break;
    case 'speaker':
      props.impedance = {
        name: 'impedance',
        label: 'Impedância',
        value: 8,
        unit: 'Ω',
        type: 'number',
        description: 'Impedância do Alto-falante'
      };
      break;
    case 'seven_segment':
      props.mode = {
        name: 'mode',
        label: 'Tipo',
        value: 'cathode',
        type: 'select',
        options: ['cathode', 'anode'],
        description: 'Catodo Comum ou Anodo Comum'
      };
      props.color = {
        name: 'color',
        label: 'Cor',
        value: 'red',
        type: 'select',
        options: ['red', 'green', 'blue', 'yellow'],
        description: 'Cor dos segmentos'
      };
      break;
    case 'diode_bridge':
      props.currentRating = {
        name: 'currentRating',
        label: 'Corrente Máx.',
        value: 10,
        unit: 'A',
        type: 'select',
        options: ['10', '25', '50'],
        description: 'Corrente nominal da ponte retificadora'
      };
      break;
    case 'ic_7442':
    case 'adc_0808':
    case 'audio_in':
    case 'vcc_terminal':
    case 'voltmeter':
    case 'ammeter':
    case 'ic_555':
    case 'opamp_tl072':
    case 'opamp_tl074':
    case 'regulator_7805':
    case 'arduino_nano':
      // Sem propriedades editáveis complexas
      break;
  }

  return props;
}

// Cria os terminais relativos de acordo com o tipo
export function getDefaultTerminals(type: string): { id: string; relX: number; relY: number; label?: string }[] {
  if (type === 'junction') {
    return [{ id: 'j1', relX: 0, relY: 0, label: 'J' }];
  }
  
  if (type === 'audio_in' || type === 'vcc_terminal') {
    return [{ id: 'p', relX: 0, relY: 0, label: type === 'vcc_terminal' ? 'VCC' : 'In' }];
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

  if (type === 'lamp' || type === 'speaker') {
    return [
      { id: 't1', relX: 0, relY: -2, label: 'T1' },
      { id: 't2', relX: 0, relY: 2, label: 'T2' }
    ];
  }

  if (type === 'ic_7442') {
    return [
      { id: 'a', relX: -4, relY: -1, label: 'A' },
      { id: 'b', relX: -4, relY: 0, label: 'B' },
      { id: 'c', relX: -4, relY: 1, label: 'C' },
      { id: 'd', relX: -4, relY: 2, label: 'D' },
      { id: 'out0', relX: 4, relY: -4, label: '0' },
      { id: 'out1', relX: 4, relY: -3, label: '1' },
      { id: 'out2', relX: 4, relY: -2, label: '2' },
      { id: 'out3', relX: 4, relY: -1, label: '3' },
      { id: 'out4', relX: 4, relY: 0, label: '4' },
      { id: 'out5', relX: 4, relY: 1, label: '5' },
      { id: 'out6', relX: 4, relY: 2, label: '6' },
      { id: 'out7', relX: 4, relY: 3, label: '7' },
      { id: 'out8', relX: 4, relY: 4, label: '8' },
      { id: 'out9', relX: 4, relY: 5, label: '9' }
    ];
  }

  if (type === 'seven_segment') {
    return [
      { id: 'a', relX: -3, relY: 3, label: 'a' },
      { id: 'b', relX: -2, relY: 3, label: 'b' },
      { id: 'c', relX: -1, relY: 3, label: 'c' },
      { id: 'd', relX: 0, relY: 3, label: 'd' },
      { id: 'e', relX: 1, relY: 3, label: 'e' },
      { id: 'f', relX: 2, relY: 3, label: 'f' },
      { id: 'g', relX: 3, relY: 3, label: 'g' },
      { id: 'dp', relX: 4, relY: 3, label: 'dp' },
      { id: 'com', relX: 0, relY: -4, label: 'COM' }
    ];
  }

  if (type === 'adc_0808') {
    return [
      { id: 'in0', relX: -5, relY: -6, label: 'IN0' },
      { id: 'in1', relX: -5, relY: -5, label: 'IN1' },
      { id: 'in2', relX: -5, relY: -4, label: 'IN2' },
      { id: 'in3', relX: -5, relY: -3, label: 'IN3' },
      { id: 'in4', relX: -5, relY: -2, label: 'IN4' },
      { id: 'in5', relX: -5, relY: -1, label: 'IN5' },
      { id: 'in6', relX: -5, relY: 0, label: 'IN6' },
      { id: 'in7', relX: -5, relY: 1, label: 'IN7' },
      { id: 'adda', relX: -5, relY: 3, label: 'ADD A' },
      { id: 'addb', relX: -5, relY: 4, label: 'ADD B' },
      { id: 'addc', relX: -5, relY: 5, label: 'ADD C' },
      { id: 'ale', relX: -5, relY: 6, label: 'ALE' },
      { id: 'vrefp', relX: -5, relY: 8, label: 'VREF+' },
      { id: 'vrefn', relX: -5, relY: 9, label: 'VREF-' },
      { id: 'clock', relX: 5, relY: -6, label: 'CLOCK' },
      { id: 'start', relX: 5, relY: -5, label: 'START' },
      { id: 'eoc', relX: 5, relY: -3, label: 'EOC' },
      { id: 'out1', relX: 5, relY: -1, label: 'OUT1' },
      { id: 'out2', relX: 5, relY: 0, label: 'OUT2' },
      { id: 'out3', relX: 5, relY: 1, label: 'OUT3' },
      { id: 'out4', relX: 5, relY: 2, label: 'OUT4' },
      { id: 'out5', relX: 5, relY: 3, label: 'OUT5' },
      { id: 'out6', relX: 5, relY: 4, label: 'OUT6' },
      { id: 'out7', relX: 5, relY: 5, label: 'OUT7' },
      { id: 'out8', relX: 5, relY: 6, label: 'OUT8' },
      { id: 'oe', relX: 5, relY: 8, label: 'OE' }
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

  if (type === 'megohmmeter') {
    return [
      { id: 'line', relX: -3, relY: -1, label: 'LINE' },
      { id: 'earth', relX: -3, relY: 1, label: 'EARTH' },
      { id: 'guard', relX: 3, relY: 0, label: 'GUARD' }
    ];
  }

  if (type === 'pot' || type === 'trimpot_multi') {
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

  if (type.startsWith('transistor_')) {
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

  if (type === 'ic_555') {
    return [
      { id: 'gnd', relX: -3, relY: 3, label: 'GND' },
      { id: 'trig', relX: -3, relY: 1, label: 'TRIG' },
      { id: 'out', relX: 3, relY: 1, label: 'OUT' },
      { id: 'rst', relX: -3, relY: -1, label: 'RST' },
      { id: 'ctrl', relX: -3, relY: -3, label: 'CTRL' },
      { id: 'thr', relX: 3, relY: -1, label: 'THR' },
      { id: 'dis', relX: 3, relY: -3, label: 'DIS' },
      { id: 'vcc', relX: 3, relY: 3, label: 'VCC' }
    ];
  }

  if (type === 'opamp_tl072') {
    return [
      { id: 'out1', relX: -3, relY: -3, label: '1OUT' },
      { id: 'in1n', relX: -3, relY: -1, label: '1IN-' },
      { id: 'in1p', relX: -3, relY: 1, label: '1IN+' },
      { id: 'vccn', relX: -3, relY: 3, label: 'VCC-' },
      { id: 'in2p', relX: 3, relY: 3, label: '2IN+' },
      { id: 'in2n', relX: 3, relY: 1, label: '2IN-' },
      { id: 'out2', relX: 3, relY: -1, label: '2OUT' },
      { id: 'vccp', relX: 3, relY: -3, label: 'VCC+' }
    ];
  }

  if (type === 'opamp_tl074') {
    return [
      { id: 'out1', relX: -3, relY: -6, label: '1OUT' },
      { id: 'in1n', relX: -3, relY: -4, label: '1IN-' },
      { id: 'in1p', relX: -3, relY: -2, label: '1IN+' },
      { id: 'vccp', relX: -3, relY: 0, label: 'VCC+' },
      { id: 'in2p', relX: -3, relY: 2, label: '2IN+' },
      { id: 'in2n', relX: -3, relY: 4, label: '2IN-' },
      { id: 'out2', relX: -3, relY: 6, label: '2OUT' },
      { id: 'out3', relX: 3, relY: 6, label: '3OUT' },
      { id: 'in3n', relX: 3, relY: 4, label: '3IN-' },
      { id: 'in3p', relX: 3, relY: 2, label: '3IN+' },
      { id: 'vccn', relX: 3, relY: 0, label: 'VCC-' },
      { id: 'in4p', relX: 3, relY: -2, label: '4IN+' },
      { id: 'in4n', relX: 3, relY: -4, label: '4IN-' },
      { id: 'out4', relX: 3, relY: -6, label: '4OUT' }
    ];
  }

  if (type === 'diode_bridge') {
    return [
      { id: 'ac1', relX: -2, relY: -2, label: '~' },
      { id: 'pos', relX: 2, relY: -2, label: '+' },
      { id: 'ac2', relX: 2, relY: 2, label: '~' },
      { id: 'neg', relX: -2, relY: 2, label: '-' }
    ];
  }

  if (type === 'regulator_7805') {
    return [
      { id: 'in', relX: -2, relY: 0, label: 'IN' },
      { id: 'gnd', relX: 0, relY: 2, label: 'GND' },
      { id: 'out', relX: 2, relY: 0, label: 'OUT' }
    ];
  }

  if (type === 'arduino_nano') {
    const leftPins = ['TX1', 'RX0', 'RST', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'];
    const rightPins = ['VIN', 'GND', 'RST', '5V', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'REF', '3V3', 'D13'];
    const pins = [];
    for (let i = 0; i < 15; i++) {
      pins.push({ id: `p${i+1}`, relX: -5, relY: i - 7, label: leftPins[i] });
      pins.push({ id: `p${30-i}`, relX: 5, relY: i - 7, label: rightPins[i] });
    }
    return pins;
  }

  // Resistor, LDR, capacitor, indutor, switch, motor_dc, resistor_5w, resistor_smd
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
    megohmmeter: 'Megômetro',
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
    relay: 'Relé',
    lamp: 'Lâmpada',
    speaker: 'Alto-falante',
    audio_in: 'Entrada de Áudio',
    ic_7442: 'CI 7442',
    seven_segment: 'Display 7 Seg',
    adc_0808: 'CI ADC0808',
    vcc_terminal: 'VCC',
    ic_555: '555 Timer',
    opamp_tl072: 'TL072',
    opamp_tl074: 'TL074',
    transistor_2sc5200: '2SC5200 NPN',
    transistor_2sa1943: '2SA1943 PNP',
    transistor_tip41: 'TIP41 NPN',
    transistor_tip42: 'TIP42 PNP',
    resistor_5w: 'Resistor 5W',
    resistor_smd: 'Resistor SMD',
    diode_bridge: 'Ponte Retificadora',
    regulator_7805: 'LM7805',
    arduino_nano: 'Arduino Nano',
    trimpot_multi: 'Trimpot Multivoltas'
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
  const defaultProperties = getDefaultProperties(comp.type);

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
    properties: {
      ...defaultProperties,
      ...comp.properties
    },
    terminals
  });
}
