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
export async function queryGeminiApi(apiKey: string, prompt: string, circuitContext: string): Promise<string> {
  const endpointsToTry = [
    { version: 'v1beta', model: 'gemini-2.0-flash' },
    { version: 'v1beta', model: 'gemini-2.0-flash-lite' },
    { version: 'v1', model: 'gemini-1.5-flash' },
    { version: 'v1', model: 'gemini-1.5-pro' },
    { version: 'v1beta', model: 'gemini-1.5-flash' }
  ];

  const systemInstruction = `Você é o ESM AI, um assistente especialista em engenharia elétrica, física de semicondutores e simulação de circuitos. 
Responda de forma clara, didática e motivadora em Português do Brasil (PT-BR). 
Use formatação markdown (negritos, listas e LaTeX simples para fórmulas).`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${systemInstruction}\n\nContexto do Circuito Atual do Usuário:\n${circuitContext}\n\nPergunta do Usuário:\n${prompt}` }
        ]
      }
    ]
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
  modelOrDeploymentName: string = ''
): Promise<string> {
  const systemInstruction = `Você é o ESM IA, um assistente especialista em engenharia elétrica, eletrônica, física de semicondutores e simulação de circuitos.
Você está integrado a um simulador de circuitos interativo. O usuário monta circuitos na board e você recebe o estado completo do circuito (componentes, valores, conexões e simulação) como contexto.

REGRAS:
1. SEMPRE analise o contexto do circuito fornecido — ele contém os componentes reais, seus valores, as conexões entre terminais e o estado da simulação.
2. Ao DIAGNOSTICAR: identifique erros de montagem, componentes sem conexão, valores inadequados (resistores muito baixos, tensões excessivas), ausência de GND, LEDs sem resistor limitador, curtos-circuitos e componentes queimados. Sugira correções específicas com valores numéricos.
3. Ao EXPLICAR: descreva o funcionamento do circuito real montado, explicando o papel de cada componente, o percurso da corrente, as tensões esperadas em cada nó e os princípios teóricos (Lei de Ohm, Kirchhoff, divisor de tensão, etc).
4. Responda SEMPRE em Português do Brasil (PT-BR), de forma clara, didática e motivadora.
5. Use formatação markdown (negritos, listas, tabelas e LaTeX simples para fórmulas como $I = \\\\frac{V}{R}$).
6. Se o circuito estiver vazio, oriente o usuário a adicionar componentes pela biblioteca.`;

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
        const threadRes = await fetch(threadUrl, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            messages: [
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

  const bodiesToTry = [
    {
      model: deployment,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `Contexto do Circuito Atual do Usuário:\n${circuitContext}\n\nPergunta do Usuário:\n${prompt}` }
      ],
      temperature: 0.7
    },
    {
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `Contexto do Circuito Atual do Usuário:\n${circuitContext}\n\nPergunta do Usuário:\n${prompt}` }
      ],
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





