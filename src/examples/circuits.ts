import type { CircuitComponent, CircuitWire } from '../types/circuit';
import { createCircuitComponent } from '../utils/circuitUtils';

export interface CircuitExample {
  name: string;
  category: string;
  description: string;
  educationalInfo: string;
  components: CircuitComponent[];
  wires: CircuitWire[];
}

// Helper para gerar o exemplo 1: LED com Resistor (DC Básico)
function getLedExample(): CircuitExample {
  // Inicializa componentes
  const src = createCircuitComponent('source_dc', 10, 10, 270); // Positivo para cima, negativo para baixo
  src.properties.voltage.value = 9; // Bateria de 9V
  
  const res = createCircuitComponent('resistor', 15, 6, 0); // Resistor R1
  res.properties.resistance.value = 330; // 330 Ohms

  const led = createCircuitComponent('led', 20, 10, 90); // LED apontando para baixo (a em 20,8 e c em 20,12)
  
  const gnd = createCircuitComponent('ground', 15, 14, 90); // GND na parte inferior

  const components = [src, res, led, gnd];

  // Conexões de fios
  // Para que o circuito funcione, conectamos:
  // p da fonte -> t1 do resistor
  // t2 do resistor -> a do LED
  // c do LED -> terra
  // n da fonte -> terra
  const wires: CircuitWire[] = [
    {
      id: 'w1',
      from: { componentId: src.id, terminalId: 'p' },
      to: { componentId: res.id, terminalId: 't1' }
    },
    {
      id: 'w2',
      from: { componentId: res.id, terminalId: 't2' },
      to: { componentId: led.id, terminalId: 'a' }
    },
    {
      id: 'w3',
      from: { componentId: led.id, terminalId: 'c' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    },
    {
      id: 'w4',
      from: { componentId: src.id, terminalId: 'n' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    }
  ];

  return {
    name: 'LED com Resistor Limitador',
    category: 'Corrente Contínua (DC)',
    description: 'Circuito básico alimentando um LED com uma bateria de 9V e resistor limitador de 330Ω.',
    educationalInfo: 'Lei de Ohm aplicada: V = I * R. A corrente é de aproximadamente (9V - 1.8V) / 330Ω ≈ 22mA, protegendo o LED de queimar.',
    components,
    wires
  };
}

// Helper para gerar o exemplo 2: Divisor de Tensão
function getDivisorExample(): CircuitExample {
  const src = createCircuitComponent('source_dc', 10, 10, 270);
  src.properties.voltage.value = 12; // 12V
  
  const r1 = createCircuitComponent('resistor', 18, 6, 0); // 1kΩ
  r1.properties.resistance.value = 1000;
  
  const r2 = createCircuitComponent('resistor', 18, 14, 90); // 1kΩ apontando para baixo
  r2.properties.resistance.value = 1000;

  const gnd = createCircuitComponent('ground', 18, 18, 90);
  const vm = createCircuitComponent('voltmeter', 25, 10, 90); // Mede no meio

  const components = [src, r1, r2, gnd, vm];

  const wires: CircuitWire[] = [
    {
      id: 'wd1',
      from: { componentId: src.id, terminalId: 'p' },
      to: { componentId: r1.id, terminalId: 't1' }
    },
    {
      id: 'wd2',
      from: { componentId: r1.id, terminalId: 't2' },
      to: { componentId: r2.id, terminalId: 't1' }
    },
    {
      id: 'wd3',
      from: { componentId: r2.id, terminalId: 't2' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    },
    {
      id: 'wd4',
      from: { componentId: src.id, terminalId: 'n' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    },
    // Conecta Voltímetro em paralelo com R2
    {
      id: 'wd5',
      from: { componentId: vm.id, terminalId: 'p' }, // Ponto central
      to: { componentId: r1.id, terminalId: 't2' }
    },
    {
      id: 'wd6',
      from: { componentId: vm.id, terminalId: 'n' }, // Terra
      to: { componentId: gnd.id, terminalId: 'gnd' }
    }
  ];

  return {
    name: 'Divisor de Tensão Resistivo',
    category: 'Corrente Contínua (DC)',
    description: 'Divisor simples com dois resistores de 1kΩ alimentado por 12V.',
    educationalInfo: 'A tensão de saída no meio é metade da de entrada: Vout = Vin * (R2 / (R1 + R2)) = 12V * (1k / 2k) = 6V.',
    components,
    wires
  };
}

// Helper para gerar o exemplo 3: Carga/Descarga RC
function getRcExample(): CircuitExample {
  const src = createCircuitComponent('source_dc', 8, 10, 270);
  src.properties.voltage.value = 5;

  const sw = createCircuitComponent('switch', 14, 6, 0); // Chave
  sw.properties.state.value = false; // Começa aberta

  const res = createCircuitComponent('resistor', 20, 6, 0); // 10k
  res.properties.resistance.value = 10000;

  const cap = createCircuitComponent('capacitor', 25, 10, 90); // 100uF para baixo
  cap.properties.capacitance.value = 0.0001; // 100uF

  const gnd = createCircuitComponent('ground', 25, 14, 90);

  const components = [src, sw, res, cap, gnd];

  const wires: CircuitWire[] = [
    {
      id: 'wr1',
      from: { componentId: src.id, terminalId: 'p' },
      to: { componentId: sw.id, terminalId: 't1' }
    },
    {
      id: 'wr2',
      from: { componentId: sw.id, terminalId: 't2' },
      to: { componentId: res.id, terminalId: 't1' }
    },
    {
      id: 'wr3',
      from: { componentId: res.id, terminalId: 't2' },
      to: { componentId: cap.id, terminalId: 't1' }
    },
    {
      id: 'wr4',
      from: { componentId: cap.id, terminalId: 't2' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    },
    {
      id: 'wr5',
      from: { componentId: src.id, terminalId: 'n' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    }
  ];

  return {
    name: 'Circuito Transiente RC',
    category: 'Análise Transiente',
    description: 'Circuito com Resistor de 10kΩ e Capacitor de 100μF. Clique na Chave para carregar/descarregar.',
    educationalInfo: 'A constante de tempo de carga é τ = R * C = 10kΩ * 100μF = 1 segundo. Em 5τ (5s) o capacitor carrega completamente até 5V.',
    components,
    wires
  };
}

// Helper para gerar o exemplo 4: Filtro Oscilante RLC
function getRlcExample(): CircuitExample {
  const src = createCircuitComponent('source_pulse', 8, 10, 270);
  src.properties.amplitude.value = 5;
  src.properties.frequency.value = 10; // 10Hz pulso

  const res = createCircuitComponent('resistor', 15, 6, 0); // 10Ω pequeno
  res.properties.resistance.value = 10;

  const ind = createCircuitComponent('inductor', 22, 6, 0); // 100mH
  ind.properties.inductance.value = 0.1;

  const cap = createCircuitComponent('capacitor', 28, 10, 90); // 10uF
  cap.properties.capacitance.value = 10e-6;

  const gnd = createCircuitComponent('ground', 28, 14, 90);

  const components = [src, res, ind, cap, gnd];

  const wires: CircuitWire[] = [
    {
      id: 'wl1',
      from: { componentId: src.id, terminalId: 'p' },
      to: { componentId: res.id, terminalId: 't1' }
    },
    {
      id: 'wl2',
      from: { componentId: res.id, terminalId: 't2' },
      to: { componentId: ind.id, terminalId: 't1' }
    },
    {
      id: 'wl3',
      from: { componentId: ind.id, terminalId: 't2' },
      to: { componentId: cap.id, terminalId: 't1' }
    },
    {
      id: 'wl4',
      from: { componentId: cap.id, terminalId: 't2' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    },
    {
      id: 'wl5',
      from: { componentId: src.id, terminalId: 'n' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    }
  ];

  return {
    name: 'Oscilador Transiente RLC',
    category: 'Análise Transiente',
    description: 'Circuito com Resistor (10Ω), Indutor (100mH) e Capacitor (10μF) submetido a pulsos de onda quadrada.',
    educationalInfo: 'A resposta ao degrau de um RLC sob-amortecido gera uma senoide amortecida oscilatória linda no osciloscópio devido à transferência de energia entre L e C.',
    components,
    wires
  };
}

// Helper para gerar o exemplo 5: Retificador com Diodo e Capacitor
function getRetifierExample(): CircuitExample {
  const src = createCircuitComponent('source_ac', 8, 10, 270);
  src.properties.amplitude.value = 10; // 10V AC
  src.properties.frequency.value = 50;

  const dio = createCircuitComponent('diodo', 16, 6, 0); // Diodo apontando para a direita

  const cap = createCircuitComponent('capacitor', 22, 10, 90); // Capacitor de filtro
  cap.properties.capacitance.value = 22e-6; // 22uF

  const res = createCircuitComponent('resistor', 28, 10, 90); // Carga resistiva
  res.properties.resistance.value = 1000; // 1kΩ

  const gnd = createCircuitComponent('ground', 22, 14, 90);

  const components = [src, dio, cap, res, gnd];

  const wires: CircuitWire[] = [
    {
      id: 'wf1',
      from: { componentId: src.id, terminalId: 'p' },
      to: { componentId: dio.id, terminalId: 'a' }
    },
    {
      id: 'wf2',
      from: { componentId: dio.id, terminalId: 'c' },
      to: { componentId: cap.id, terminalId: 't1' }
    },
    {
      id: 'wf3',
      from: { componentId: cap.id, terminalId: 't1' },
      to: { componentId: res.id, terminalId: 't1' }
    },
    {
      id: 'wf4',
      from: { componentId: cap.id, terminalId: 't2' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    },
    {
      id: 'wf5',
      from: { componentId: res.id, terminalId: 't2' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    },
    {
      id: 'wf6',
      from: { componentId: src.id, terminalId: 'n' },
      to: { componentId: gnd.id, terminalId: 'gnd' }
    }
  ];

  return {
    name: 'Retificador de Meia Onda com Filtro',
    category: 'Semicondutores e AC',
    description: 'Gerador senoidal AC de 10V retificado por um diodo de silício com capacitor de filtro (22μF) e carga de 1kΩ.',
    educationalInfo: 'O diodo corta o semiciclo negativo da senóide. O capacitor armazena energia e descarrega lentamente sobre a carga R, suavizando a ondulação (ripple).',
    components,
    wires
  };
}

export const circuitExamples: CircuitExample[] = [
  getLedExample(),
  getDivisorExample(),
  getRcExample(),
  getRlcExample(),
  getRetifierExample()
];
