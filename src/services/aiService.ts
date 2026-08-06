import type { CircuitComponent, CircuitWire } from '../types/circuit';
import { createCircuitComponent } from '../utils/circuitUtils';

export interface DiagnosticIssue {
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  componentIds?: string[];
}

export interface DiagnosticResult {
  summary: string;
  issues: DiagnosticIssue[];
  suggestions: string[];
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  action?: {
    label: string;
    type: 'load_template' | 'highlight';
    data?: any;
  };
}

/**
 * Gera o catálogo de componentes disponíveis no simulador para incluir no system prompt da IA.
 * Isso permite que a IA conheça todos os tipos de componentes, seus terminais e propriedades.
 */
export function buildComponentCatalog(): string {
  const componentTypes: { type: string; name: string; terminals: string; props?: string }[] = [
    { type: 'source_dc', name: 'Fonte DC', terminals: 'p (+), n (-)', props: 'voltage (V, padrão: 5)' },
    { type: 'source_ac', name: 'Fonte AC', terminals: 'p (+), n (-)', props: 'amplitude (V, padrão: 5), frequency (Hz, padrão: 60)' },
    { type: 'source_pulse', name: 'Gerador de Pulso', terminals: 'p (+), n (-)', props: 'amplitude (V), frequency (Hz), dutyCycle (%)' },
    { type: 'function_generator', name: 'Gerador de Funções', terminals: 'p (+), n (-)', props: 'waveform (sine|square|triangle|sawtooth), frequency (Hz), amplitude (V)' },
    { type: 'source_current', name: 'Fonte de Corrente', terminals: 'p (+), n (-)', props: 'current (A, padrão: 0.01)' },
    { type: 'resistor', name: 'Resistor', terminals: 't1, t2', props: 'resistance (Ω, padrão: 1000)' },
    { type: 'capacitor', name: 'Capacitor', terminals: 't1, t2', props: 'capacitance (F, padrão: 1e-6, ex: 100uF=0.0001)' },
    { type: 'inductor', name: 'Indutor', terminals: 't1, t2', props: 'inductance (H, padrão: 1e-3, ex: 100mH=0.1)' },
    { type: 'led', name: 'LED', terminals: 'a (anodo), c (catodo)', props: 'color (red|green|blue|yellow|orange|white)' },
    { type: 'diodo', name: 'Diodo de Silício', terminals: 'a (anodo), c (catodo)' },
    { type: 'zener', name: 'Diodo Zener', terminals: 'a (anodo), c (catodo)', props: 'zenerVoltage (V, padrão: 5.1)' },
    { type: 'transistor_bjt_npn', name: 'Transistor NPN', terminals: 'c (coletor), b (base), e (emissor)', props: 'beta (ganho, padrão: 100)' },
    { type: 'transistor_bjt_pnp', name: 'Transistor PNP', terminals: 'c (coletor), b (base), e (emissor)', props: 'beta (ganho, padrão: 100)' },
    { type: 'switch', name: 'Chave/Interruptor', terminals: 't1, t2', props: 'state (boolean, padrão: false=aberta)' },
    { type: 'ground', name: 'Terra (GND)', terminals: 'gnd' },
    { type: 'pot', name: 'Potenciômetro', terminals: 'a, b, w (cursor)', props: 'resistance (Ω, padrão: 10000), setting (%, padrão: 50)' },
    { type: 'voltmeter', name: 'Voltímetro', terminals: 'p (+), n (-)' },
    { type: 'ammeter', name: 'Amperímetro', terminals: 'p (+), n (-)' },
    { type: 'lamp', name: 'Lâmpada', terminals: 't1, t2', props: 'nominalVoltage (V, padrão: 12)' },
    { type: 'motor_dc', name: 'Motor DC', terminals: 't1, t2', props: 'resistance (Ω, padrão: 10)' },
    { type: 'relay', name: 'Relé', terminals: 'coil1, coil2, com, nc, no', props: 'coilResistance (Ω), triggerVoltage (V)' },
    { type: 'speaker', name: 'Alto-falante', terminals: 't1, t2', props: 'impedance (Ω, padrão: 8)' },
    { type: 'ic_555', name: '555 Timer', terminals: 'gnd, trig, out, rst, ctrl, thr, dis, vcc' },
    { type: 'opamp_tl072', name: 'Op-Amp TL072 (dual)', terminals: 'out1, in1n, in1p, vccn, in2p, in2n, out2, vccp' },
    { type: 'opamp_tl074', name: 'Op-Amp TL074 (quad)', terminals: 'out1, in1n, in1p, vccp, in2p, in2n, out2, out3, in3n, in3p, vccn, in4p, in4n, out4' },
    { type: 'regulator_7805', name: 'Regulador LM7805', terminals: 'in, gnd, out' },
    { type: 'diode_bridge', name: 'Ponte Retificadora', terminals: 'ac1 (~), pos (+), ac2 (~), neg (-)' },
    { type: 'transistor_2sc5200', name: 'Transistor 2SC5200 NPN (potência)', terminals: 'c, b, e', props: 'beta (ganho, padrão: 80)' },
    { type: 'transistor_2sa1943', name: 'Transistor 2SA1943 PNP (potência)', terminals: 'c, b, e', props: 'beta (ganho, padrão: 80)' },
    { type: 'transistor_tip41', name: 'Transistor TIP41 NPN (potência)', terminals: 'c, b, e', props: 'beta (ganho, padrão: 50)' },
    { type: 'transistor_tip42', name: 'Transistor TIP42 PNP (potência)', terminals: 'c, b, e', props: 'beta (ganho, padrão: 50)' },
    { type: 'resistor_5w', name: 'Resistor 5W (potência)', terminals: 't1, t2', props: 'resistance (Ω, padrão: 1000)' },
    { type: 'capacitor_ceramic', name: 'Capacitor Cerâmico', terminals: 't1, t2', props: 'capacitance (F, padrão: 1e-6)' },
    { type: 'capacitor_polyester', name: 'Capacitor Poliéster', terminals: 't1, t2', props: 'capacitance (F, padrão: 1e-6)' },
    { type: 'trimpot_multi', name: 'Trimpot Multivoltas', terminals: 'a, b, w (cursor)', props: 'resistance (Ω, padrão: 10000), setting (%, padrão: 50)' },
    { type: 'seven_segment', name: 'Display 7 Segmentos', terminals: 'a, b, c, d, e, f, g, dp, com', props: 'mode (cathode|anode), color (red|green|blue|yellow)' },
    { type: 'arduino_nano', name: 'Arduino Nano', terminals: 'p1..p30 (TX1, RX0, RST, GND, D2-D13, VIN, 5V, 3V3, A0-A7, REF)' },
    { type: 'ldr', name: 'LDR (Fotoresistor)', terminals: 't1, t2', props: 'light (%, padrão: 50)' },
    { type: 'bench_supply', name: 'Fonte de Bancada', terminals: 'p (+), n (-)', props: 'voltage (V), currentLimit (A)' },
  ];

  let catalog = 'CATÁLOGO DE COMPONENTES DISPONÍVEIS NO SIMULADOR:\n';
  catalog += '(Use estes tipos exatos no campo "type" do JSON)\n\n';

  componentTypes.forEach(ct => {
    catalog += `• ${ct.type} — ${ct.name} | Terminais: [${ct.terminals}]`;
    if (ct.props) catalog += ` | Propriedades: ${ct.props}`;
    catalog += '\n';
  });

  return catalog;
}

/**
 * Parseia a resposta da IA buscando um bloco ```circuit-json``` e converte
 * para componentes e fios do simulador usando createCircuitComponent().
 */
export function parseAiCircuitResponse(aiText: string): {
  name: string;
  components: CircuitComponent[];
  wires: CircuitWire[];
  cleanText: string;
} | null {
  // Busca bloco ```circuit-json ... ```
  const jsonBlockRegex = /```circuit-json\s*\n([\s\S]*?)\n\s*```/;
  const match = aiText.match(jsonBlockRegex);
  if (!match) return null;

  try {
    const jsonStr = match[1].trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.components || !Array.isArray(parsed.components) || parsed.components.length === 0) {
      return null;
    }

    // Criar componentes reais via createCircuitComponent
    const components: CircuitComponent[] = [];
    for (const compDef of parsed.components) {
      const comp = createCircuitComponent(
        compDef.type,
        compDef.x ?? 10,
        compDef.y ?? 10,
        compDef.rotation ?? 0
      );

      // Aplicar propriedades customizadas
      if (compDef.props && typeof compDef.props === 'object') {
        for (const [key, value] of Object.entries(compDef.props)) {
          if (comp.properties[key]) {
            comp.properties[key].value = value as any;
          }
        }
      }

      components.push(comp);
    }

    // Criar fios — formato: { from: [indexComp, terminalId], to: [indexComp, terminalId] }
    const wires: CircuitWire[] = [];
    if (parsed.wires && Array.isArray(parsed.wires)) {
      parsed.wires.forEach((wireDef: any, idx: number) => {
        const fromIdx = wireDef.from?.[0];
        const fromTerminal = wireDef.from?.[1];
        const toIdx = wireDef.to?.[0];
        const toTerminal = wireDef.to?.[1];

        if (
          typeof fromIdx === 'number' && typeof toIdx === 'number' &&
          fromIdx >= 0 && fromIdx < components.length &&
          toIdx >= 0 && toIdx < components.length &&
          typeof fromTerminal === 'string' && typeof toTerminal === 'string'
        ) {
          // Verificar que os terminais existem nos componentes
          const fromComp = components[fromIdx];
          const toComp = components[toIdx];
          const fromTermExists = fromComp.terminals.some(t => t.id === fromTerminal);
          const toTermExists = toComp.terminals.some(t => t.id === toTerminal);

          if (fromTermExists && toTermExists) {
            wires.push({
              id: `wai_${idx}`,
              from: { componentId: fromComp.id, terminalId: fromTerminal },
              to: { componentId: toComp.id, terminalId: toTerminal }
            });
          }
        }
      });
    }

    // Remover o bloco JSON do texto para exibição limpa
    const cleanText = aiText.replace(jsonBlockRegex, '').trim();

    return {
      name: parsed.name || 'Circuito Gerado pela IA',
      components,
      wires,
      cleanText
    };
  } catch (e) {
    console.warn('[ESM IA] Falha ao parsear circuit-json da IA:', e);
    return null;
  }
}

/**
 * Instrução de sistema completa para a IA, incluindo catálogo de componentes e
 * formato de resposta para geração de circuitos.
 */
export function buildSystemInstruction(): string {
  const catalog = buildComponentCatalog();

  return `Você é o ESM IA, um assistente especialista em engenharia elétrica, eletrônica, física de semicondutores e simulação de circuitos.
Você está integrado a um simulador de circuitos interativo. O usuário monta circuitos na board e você recebe o estado completo do circuito (componentes, valores, conexões e simulação) como contexto.

REGRAS GERAIS:
1. SEMPRE analise o contexto do circuito fornecido — ele contém os componentes reais, seus valores, as conexões entre terminais e o estado da simulação.
2. Ao DIAGNOSTICAR: identifique erros de montagem, componentes sem conexão, valores inadequados (resistores muito baixos, tensões excessivas), ausência de GND, LEDs sem resistor limitador, curtos-circuitos e componentes queimados. Sugira correções específicas com valores numéricos.
3. Ao EXPLICAR: descreva o funcionamento do circuito real montado, explicando o papel de cada componente, o percurso da corrente, as tensões esperadas em cada nó e os princípios teóricos (Lei de Ohm, Kirchhoff, divisor de tensão, etc).
4. Responda SEMPRE em Português do Brasil (PT-BR), de forma clara, didática e motivadora.
5. Use formatação markdown (negritos, listas, tabelas e LaTeX simples para fórmulas como $I = \\\\frac{V}{R}$).
6. Se o circuito estiver vazio e o usuário pedir para criar/montar/sugerir um circuito, GERE o circuito usando o formato JSON abaixo.

REGRAS DE GERAÇÃO DE CIRCUITOS:
Quando o usuário pedir para criar, montar, gerar ou sugerir um circuito (incluindo respostas afirmativas como "sim", "pode ser", "quero", "faz aí", "monta" a uma proposta anterior sua), você DEVE responder incluindo um bloco de código \`\`\`circuit-json com o circuito no formato abaixo.

FORMATO DO BLOCO circuit-json:
\`\`\`circuit-json
{
  "name": "Nome do Circuito",
  "components": [
    { "type": "source_dc", "x": 8, "y": 10, "rotation": 90, "props": { "voltage": 9 } },
    { "type": "resistor", "x": 14, "y": 8, "rotation": 0, "props": { "resistance": 330 } },
    { "type": "led", "x": 20, "y": 10, "rotation": 90 },
    { "type": "ground", "x": 20, "y": 14, "rotation": 90 }
  ],
  "wires": [
    { "from": [0, "p"], "to": [1, "t1"] },
    { "from": [1, "t2"], "to": [2, "a"] },
    { "from": [2, "c"], "to": [3, "gnd"] },
    { "from": [0, "n"], "to": [3, "gnd"] }
  ]
}
\`\`\`

REGRAS DO JSON:
- "components" é um array de objetos. Cada um tem: type (string do catálogo), x e y (posição no grid, espaçar pelo menos 6 unidades entre componentes), rotation (0, 90, 180 ou 270), props (objeto com propriedades, opcional).
- "wires" é um array. Cada fio usa [índice_do_componente, "terminal_id"]. O índice é baseado na posição do componente no array "components" (começando em 0).
- Use APENAS tipos e terminais listados no catálogo abaixo.
- SEMPRE inclua um componente ground (terra) e conecte o negativo da fonte ao terra.
- Posicione componentes de forma organizada: fontes à esquerda, componentes em série no meio, cargas à direita, GND embaixo.
- Espaçe os componentes pelo menos 6 unidades de grid para evitar sobreposição.
- Junto com o bloco JSON, inclua uma explicação didática do circuito gerado (fora do bloco de código).

${catalog}`;
}

/**
 * Motor de Diagnóstico Inteligente de Circuitos
 * Analisa a topologia do circuito localmente sem necessitar de API externa.
 */
export function analyzeCircuit(components: CircuitComponent[], wires: CircuitWire[]): DiagnosticResult {
  const issues: DiagnosticIssue[] = [];
  const suggestions: string[] = [];

  if (components.length === 0) {
    return {
      summary: 'O circuito está vazio no momento.',
      issues: [
        {
          type: 'info',
          title: 'Canvas Vazio',
          description: 'Adicione fontes, resistores, LEDs ou chaves para começar a simulação.'
        }
      ],
      suggestions: [
        'Clique em "Exemplos" na barra superior para carregar um circuito pronto.',
        'Use o botão "P" na biblioteca para adicionar dispositivos ao seu projeto.'
      ]
    };
  }

  // 1. Verificação de Aterramento (GND)
  const groundComp = components.find(c => c.type === 'ground');
  if (!groundComp) {
    issues.push({
      type: 'warning',
      title: 'Ausência de Aterramento (GND)',
      description: 'Nenhum ponto de Terra (GND) foi encontrado. O terra serve como referência de 0V para cálculo de tensões numéricas e osciloscópio.'
    });
    suggestions.push('Adicione um componente "Ground" e conecte-o ao polo negativo do circuito.');
  }

  // 2. Verificação de Fontes sem Carga / Curto
  const sources = components.filter(c => c.type.startsWith('source_'));
  if (sources.length === 0) {
    issues.push({
      type: 'info',
      title: 'Sem Fonte de Energia',
      description: 'O circuito não possui fontes de tensão (DC, AC, Pulso) ou corrente.'
    });
  }

  // 3. Verificação de LEDs sem Resistor Limitador
  const leds = components.filter(c => c.type === 'led');
  leds.forEach(led => {
    // Verifica se há resistor no mesmo nó
    const ledWires = wires.filter(w => w.from.componentId === led.id || w.to.componentId === led.id);
    const connectedCompIds = ledWires.map(w => w.from.componentId === led.id ? w.to.componentId : w.from.componentId);
    const hasResistor = connectedCompIds.some(id => {
      const comp = components.find(c => c.id === id);
      return comp?.type === 'resistor' || comp?.type === 'pot';
    });

    if (!hasResistor) {
      issues.push({
        type: 'warning',
        title: `LED (${led.name}) sem Resistor Limitador`,
        description: 'LEDs conectados diretamente a fontes sem resistor limitador de corrente podem queimar na simulação por excesso de corrente.',
        componentIds: [led.id]
      });
      suggestions.push(`Adicione um resistor de 220Ω a 1kΩ em série com o LED ${led.name}.`);
    }
  });

  // 4. Verificação de Componentes Danificados/Danificando
  const burned = components.filter(c => c.simulationState?.isBurned);
  if (burned.length > 0) {
    issues.push({
      type: 'error',
      title: `${burned.length} Componente(s) Danificado(s)!`,
      description: `Falhas críticas detectadas: ${burned.map(b => b.name).join(', ')}.`,
      componentIds: burned.map(b => b.id)
    });
    suggestions.push('Reduza a tensão da fonte ou aumente o valor dos resistores de proteção.');
  }

  // Resumo Didático
  let summary = `Circuito com ${components.length} componente(s) e ${wires.length} conexão(ões).`;
  if (issues.some(i => i.type === 'error')) {
    summary += ' ⚠️ Atenção: Há componentes danificados!';
  } else if (issues.some(i => i.type === 'warning')) {
    summary += ' 💡 Encontrados pontos de melhoria de segurança.';
  } else {
    summary += ' ✅ Circuito estruturalmente consistente!';
  }

  return { summary, issues, suggestions };
}

/**
 * Gera uma explicação detalhada e didática do funcionamento do circuito montado
 */
export function explainCircuit(components: CircuitComponent[], _wires: CircuitWire[]): string {
  if (components.length === 0) return 'O circuito está vazio. Adicione componentes para receber uma análise didática.';

  const typeCounts: Record<string, number> = {};
  components.forEach(c => {
    typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
  });

  let text = `### 📘 Análise Didática do Circuito\n\n`;
  text += `Este circuito contém **${components.length} componentes**:\n`;

  Object.entries(typeCounts).forEach(([type, count]) => {
    const nameMap: Record<string, string> = {
      source_dc: 'Fonte de Tensão Contínua (DC)',
      source_ac: 'Gerador de Tensão Alternada (AC)',
      source_pulse: 'Gerador de Pulso Quadrado',
      function_generator: 'Gerador de Funções Multiforma (Senoidal/Quadrada/Triangular/Sawtooth)',
      resistor: 'Resistor',
      capacitor: 'Capacitor',
      inductor: 'Indutor',
      led: 'LED',
      diodo: 'Diodo de Silício',
      transistor_bjt_npn: 'Transistor BJT NPN',
      transistor_bjt_pnp: 'Transistor BJT PNP',
      ground: 'Terra (GND)',
      switch: 'Chave / Interruptor'
    };
    text += `- **${count}x** ${nameMap[type] || type}\n`;
  });

  text += `\n#### ⚡ Funcionamento Teórico:\n`;

  if (typeCounts['source_dc'] && typeCounts['resistor'] && typeCounts['led']) {
    text += `• **Malha DC com LED**: A fonte DC fornece tensão. O resistor limita a corrente conforme a **Lei de Ohm** ($I = \\frac{V_{fonte} - V_{led}}{R}$) evitando que o LED queime.\n`;
  }

  if (typeCounts['capacitor'] && typeCounts['resistor']) {
    text += `• **Circuito RC (Resistor-Capacitor)**: O capacitor armazena carga elétrica. A constante de tempo é $\\tau = R \\cdot C$. A cada $\\tau$ segundos, o capacitor carrega $\\approx 63.2\\%$ da tensão total.\n`;
  }

  if (typeCounts['inductor'] && typeCounts['capacitor']) {
    text += `• **Circuito LC / RLC Oscilatório**: Transfere energia ciclicamente entre o campo elétrico do capacitor e o campo magnético do indutor, gerando oscilações senoidais na frequência de ressonância $f_0 = \\frac{1}{2\\pi\\sqrt{L C}}$.\n`;
  }

  if (typeCounts['transistor_bjt_npn'] || typeCounts['transistor_bjt_pnp']) {
    text += `• **Chaveamento por Transistor BJT**: Uma pequena corrente aplicada na Base ($I_B$) controla uma corrente maior entre Coletor e Emissor ($I_C = \\beta \\cdot I_B$).\n`;
  }

  text += `\n💡 *Dica: Inicie a simulação pelo botão "Simular" e abra o Osciloscópio para observar os gráficos de tensão e corrente ao vivo!*`;

  return text;
}

/**
 * Gera um contexto textual RICO e DETALHADO do circuito atual montado na board.
 * Este contexto é enviado ao agente Azure AI Foundry para que ele possa analisar
 * QUALQUER circuito que o usuário tenha montado.
 */
export function buildCircuitContext(components: CircuitComponent[], wires: CircuitWire[]): string {
  if (components.length === 0) {
    return 'CIRCUITO ATUAL: Vazio (nenhum componente na board).';
  }

  const typeNameMap: Record<string, string> = {
    source_dc: 'Fonte de Tensão DC',
    source_ac: 'Fonte de Tensão AC',
    source_pulse: 'Gerador de Pulso',
    function_generator: 'Gerador de Funções',
    resistor: 'Resistor',
    capacitor: 'Capacitor',
    inductor: 'Indutor',
    led: 'LED',
    diodo: 'Diodo',
    diode_zener: 'Diodo Zener',
    transistor_bjt_npn: 'Transistor BJT NPN',
    transistor_bjt_pnp: 'Transistor BJT PNP',
    ground: 'Terra (GND)',
    switch: 'Chave/Interruptor',
    pot: 'Potenciômetro',
    transformer: 'Transformador',
    relay: 'Relé',
    fuse: 'Fusível',
    ammeter: 'Amperímetro',
    voltmeter: 'Voltímetro',
  };

  let ctx = `CIRCUITO ATUAL NA BOARD DO USUÁRIO:\n`;
  ctx += `Total: ${components.length} componente(s), ${wires.length} conexão(ões).\n\n`;

  // --- Componentes com propriedades detalhadas ---
  ctx += `COMPONENTES:\n`;
  components.forEach((c, i) => {
    const typeName = typeNameMap[c.type] || c.type;
    ctx += `${i + 1}. [${c.name}] — ${typeName}`;

    // Listar propriedades relevantes (valores configurados pelo usuário)
    const props = Object.values(c.properties || {});
    const propStrings: string[] = [];
    props.forEach(p => {
      if (p.value !== undefined && p.value !== '' && p.name !== 'name') {
        const unit = p.unit || '';
        propStrings.push(`${p.label || p.name}: ${p.value}${unit}`);
      }
    });
    if (propStrings.length > 0) {
      ctx += ` | ${propStrings.join(', ')}`;
    }

    // Listar terminais
    if (c.terminals && c.terminals.length > 0) {
      const termLabels = c.terminals.map(t => t.label || t.id).join(', ');
      ctx += ` | Terminais: [${termLabels}]`;
    }

    // Estado da simulação (se ativa)
    if (c.simulationState) {
      const simParts: string[] = [];
      if (c.simulationState.voltage !== undefined) simParts.push(`V=${c.simulationState.voltage.toFixed(2)}V`);
      if (c.simulationState.current !== undefined) simParts.push(`I=${(c.simulationState.current * 1000).toFixed(2)}mA`);
      if (c.simulationState.power !== undefined) simParts.push(`P=${c.simulationState.power.toFixed(3)}W`);
      if (c.simulationState.isBurned) simParts.push('⚠️ QUEIMADO');
      if (simParts.length > 0) {
        ctx += ` | Simulação: ${simParts.join(', ')}`;
      }
    }

    ctx += `\n`;
  });

  // --- Conexões (Wires) com nomes de componentes/terminais ---
  if (wires.length > 0) {
    ctx += `\nCONEXÕES (FIOS):\n`;
    wires.forEach((w, i) => {
      const fromComp = components.find(c => c.id === w.from.componentId);
      const toComp = components.find(c => c.id === w.to.componentId);
      const fromTerminal = fromComp?.terminals.find(t => t.id === w.from.terminalId);
      const toTerminal = toComp?.terminals.find(t => t.id === w.to.terminalId);

      const fromName = fromComp?.name || w.from.componentId;
      const fromTermLabel = fromTerminal?.label || w.from.terminalId;
      const toName = toComp?.name || w.to.componentId;
      const toTermLabel = toTerminal?.label || w.to.terminalId;

      ctx += `${i + 1}. ${fromName}[${fromTermLabel}] ——→ ${toName}[${toTermLabel}]`;

      if (w.simulationState?.current !== undefined) {
        ctx += ` (I=${(w.simulationState.current * 1000).toFixed(2)}mA)`;
      }
      ctx += `\n`;
    });
  }

  // --- Resumo de problemas detectados localmente ---
  const burned = components.filter(c => c.simulationState?.isBurned);
  if (burned.length > 0) {
    ctx += `\n⚠️ COMPONENTES DANIFICADOS: ${burned.map(b => b.name).join(', ')}`;
  }

  const hasGround = components.some(c => c.type === 'ground');
  if (!hasGround) {
    ctx += `\n⚠️ ATENÇÃO: Circuito não possui Terra (GND) como referência.`;
  }

  const hasSources = components.some(c => c.type.startsWith('source_') || c.type === 'function_generator');
  if (!hasSources) {
    ctx += `\n⚠️ ATENÇÃO: Circuito não possui fonte de energia.`;
  }

  return ctx;
}

/**
 * Gerador de circuitos a partir de descrições em linguagem natural
 */
export function generateCircuitFromPrompt(prompt: string): { name: string; components: CircuitComponent[]; wires: CircuitWire[] } | null {
  const p = prompt.toLowerCase();

  // 1. REGULADOR ZENER (ex: zener, zenner, regulador 24v para 5v, +18 -18 para +12 -12)
  if (p.includes('zen') || p.includes('zener') || p.includes('regulador') || p.includes('18') || p.includes('12')) {
    const matches = p.match(/(\d+)/g);
    let vin = 24;
    let vzener = 5.1;

    if (matches && matches.length >= 2) {
      vin = parseInt(matches[0]) || 24;
      vzener = parseInt(matches[matches.length - 1]) || 5.1;
    } else if (matches && matches.length === 1) {
      vin = parseInt(matches[0]) || 24;
    }

    const src = createCircuitComponent('source_dc', 8, 12, 90); // Fonte DC (p em 8,10 e n em 8,14)
    src.properties.voltage.value = vin;

    const rs = createCircuitComponent('resistor', 16, 10, 0); // RS 470Ω (t1 em 14,10 e t2 em 18,10)
    rs.properties.resistance.value = 470;

    const zen = createCircuitComponent('zener', 18, 12, 270); // Zener
    zen.properties.zenerVoltage.value = vzener;
    const rl = createCircuitComponent('resistor', 24, 12, 90); // Carga RL 1kΩ (t1 em 24,10 e t2 em 24,14)
    rl.properties.resistance.value = 1000;

    const gnd = createCircuitComponent('ground', 18, 16, 90); // GND em 18,15

    return {
      name: `Regulador Zener ${vin}V -> ${vzener}V`,
      components: [src, rs, zen, rl, gnd],
      wires: [
        { id: 'w1', from: { componentId: src.id, terminalId: 'p' }, to: { componentId: rs.id, terminalId: 't1' } },
        { id: 'w2', from: { componentId: rs.id, terminalId: 't2' }, to: { componentId: zen.id, terminalId: 'c' } },
        { id: 'w3', from: { componentId: zen.id, terminalId: 'c' }, to: { componentId: rl.id, terminalId: 't1' } },
        { id: 'w4', from: { componentId: zen.id, terminalId: 'a' }, to: { componentId: gnd.id, terminalId: 'gnd' } },
        { id: 'w5', from: { componentId: rl.id, terminalId: 't2' }, to: { componentId: zen.id, terminalId: 'a' } },
        { id: 'w6', from: { componentId: src.id, terminalId: 'n' }, to: { componentId: zen.id, terminalId: 'a' } }
      ]
    };
  }

  // 2. CHAVE COM TRANSISTOR NPN (ex: npn, pnp, transistor, chave bjt)
  if (p.includes('transistor') || p.includes('npn') || p.includes('pnp') || p.includes('bjt')) {
    const src = createCircuitComponent('source_dc', 8, 10, 90); // 5V (p em 8,8 e n em 8,12)
    src.properties.voltage.value = 5;

    const sw = createCircuitComponent('switch', 14, 8, 0);
    const rb = createCircuitComponent('resistor', 18, 8, 0); // 10kΩ Base
    rb.properties.resistance.value = 10000;

    const npn = createCircuitComponent('transistor_bjt_npn', 22, 8, 0);
    const resL = createCircuitComponent('resistor', 23, 2, 90); // 330Ω
    resL.properties.resistance.value = 330;
    const led = createCircuitComponent('led', 23, 5, 90);

    const gnd = createCircuitComponent('ground', 22, 12, 90);

    return {
      name: 'Chaveamento com Transistor NPN',
      components: [src, sw, rb, npn, resL, led, gnd],
      wires: [
        { id: 'wt1', from: { componentId: src.id, terminalId: 'p' }, to: { componentId: sw.id, terminalId: 't1' } },
        { id: 'wt2', from: { componentId: sw.id, terminalId: 't2' }, to: { componentId: rb.id, terminalId: 't1' } },
        { id: 'wt3', from: { componentId: rb.id, terminalId: 't2' }, to: { componentId: npn.id, terminalId: 'b' } },
        { id: 'wt4', from: { componentId: src.id, terminalId: 'p' }, to: { componentId: resL.id, terminalId: 't1' } },
        { id: 'wt5', from: { componentId: resL.id, terminalId: 't2' }, to: { componentId: led.id, terminalId: 'a' } },
        { id: 'wt6', from: { componentId: led.id, terminalId: 'c' }, to: { componentId: npn.id, terminalId: 'c' } },
        { id: 'wt7', from: { componentId: npn.id, terminalId: 'e' }, to: { componentId: gnd.id, terminalId: 'gnd' } },
        { id: 'wt8', from: { componentId: src.id, terminalId: 'n' }, to: { componentId: gnd.id, terminalId: 'gnd' } }
      ]
    };
  }

  // 3. RETIFICADOR AC/DC COM DIODO E FILTRO (ex: retificador, ac para dc, diodo ac)
  if (p.includes('retificad') || p.includes('ac para dc') || p.includes('fonte ac')) {
    const src = createCircuitComponent('source_ac', 8, 10, 90);
    src.properties.amplitude.value = 12;
    src.properties.frequency.value = 60;

    const dio = createCircuitComponent('diodo', 14, 8, 0);
    const cap = createCircuitComponent('capacitor', 18, 12, 90);
    cap.properties.capacitance.value = 0.0001; // 100uF

    const res = createCircuitComponent('resistor', 24, 12, 90);
    res.properties.resistance.value = 1000;

    const gnd = createCircuitComponent('ground', 18, 16, 90);

    return {
      name: 'Retificador AC/DC com Filtro',
      components: [src, dio, cap, res, gnd],
      wires: [
        { id: 'wrf1', from: { componentId: src.id, terminalId: 'p' }, to: { componentId: dio.id, terminalId: 'a' } },
        { id: 'wrf2', from: { componentId: dio.id, terminalId: 'c' }, to: { componentId: cap.id, terminalId: 't1' } },
        { id: 'wrf3', from: { componentId: cap.id, terminalId: 't1' }, to: { componentId: res.id, terminalId: 't1' } },
        { id: 'wrf4', from: { componentId: cap.id, terminalId: 't2' }, to: { componentId: gnd.id, terminalId: 'gnd' } },
        { id: 'wrf5', from: { componentId: res.id, terminalId: 't2' }, to: { componentId: cap.id, terminalId: 't2' } },
        { id: 'wrf6', from: { componentId: src.id, terminalId: 'n' }, to: { componentId: gnd.id, terminalId: 'gnd' } }
      ]
    };
  }

  // 4. DIVISOR DE TENSÃO INTELIGENTE
  if (p.includes('divisor') || p.includes('tensao') || p.includes('tenção')) {
    const matches = p.match(/(\d+)\s*v/g);
    let vin = 12;
    let vout = 6;

    if (matches && matches.length >= 2) {
      vin = parseInt(matches[0]) || 12;
      vout = parseInt(matches[1]) || 6;
    }

    const r2Val = 1000;
    const r1Val = Math.max(100, Math.round(r2Val * ((vin - vout) / (vout || 1))));

    const src = createCircuitComponent('source_dc', 8, 10, 90);
    src.properties.voltage.value = vin;
    const r1 = createCircuitComponent('resistor', 16, 8, 0);
    r1.properties.resistance.value = r1Val;
    const r2 = createCircuitComponent('resistor', 18, 12, 90);
    r2.properties.resistance.value = r2Val;
    const gnd = createCircuitComponent('ground', 18, 16, 90);

    return {
      name: `Divisor de Tensão ${vin}V -> ${vout}V`,
      components: [src, r1, r2, gnd],
      wires: [
        { id: 'wd1', from: { componentId: src.id, terminalId: 'p' }, to: { componentId: r1.id, terminalId: 't1' } },
        { id: 'wd2', from: { componentId: r1.id, terminalId: 't2' }, to: { componentId: r2.id, terminalId: 't1' } },
        { id: 'wd3', from: { componentId: r2.id, terminalId: 't2' }, to: { componentId: gnd.id, terminalId: 'gnd' } },
        { id: 'wd4', from: { componentId: src.id, terminalId: 'n' }, to: { componentId: gnd.id, terminalId: 'gnd' } }
      ]
    };
  }

  // 5. CIRCUITO LED PADRÃO
  if (p.includes('led') || p.includes('resistor') || p.includes('bateria')) {
    const src = createCircuitComponent('source_dc', 8, 10, 90);
    src.properties.voltage.value = 9;
    const res = createCircuitComponent('resistor', 14, 8, 0);
    res.properties.resistance.value = 330;
    const led = createCircuitComponent('led', 20, 10, 90);
    const gnd = createCircuitComponent('ground', 20, 14, 90);

    return {
      name: 'Circuito LED 9V',
      components: [src, res, led, gnd],
      wires: [
        { id: 'w1', from: { componentId: src.id, terminalId: 'p' }, to: { componentId: res.id, terminalId: 't1' } },
        { id: 'w2', from: { componentId: res.id, terminalId: 't2' }, to: { componentId: led.id, terminalId: 'a' } },
        { id: 'w3', from: { componentId: led.id, terminalId: 'c' }, to: { componentId: gnd.id, terminalId: 'gnd' } },
        { id: 'w4', from: { componentId: src.id, terminalId: 'n' }, to: { componentId: gnd.id, terminalId: 'gnd' } }
      ]
    };
  }

  return null;
}

/**
 * Consulta opcional à API do Google Gemini se o usuário informar a API Key
 */
export async function queryGeminiApi(apiKey: string, prompt: string, circuitContext: string, chatHistory?: AiChatMessage[]): Promise<string> {
  const endpointsToTry = [
    { version: 'v1beta', model: 'gemini-2.0-flash' },
    { version: 'v1beta', model: 'gemini-2.0-flash-lite' },
    { version: 'v1', model: 'gemini-1.5-flash' },
    { version: 'v1', model: 'gemini-1.5-pro' },
    { version: 'v1beta', model: 'gemini-1.5-flash' }
  ];

  const systemInstruction = buildSystemInstruction();

  // Construir conversa multi-turn com histórico
  const contents: { role: string; parts: { text: string }[] }[] = [];

  // Primeira mensagem com contexto do circuito
  contents.push({
    role: 'user',
    parts: [{ text: `${systemInstruction}\n\nContexto do Circuito Atual do Usuário:\n${circuitContext}` }]
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'Entendido! Estou pronto para ajudar com o circuito. Como posso ajudar?' }]
  });

  // Adicionar histórico de conversa (últimas mensagens)
  if (chatHistory && chatHistory.length > 0) {
    const recentHistory = chatHistory.slice(-6); // Últimas 6 mensagens
    for (const msg of recentHistory) {
      if (msg.id === 'welcome') continue; // Pular mensagem de boas-vindas
      contents.push({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    }
  }

  // Mensagem atual do usuário (se não estiver duplicada no histórico)
  const lastHistoryMsg = chatHistory?.[chatHistory.length - 1];
  if (!lastHistoryMsg || lastHistoryMsg.text !== prompt) {
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });
  }

  const body = {
    contents
  };

  let lastError = '';

  for (const ep of endpointsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/${ep.version}/models/${ep.model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } else {
        const errData = await response.json().catch(() => ({}));
        lastError = errData.error?.message || `HTTP ${response.status}`;
      }
    } catch (err: any) {
      lastError = err.message || 'Erro de conexão';
    }
  }

  throw new Error(lastError || 'Não foi possível comunicar com a API do Gemini.');
}

export const DEFAULT_AZURE_FOUNDRY_ENDPOINT = 'https://eletronica-sem-mimimi.services.ai.azure.com/api/projects/proj-eletronica';

/**
 * Consulta à API do Microsoft Azure AI Foundry / Azure OpenAI / OpenAI compatible / Agent Service
 */
export async function queryAzureFoundryApi(
  apiKey: string,
  endpointUrl: string = DEFAULT_AZURE_FOUNDRY_ENDPOINT,
  prompt: string,
  circuitContext: string,
  modelOrDeploymentName: string = '',
  chatHistory?: AiChatMessage[]
): Promise<string> {
  const systemInstruction = buildSystemInstruction();

  let baseUrl = (endpointUrl || DEFAULT_AZURE_FOUNDRY_ENDPOINT).trim();
  const keyToUse = apiKey?.trim() || import.meta.env?.VITE_AZURE_FOUNDRY_KEY || import.meta.env?.VITE_AI_API_KEY || '';

  if (!keyToUse) {
    throw new Error('Chave de API do Azure AI Foundry não configurada no servidor de aplicação (.env).');
  }

  // Redireciona requisições do Azure para o proxy do Vite local se estiver no navegador para evitar bloqueio de CORS
  if (typeof window !== 'undefined' && baseUrl.includes('eletronica-sem-mimimi.services.ai.azure.com')) {
    baseUrl = baseUrl.replace('https://eletronica-sem-mimimi.services.ai.azure.com', '/azure-proxy');
  }

  const cleanUrl = baseUrl.replace(/\/$/, '');
  const rawPath = cleanUrl.split('?')[0];
  const deployment = modelOrDeploymentName?.trim() || 'proj-eletronica';

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': keyToUse,
    'Authorization': `Bearer ${keyToUse}`
  };

  const agentHeaders: Record<string, string> = {
    ...baseHeaders,
    'OpenAI-Beta': 'assistants=v2'
  };

  const diagnosticLogs: string[] = [];

  // -------------------------------------------------------------
  // ESTRATÉGIA 1: Azure AI Agent Service (Assistants API com variações de versão)
  // -------------------------------------------------------------
  const agentApiVersions = [
    '2024-10-21',
    '2024-05-01-preview',
    '2024-02-15-preview',
    '2024-08-01-preview',
    '2024-10-01-preview',
    '2024-06-01',
    '2024-12-01-preview',
    '2025-01-01-preview'
  ];

  for (const ver of agentApiVersions) {
    for (const h of [agentHeaders, baseHeaders]) {
      try {
        const threadUrl = `${rawPath}/threads?api-version=${ver}`;
        // Construir mensagens com histórico para o thread
        const threadMessages: { role: string; content: string }[] = [];
        if (chatHistory && chatHistory.length > 0) {
          const recentHistory = chatHistory.slice(-6);
          for (const msg of recentHistory) {
            if (msg.id === 'welcome') continue;
            threadMessages.push({
              role: msg.sender === 'user' ? 'user' : 'assistant',
              content: msg.text
            });
          }
        }
        // Se a mensagem atual não está no histórico, adicioná-la
        const lastMsg = threadMessages[threadMessages.length - 1];
        if (!lastMsg || lastMsg.content !== prompt) {
          threadMessages.push({
            role: 'user',
            content: `${systemInstruction}\n\nContexto do Circuito Atual do Usuário:\n${circuitContext}\n\nPergunta do Usuário:\n${prompt}`
          });
        }
        const threadRes = await fetch(threadUrl, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            messages: threadMessages.length > 0 ? threadMessages : [
              {
                role: 'user',
                content: `${systemInstruction}\n\nContexto do Circuito Atual do Usuário:\n${circuitContext}\n\nPergunta do Usuário:\n${prompt}`
              }
            ]
          })
        });

        if (threadRes.status === 401 || threadRes.status === 403) {
          throw new Error(`Autenticação recusada no Azure AI Foundry (HTTP ${threadRes.status}). Verifique se a sua API Key inserida no ícone 🔑 está correta.`);
        }

        if (threadRes.ok) {
          const threadData = await threadRes.json();
          const threadId = threadData.id;

          if (threadId) {
            const runRes = await fetch(`${rawPath}/threads/${threadId}/runs?api-version=${ver}`, {
              method: 'POST',
              headers: h,
              body: JSON.stringify({ assistant_id: deployment })
            });

            if (runRes.ok) {
              const runData = await runRes.json();
              const runId = runData.id;

              for (let attempt = 0; attempt < 15; attempt++) {
                await new Promise(r => setTimeout(r, 1000));
                const statusRes = await fetch(`${rawPath}/threads/${threadId}/runs/${runId}?api-version=${ver}`, { headers: h });
                if (statusRes.ok) {
                  const statusData = await statusRes.json();
                  if (statusData.status === 'completed') {
                    const msgsRes = await fetch(`${rawPath}/threads/${threadId}/messages?api-version=${ver}`, { headers: h });
                    if (msgsRes.ok) {
                      const msgsData = await msgsRes.json();
                      const assistantMsg = msgsData.data?.find((m: any) => m.role === 'assistant');
                      const replyText = assistantMsg?.content?.find((c: any) => c.type === 'text')?.text?.value || assistantMsg?.content?.[0]?.text?.value;
                      if (replyText) return replyText;
                    }
                  } else if (statusData.status === 'failed' || statusData.status === 'cancelled') {
                    break;
                  }
                }
              }
            }
          }
        } else {
          const errText = await threadRes.text().catch(() => '');
          diagnosticLogs.push(`[Agent ${threadRes.status}] ${ver}: ${errText.slice(0, 100)}`);
        }
      } catch (err: any) {
        if (err.message?.includes('Autenticação recusada')) throw err;
        diagnosticLogs.push(`[Agent Err] ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------
  // ESTRATÉGIA 2: Model Inference & Chat Completions
  // -------------------------------------------------------------
  const candidateUrls: string[] = [];

  if (cleanUrl.includes('api-version=')) {
    candidateUrls.push(cleanUrl);
  }

  const apiVersions = [
    '2024-10-21',
    '2024-05-01-preview',
    '2024-02-15-preview',
    '2024-08-01-preview',
    '2024-06-01',
    '2024-10-01-preview',
    '2024-12-01-preview'
  ];

  const candidateBasePaths = [
    rawPath.endsWith('/chat/completions') ? rawPath : `${rawPath}/chat/completions`,
    `${rawPath}/models/chat/completions`,
    `${rawPath}/deployments/${deployment}/chat/completions`,
    `${rawPath}/openai/deployments/${deployment}/chat/completions`,
    `https://eletronica-sem-mimimi.services.ai.azure.com/models/chat/completions`,
    `https://eletronica-sem-mimimi.openai.azure.com/openai/deployments/${deployment}/chat/completions`
  ];

  for (const basePath of candidateBasePaths) {
    for (const ver of apiVersions) {
      const fullUrl = `${basePath}?api-version=${ver}`;
      if (!candidateUrls.includes(fullUrl)) {
        candidateUrls.push(fullUrl);
      }
    }
  }

  // Construir mensagens do chat completions com histórico
  const chatMessages: { role: string; content: string }[] = [
    { role: 'system', content: systemInstruction }
  ];

  // Adicionar contexto do circuito
  chatMessages.push({ role: 'user', content: `Contexto do Circuito Atual do Usuário:\n${circuitContext}` });
  chatMessages.push({ role: 'assistant', content: 'Entendido, analisei o circuito. Como posso ajudar?' });

  // Adicionar histórico de conversa
  if (chatHistory && chatHistory.length > 0) {
    const recentHistory = chatHistory.slice(-6);
    for (const msg of recentHistory) {
      if (msg.id === 'welcome') continue;
      chatMessages.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    }
  }

  // Mensagem atual do usuário
  const lastChatMsg = chatMessages[chatMessages.length - 1];
  if (!lastChatMsg || lastChatMsg.content !== prompt) {
    chatMessages.push({ role: 'user', content: prompt });
  }

  const bodiesToTry = [
    {
      model: deployment,
      messages: chatMessages,
      temperature: 0.7
    },
    {
      messages: chatMessages,
      temperature: 0.7
    }
  ];

  for (const url of candidateUrls) {
    for (const bodyPayload of bodiesToTry) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: baseHeaders,
          body: JSON.stringify(bodyPayload)
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content || data.response || data.message || data.output || data.choices?.[0]?.text;
          if (text) return text;
        } else {
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Autenticação recusada no Azure AI Foundry (HTTP ${response.status}). Verifique se a sua API Key está correta.`);
          }

          const errData = await response.json().catch(() => ({}));
          const msg = errData.error?.message || errData.message || `HTTP ${response.status}: ${response.statusText || 'Erro'}`;
          diagnosticLogs.push(`[${response.status}] ${msg}`);
        }
      } catch (err: any) {
        if (err.message?.includes('Autenticação recusada')) throw err;
        diagnosticLogs.push(`[Err] ${err.message}`);
      }
    }
  }

  const firstSpecific = diagnosticLogs.find(l => !l.includes('Missing required query parameter') && !l.includes('404') && !l.includes('API version not supported')) || diagnosticLogs[0];

  throw new Error(
    `Falha na comunicação com o agente ESM IA no Azure AI Foundry.\n\nDetalhes do Diagnóstico: ${firstSpecific || 'Endpoint ou deployment indisponível'}.`
  );
}





