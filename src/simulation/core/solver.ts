import type { CircuitComponent, CircuitWire, SimulationResult } from '../../types/circuit';

// Função auxiliar para resolver Ax = B via eliminação gaussiana com pivoteamento parcial
export function solveLinearSystem(A: number[][], B: number[]): number[] {
  const n = B.length;
  
  // Clone A e B para evitar mutação indesejada
  const a = A.map(row => [...row]);
  const x = [...B];

  for (let i = 0; i < n; i++) {
    // Busca do pivô
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) {
        maxRow = k;
      }
    }

    // Troca de linhas em A e B
    const tempRow = a[i];
    a[i] = a[maxRow];
    a[maxRow] = tempRow;

    const tempB = x[i];
    x[i] = x[maxRow];
    x[maxRow] = tempB;

    // Verifica se a matriz é singular
    if (Math.abs(a[i][i]) < 1e-12) {
      throw new Error('Sistema singular ou mal condicionado: circuito aberto ou nó flutuante detectado.');
    }

    // Eliminação
    for (let k = i + 1; k < n; k++) {
      const factor = a[k][i] / a[i][i];
      x[k] -= factor * x[i];
      for (let j = i; j < n; j++) {
        a[k][j] -= factor * a[i][j];
      }
    }
  }

  // Substituição reversa
  const solution = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += a[i][j] * solution[j];
    }
    solution[i] = (x[i] - sum) / a[i][i];
  }

  return solution;
}

export interface SolverState {
  capacitorVoltages: Record<string, number>;
  capacitorCurrents: Record<string, number>;
  inductorVoltages: Record<string, number>;
  inductorCurrents: Record<string, number>;
  time: number;
  nodeVoltages: Record<string, number>;
  probePeaks?: Record<string, number>;
}

interface ExtraRestriction {
  compId: string;
  n1: number;
  n2: number;
  vDrop: number;
  type: string;
  beta?: number;
  nC?: number;
  nE?: number;
  bjtType?: 'npn' | 'pnp';
}

function isGridPointOnWire(gridX: number, gridY: number, wire: CircuitWire, components: CircuitComponent[]): boolean {
  const compFrom = components.find(c => c.id === wire.from.componentId);
  const compTo = components.find(c => c.id === wire.to.componentId);
  const termFrom = compFrom?.terminals.find(t => t.id === wire.from.terminalId);
  const termTo = compTo?.terminals.find(t => t.id === wire.to.terminalId);
  if (!termFrom || !termTo) return false;

  const points = [
    { x: termFrom.x, y: termFrom.y },
    ...(wire.routePoints || []),
    { x: termTo.x, y: termTo.y }
  ];

  if (wire.routePoints && wire.routePoints.length > 0) {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      if (gridX >= minX && gridX <= maxX && gridY >= minY && gridY <= maxY) {
        if (p1.x === p2.x && gridX === p1.x) return true;
        if (p1.y === p2.y && gridY === p1.y) return true;
      }
    }
  } else {
    const x1 = termFrom.x;
    const y1 = termFrom.y;
    const x2 = termTo.x;
    const y2 = termTo.y;
    const verticalFirst = wire.verticalFirst ?? false;
    const bendOffset = wire.bendOffset;

    if (x1 !== x2 && y1 !== y2) {
      if (bendOffset !== undefined) {
        const mid = verticalFirst ? y1 + bendOffset : x1 + bendOffset;
        const segs = verticalFirst
          ? [[x1, y1, x1, mid], [x1, mid, x2, mid], [x2, mid, x2, y2]]
          : [[x1, y1, mid, y1], [mid, y1, mid, y2], [mid, y2, x2, y2]];
        for (const [sx1, sy1, sx2, sy2] of segs) {
          if (gridX >= Math.min(sx1, sx2) && gridX <= Math.max(sx1, sx2) &&
              gridY >= Math.min(sy1, sy2) && gridY <= Math.max(sy1, sy2)) return true;
        }
      } else {
        const segs = verticalFirst
          ? [[x1, y1, x1, y2], [x1, y2, x2, y2]]
          : [[x1, y1, x2, y1], [x2, y1, x2, y2]];
        for (const [sx1, sy1, sx2, sy2] of segs) {
          if (gridX >= Math.min(sx1, sx2) && gridX <= Math.max(sx1, sx2) &&
              gridY >= Math.min(sy1, sy2) && gridY <= Math.max(sy1, sy2)) return true;
        }
      }
    } else {
      if (gridX >= Math.min(x1, x2) && gridX <= Math.max(x1, x2) &&
          gridY >= Math.min(y1, y2) && gridY <= Math.max(y1, y2)) return true;
    }
  }

  return false;
}

export function runSimulationStep(
  components: CircuitComponent[],
  wires: CircuitWire[],
  state: SolverState,
  dt: number
): { result: SimulationResult; nextState: SolverState } {
  
  // 1. Identificar Nós Elétricos (Union-Find)
  // Agrupa os terminais dos componentes e conexões de fios que compartilham a mesma posição no grid.
  const parent: Record<string, string> = {};
  
  const getTerminalKey = (compId: string, termId: string) => `${compId}:${termId}`;

  // Helper para buscar com compressão de caminho
  const find = (i: string): string => {
    if (!parent[i]) parent[i] = i;
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };

  // Helper para unir conjuntos
  const union = (i: string, j: string) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  };

  // 1a. Unir terminais que estão fisicamente na mesma coordenada absoluta no grid
  const coordsMap: Record<string, string[]> = {}; // "x,y" -> [TerminalKeys]
  
  components.forEach(comp => {
    comp.terminals.forEach(term => {
      const key = getTerminalKey(comp.id, term.id);
      const coordKey = `${term.x},${term.y}`;
      if (!coordsMap[coordKey]) coordsMap[coordKey] = [];
      coordsMap[coordKey].push(key);
    });
  });

  Object.values(coordsMap).forEach(termKeys => {
    for (let i = 1; i < termKeys.length; i++) {
      union(termKeys[0], termKeys[i]);
    }
  });

  // 1b. Unir terminais conectados por fios ideais.
  wires.forEach(wire => {
    const keyFrom = getTerminalKey(wire.from.componentId, wire.from.terminalId);
    const keyTo = getTerminalKey(wire.to.componentId, wire.to.terminalId);
    union(keyFrom, keyTo);
  });

  // 1b2. Unir pontas de prova (probes) aos fios e nós por onde sua agulha passa no grid
  components.forEach(comp => {
    if (comp.type === 'probe_dc' || comp.type === 'probe_ac') {
      const probeKey = getTerminalKey(comp.id, 'p');
      const termP = comp.terminals.find(t => t.id === 'p');
      const px = termP?.x ?? comp.x;
      const py = termP?.y ?? comp.y;

      let foundUnion = false;
      for (const wire of wires) {
        if (isGridPointOnWire(px, py, wire, components)) {
          const wireKey = getTerminalKey(wire.from.componentId, wire.from.terminalId);
          union(probeKey, wireKey);
          foundUnion = true;
          break;
        }
      }

      if (!foundUnion) {
        components.forEach(other => {
          if (other.id === comp.id) return;
          other.terminals.forEach(otherTerm => {
            const ox = otherTerm.x ?? other.x;
            const oy = otherTerm.y ?? other.y;
            if (ox === px && oy === py) {
              union(probeKey, getTerminalKey(other.id, otherTerm.id));
            }
          });
        });
      }
    }
  });

  // 1c. Mapear terminais para nós do simulador
  // Identifica o nó do ground (Terra)
  let groundRoot: string | null = null;
  components.forEach(comp => {
    if (comp.type === 'ground') {
      comp.terminals.forEach(term => {
        groundRoot = find(getTerminalKey(comp.id, term.id));
      });
    }
  });

  // Mapeia raízes do Union-Find para inteiros ordenados
  // O Ground é sempre o nó 0.
  const rootToNodeIndex: Record<string, number> = {};
  let nodeCount = 1; // 0 é reservado para o ground

  if (groundRoot !== null) {
    rootToNodeIndex[groundRoot] = 0;
  }

  components.forEach(comp => {
    comp.terminals.forEach(term => {
      const root = find(getTerminalKey(comp.id, term.id));
      if (rootToNodeIndex[root] === undefined) {
        // Se houver ground mas esta raiz não é o ground
        if (groundRoot !== null) {
          rootToNodeIndex[root] = nodeCount++;
        } else {
          // Sem ground definido, o primeiro que achamos vira a referência temporária
          rootToNodeIndex[root] = 0;
          groundRoot = root;
        }
      }
    });
  });

  // Mapeamento direto de terminal para índice de nó elétrico
  const terminalToNode: Record<string, number> = {};
  components.forEach(comp => {
    comp.terminals.forEach(term => {
      const termKey = getTerminalKey(comp.id, term.id);
      const root = find(termKey);
      terminalToNode[termKey] = rootToNodeIndex[root];
    });
  });

  // 2. Montagem do Sistema MNA
  // Determina quantos nós elétricos temos (excluindo nó 0)
  const numNodes = nodeCount - 1; // Nó de tensão de 1 a numNodes

  // Identifica componentes que introduzem restrições adicionais de corrente (Fontes de tensão, Amperímetro, Chaves)
  // Cada uma adiciona uma linha e coluna extras no sistema MNA.
  const voltageSources: {
    compId: string;
    nodePos: number;
    nodeNeg: number;
    voltage: number;
    type: string;
  }[] = [];

  // Mapeamento das chaves, diodos e BJTs para o estado linearizado por partes (iterativo)
  const switches: { compId: string; node1: number; node2: number; isOpen: boolean }[] = [];
  const diodes: { compId: string; nodeAnode: number; nodeCathode: number; type: 'diodo' | 'led' | 'zener'; vOn: number }[] = [];
  const bjts: { compId: string; nC: number; nB: number; nE: number; type: 'npn' | 'pnp'; beta: number }[] = [];

  components.forEach(comp => {
    if (comp.type === 'source_dc') {
      const v = Number(comp.properties.voltage?.value ?? 5);
      voltageSources.push({
        compId: comp.id,
        nodePos: terminalToNode[getTerminalKey(comp.id, 'p')],
        nodeNeg: terminalToNode[getTerminalKey(comp.id, 'n')],
        voltage: v,
        type: 'dc'
      });
    } else if (comp.type === 'source_ac') {
      const amplitude = Number(comp.properties.amplitude?.value ?? 5);
      const freq = Number(comp.properties.frequency?.value ?? 60);
      const phase = Number(comp.properties.phase?.value ?? 0) * Math.PI / 180;
      const offset = Number(comp.properties.offset?.value ?? 0);
      
      const vVal = amplitude * Math.sin(2 * Math.PI * freq * state.time + phase) + offset;
      
      voltageSources.push({
        compId: comp.id,
        nodePos: terminalToNode[getTerminalKey(comp.id, 'p')],
        nodeNeg: terminalToNode[getTerminalKey(comp.id, 'n')],
        voltage: vVal,
        type: 'ac'
      });
    } else if (comp.type === 'source_pulse') {
      const amplitude = Number(comp.properties.amplitude?.value ?? 5);
      const freq = Number(comp.properties.frequency?.value ?? 1000);
      const duty = Number(comp.properties.dutyCycle?.value ?? 50) / 100;
      const offset = Number(comp.properties.offset?.value ?? 0);

      const period = 1 / freq;
      const tMod = state.time % period;
      const vVal = (tMod < period * duty) ? amplitude + offset : offset;

      voltageSources.push({
        compId: comp.id,
        nodePos: terminalToNode[getTerminalKey(comp.id, 'p')],
        nodeNeg: terminalToNode[getTerminalKey(comp.id, 'n')],
        voltage: vVal,
        type: 'pulse'
      });
    } else if (comp.type === 'function_generator') {
      const getPropVal = (key: string, defaultVal: any) => {
        const p = comp.properties?.[key];
        if (p === undefined || p === null) return defaultVal;
        if (typeof p === 'object' && 'value' in p) return p.value ?? defaultVal;
        return p;
      };

      // O campo de amplitude do gerador de funções representa o valor de pico,
      // igual ao restante das fontes senoidais da aplicação.
      const amplitudePeak = Number(getPropVal('amplitude', 5));
      const freq = Number(getPropVal('frequency', 1000));
      const offset = Number(getPropVal('offset', 0));
      const dutyFrac = Number(getPropVal('dutyCycle', 50)) / 100;
      const duty = Math.max(0.01, Math.min(0.99, dutyFrac));
      const waveform = String(getPropVal('waveform', 'sine')).toLowerCase();

      // Exact phase [0, 1) using normalized frequency * time
      let phase = (freq * state.time) % 1;
      if (phase < 0) phase += 1;

      let rawVal = 0;
      if (waveform === 'square') {
        rawVal = phase < duty ? 1 : -1;
      } else if (waveform === 'triangle') {
        rawVal = phase < duty
          ? (-1 + 2 * (phase / duty))
          : (1 - 2 * ((phase - duty) / (1 - duty)));
      } else if (waveform === 'sawtooth') {
        rawVal = 2 * phase - 1;
      } else {
        // sine
        rawVal = Math.sin(2 * Math.PI * phase);
      }

      const vVal = amplitudePeak * rawVal + offset;

      voltageSources.push({
        compId: comp.id,
        nodePos: terminalToNode[getTerminalKey(comp.id, 'p')],
        nodeNeg: terminalToNode[getTerminalKey(comp.id, 'n')],
        voltage: vVal,
        type: 'function_generator'
      });
    } else if (comp.type === 'ammeter' || comp.type === 'voltmeter') {
      // Instrumentos: Voltímetro e Amperímetro
      // Amperímetro comporta-se como uma fonte de 0V para ler a corrente do ramo
      if (comp.type === 'ammeter') {
        voltageSources.push({
          compId: comp.id,
          nodePos: terminalToNode[getTerminalKey(comp.id, 'p')],
          nodeNeg: terminalToNode[getTerminalKey(comp.id, 'n')],
          voltage: 0,
          type: 'ammeter'
        });
      }
    } else if (comp.type === 'switch') {
      const isOpen = !(comp.properties.state?.value ?? false);
      const n1 = terminalToNode[getTerminalKey(comp.id, 't1')];
      const n2 = terminalToNode[getTerminalKey(comp.id, 't2')];
      switches.push({ compId: comp.id, node1: n1, node2: n2, isOpen });
    } else if (comp.type === 'relay') {
      const nC1 = terminalToNode[getTerminalKey(comp.id, 'coil1')];
      const nC2 = terminalToNode[getTerminalKey(comp.id, 'coil2')];
      const v1 = nC1 === 0 ? 0 : (state.nodeVoltages[nC1] ?? 0);
      const v2 = nC2 === 0 ? 0 : (state.nodeVoltages[nC2] ?? 0);
      const vCoil = Math.abs(v1 - v2);
      const vTrig = Number(comp.properties.triggerVoltage?.value ?? 5);
      const isActive = vCoil >= vTrig * 0.75; // Atraca com 75% da tensão nominal

      const nCom = terminalToNode[getTerminalKey(comp.id, 'com')];
      const nNc = terminalToNode[getTerminalKey(comp.id, 'nc')];
      const nNo = terminalToNode[getTerminalKey(comp.id, 'no')];

      // Duas chaves virtuais
      switches.push({ compId: comp.id + '_nc', node1: nCom, node2: nNc, isOpen: isActive });
      switches.push({ compId: comp.id + '_no', node1: nCom, node2: nNo, isOpen: !isActive });
    } else if (comp.type === 'diodo' || comp.type === 'led' || comp.type === 'zener') {
      const nAnode = terminalToNode[getTerminalKey(comp.id, 'a')];
      const nCathode = terminalToNode[getTerminalKey(comp.id, 'c')];
      const vOn = comp.type === 'led' ? 1.8 : 0.6; // LED cai ~1.8V, Diodo caiu ~0.6V
      diodes.push({ compId: comp.id, nodeAnode: nAnode, nodeCathode: nCathode, type: comp.type as any, vOn });
    } else if (comp.type === 'transistor_bjt_npn' || comp.type === 'transistor_bjt_pnp') {
      const nC = terminalToNode[getTerminalKey(comp.id, 'c')];
      const nB = terminalToNode[getTerminalKey(comp.id, 'b')];
      const nE = terminalToNode[getTerminalKey(comp.id, 'e')];
      const beta = Number(comp.properties.beta?.value ?? 100);
      bjts.push({ compId: comp.id, nC, nB, nE, type: comp.type === 'transistor_bjt_npn' ? 'npn' : 'pnp', beta });
    } else if (comp.type === 'logic_and' || comp.type === 'logic_or' || comp.type === 'logic_not') {
      const getTermNode = (tId: string) => terminalToNode[getTerminalKey(comp.id, tId)];
      const getVolt = (nodeIdx: number) => {
        if (nodeIdx === undefined || nodeIdx <= 0) return 0;
        return state.nodeVoltages[nodeIdx] ?? 0;
      };
      
      let outVal = 0; // LOW = 0V
      if (comp.type === 'logic_and') {
        const v1 = getVolt(getTermNode('in1'));
        const v2 = getVolt(getTermNode('in2'));
        if (v1 >= 2.5 && v2 >= 2.5) outVal = 5; // HIGH = 5V
      } else if (comp.type === 'logic_or') {
        const v1 = getVolt(getTermNode('in1'));
        const v2 = getVolt(getTermNode('in2'));
        if (v1 >= 2.5 || v2 >= 2.5) outVal = 5;
      } else if (comp.type === 'logic_not') {
        const v1 = getVolt(getTermNode('in'));
        if (v1 < 2.5) outVal = 5;
      }
      
      voltageSources.push({
        compId: comp.id,
        nodePos: getTermNode('out'),
        nodeNeg: 0, // Em relação ao Terra
        voltage: outVal,
        type: 'logic'
      });
    }
  });

  // Resolvemos não-linearidades de diodos, chaves e BJTs iterativamente
  // Para diodos, o estado inicial de condução (on/off)
  const diodeConducting: Record<string, boolean> = {};
  diodes.forEach(d => {
    diodeConducting[d.compId] = false; // Começa cortado
  });
  
  // Para BJTs, começam cortados
  const bjtState: Record<string, 'cutoff' | 'active' | 'saturation'> = {};
  bjts.forEach(t => {
    bjtState[t.compId] = 'cutoff';
  });

  let solutionVec: number[] = [];
  let numIterations = 0;
  const maxIterations = 8;
  let converged = false;
  let lastExtraRestrictions: ExtraRestriction[] = [];

  // Clone das fontes de tensão que serão estaticamente adicionadas no MNA
  const activeVoltageSources = [...voltageSources];

  // Loop de convergência iterativo para diodos e chaves
  while (!converged && numIterations < maxIterations) {
    numIterations++;

    // Monta a matriz MNA baseada no estado atual dos diodos e chaves
    // Tamanho do sistema = numNodes + activeVoltageSources.length + (chaves fechadas) + (diodos em condução)
    const extraRestr: ExtraRestriction[] = [];

    // Chaves
    switches.forEach(sw => {
      if (!sw.isOpen) {
        // Chave fechada = Fonte de tensão de 0V (curto)
        extraRestr.push({ compId: sw.compId, n1: sw.node1, n2: sw.node2, vDrop: 0, type: 'switch' });
      }
    });

    // Diodos em condução
    diodes.forEach(d => {
      if (diodeConducting[d.compId]) {
        // Diodo conduzindo = Fonte de tensão de queda de tensão (vOn)
        extraRestr.push({ compId: d.compId, n1: d.nodeAnode, n2: d.nodeCathode, vDrop: d.vOn, type: 'diode_on' });
      }
    });

    // BJTs
    bjts.forEach(t => {
      const state = bjtState[t.compId];
      if (t.type === 'npn') {
        if (state === 'active') {
          extraRestr.push({ compId: t.compId, n1: t.nB, n2: t.nE, vDrop: 0.6, type: 'bjt_be', beta: t.beta, nC: t.nC, nE: t.nE, bjtType: 'npn' });
        } else if (state === 'saturation') {
          extraRestr.push({ compId: t.compId + '_be', n1: t.nB, n2: t.nE, vDrop: 0.6, type: 'bjt_be_sat' });
          extraRestr.push({ compId: t.compId + '_ce', n1: t.nC, n2: t.nE, vDrop: 0.2, type: 'bjt_ce_sat' });
        }
      } else { // pnp
        if (state === 'active') {
          extraRestr.push({ compId: t.compId, n1: t.nE, n2: t.nB, vDrop: 0.6, type: 'bjt_eb', beta: t.beta, nC: t.nC, nE: t.nE, bjtType: 'pnp' });
        } else if (state === 'saturation') {
          extraRestr.push({ compId: t.compId + '_eb', n1: t.nE, n2: t.nB, vDrop: 0.6, type: 'bjt_eb_sat' });
          extraRestr.push({ compId: t.compId + '_ec', n1: t.nE, n2: t.nC, vDrop: 0.2, type: 'bjt_ec_sat' });
        }
      }
    });

    const totalSources = activeVoltageSources.length + extraRestr.length;
    const sysSize = numNodes + totalSources;

    const A: number[][] = Array.from({ length: sysSize }, () => new Array(sysSize).fill(0));
    const B: number[] = new Array(sysSize).fill(0);

    // Injeta resistores, fontes de corrente, capacitores e indutores
    components.forEach(comp => {
      const getTermNode = (tId: string) => terminalToNode[getTerminalKey(comp.id, tId)];

      if (comp.type === 'resistor' || comp.type === 'ldr' || comp.type === 'motor_dc') {
        let r: number;
        if (comp.type === 'resistor') {
          r = Math.max(Number(comp.properties.resistance?.value ?? 1000), 0.01);
        } else if (comp.type === 'motor_dc') {
          r = Math.max(Number(comp.properties.resistance?.value ?? 10), 0.01);
        } else {
          // LDR: R = 1MΩ / (1 + light * 10.0)
          const light = Number(comp.properties.light?.value ?? 50);
          r = Math.max(0.1, 1000000 / (1 + light * 10.0));
        }
        const g = 1 / r;
        const n1 = getTermNode('t1');
        const n2 = getTermNode('t2');
        
        // Estampa condutância
        if (n1 > 0) A[n1 - 1][n1 - 1] += g;
        if (n2 > 0) A[n2 - 1][n2 - 1] += g;
        if (n1 > 0 && n2 > 0) {
          A[n1 - 1][n2 - 1] -= g;
          A[n2 - 1][n1 - 1] -= g;
        }
      } else if (comp.type === 'relay') {
        const rCoil = Math.max(Number(comp.properties.coilResistance?.value ?? 100), 1);
        const g = 1 / rCoil;
        const nC1 = getTermNode('coil1');
        const nC2 = getTermNode('coil2');
        
        if (nC1 > 0) A[nC1 - 1][nC1 - 1] += g;
        if (nC2 > 0) A[nC2 - 1][nC2 - 1] += g;
        if (nC1 > 0 && nC2 > 0) {
          A[nC1 - 1][nC2 - 1] -= g;
          A[nC2 - 1][nC1 - 1] -= g;
        }
      } else if (comp.type === 'pot') {
        const rTotal = Math.max(Number(comp.properties.resistance?.value ?? 10000), 10);
        const setting = Math.max(0.1, Math.min(99.9, Number(comp.properties.setting?.value ?? 50))) / 100;
        const r1 = rTotal * (1 - setting);
        const r2 = rTotal * setting;
        
        const nA = getTermNode('a');
        const nB = getTermNode('b');
        const nW = getTermNode('w');
        
        // Resistor 1 entre A e W
        const g1 = 1 / r1;
        if (nA > 0) A[nA - 1][nA - 1] += g1;
        if (nW > 0) A[nW - 1][nW - 1] += g1;
        if (nA > 0 && nW > 0) {
          A[nA - 1][nW - 1] -= g1;
          A[nW - 1][nA - 1] -= g1;
        }
        
        // Resistor 2 entre W e B
        const g2 = 1 / r2;
        if (nW > 0) A[nW - 1][nW - 1] += g2;
        if (nB > 0) A[nB - 1][nB - 1] += g2;
        if (nW > 0 && nB > 0) {
          A[nW - 1][nB - 1] -= g2;
          A[nB - 1][nW - 1] -= g2;
        }
      } else if (comp.type === 'source_current') {
        const iVal = Number(comp.properties.current?.value ?? 0.01);
        const nPos = getTermNode('p');
        const nNeg = getTermNode('n');
        // Injeta corrente
        if (nPos > 0) B[nPos - 1] -= iVal;
        if (nNeg > 0) B[nNeg - 1] += iVal;
      } else if (comp.type === 'capacitor' || comp.type === 'capacitor_ceramic' || comp.type === 'capacitor_polyester') {
        const c = Number(comp.properties.capacitance?.value ?? 1e-6); // 1uF
        const n1 = getTermNode('t1');
        const n2 = getTermNode('t2');
        
        const gEq = (2 * c) / dt;
        // Tensão anterior do capacitor
        const vPrev = state.capacitorVoltages[comp.id] ?? 0;
        const iPrev = state.capacitorCurrents[comp.id] ?? 0;
        
        // Fonte de corrente equivalente: Ieq = - gEq * vPrev - iPrev
        const iEq = -gEq * vPrev - iPrev;

        if (n1 > 0) {
          A[n1 - 1][n1 - 1] += gEq;
          B[n1 - 1] -= iEq;
        }
        if (n2 > 0) {
          A[n2 - 1][n2 - 1] += gEq;
          B[n2 - 1] += iEq;
        }
        if (n1 > 0 && n2 > 0) {
          A[n1 - 1][n2 - 1] -= gEq;
          A[n2 - 1][n1 - 1] -= gEq;
        }
      } else if (comp.type === 'inductor') {
        const l = Number(comp.properties.inductance?.value ?? 1e-3); // 1mH
        const n1 = getTermNode('t1');
        const n2 = getTermNode('t2');
        
        const gEq = dt / (2 * l);
        const vPrev = state.inductorVoltages[comp.id] ?? 0;
        const iPrev = state.inductorCurrents[comp.id] ?? 0;
        
        // Fonte de corrente equivalente: Ieq = iPrev + gEq * vPrev
        const iEq = iPrev + gEq * vPrev;

        if (n1 > 0) {
          A[n1 - 1][n1 - 1] += gEq;
          B[n1 - 1] -= iEq;
        }
        if (n2 > 0) {
          A[n2 - 1][n2 - 1] += gEq;
          B[n2 - 1] += iEq;
        }
        if (n1 > 0 && n2 > 0) {
          A[n1 - 1][n2 - 1] -= gEq;
          A[n2 - 1][n1 - 1] -= gEq;
        }
      } else if (comp.type === 'switch' && !(comp.properties.state?.value ?? false)) {
        // Chave Aberta: Pequeníssima condutância para evitar matriz singular
        const gOff = 1e-12;
        const n1 = getTermNode('t1');
        const n2 = getTermNode('t2');
        if (n1 > 0) A[n1 - 1][n1 - 1] += gOff;
        if (n2 > 0) A[n2 - 1][n2 - 1] += gOff;
        if (n1 > 0 && n2 > 0) {
          A[n1 - 1][n2 - 1] -= gOff;
          A[n2 - 1][n1 - 1] -= gOff;
        }
      } else if (comp.type === 'diodo' || comp.type === 'led' || comp.type === 'zener') {
        // Diodo no estado CORTADO (diodeConducting === false)
        if (!diodeConducting[comp.id]) {
          const gOff = 1e-12;
          const nAnode = getTermNode('a');
          const nCathode = getTermNode('c');
          if (nAnode > 0) A[nAnode - 1][nAnode - 1] += gOff;
          if (nCathode > 0) A[nCathode - 1][nCathode - 1] += gOff;
          if (nAnode > 0 && nCathode > 0) {
            A[nAnode - 1][nCathode - 1] -= gOff;
            A[nCathode - 1][nAnode - 1] -= gOff;
          }
        }
      } else if (comp.type === 'transistor_bjt_npn' || comp.type === 'transistor_bjt_pnp') {
        // BJT Cutoff: Leakage conductance to avoid singular matrix
        if (bjtState[comp.id] === 'cutoff') {
          const gOff = 1e-12;
          const nB = getTermNode('b');
          const nE = getTermNode('e');
          const nC = getTermNode('c');
          // Leakage B-E
          if (nB > 0) A[nB - 1][nB - 1] += gOff;
          if (nE > 0) A[nE - 1][nE - 1] += gOff;
          if (nB > 0 && nE > 0) {
            A[nB - 1][nE - 1] -= gOff;
            A[nE - 1][nB - 1] -= gOff;
          }
          // Leakage C-E
          if (nC > 0) A[nC - 1][nC - 1] += gOff;
          if (nE > 0) A[nE - 1][nE - 1] += gOff;
          if (nC > 0 && nE > 0) {
            A[nC - 1][nE - 1] -= gOff;
            A[nE - 1][nC - 1] -= gOff;
          }
        }
      }
    }); // Fim do loop de componentes

    // Injeta as fontes de tensão fixas no MNA
    activeVoltageSources.forEach((src, idx) => {
      const srcIdx = numNodes + idx;
      
      if (src.nodePos > 0) {
        A[src.nodePos - 1][srcIdx] += 1;
        A[srcIdx][src.nodePos - 1] += 1;
      }
      if (src.nodeNeg > 0) {
        A[src.nodeNeg - 1][srcIdx] -= 1;
        A[srcIdx][src.nodeNeg - 1] -= 1;
      }
      // Adiciona pequena resistência interna para evitar matriz singular em loops de fontes
      A[srcIdx][srcIdx] = -1e-4;
      B[srcIdx] = src.voltage;
    });

    // Injeta as restrições extras (Chaves fechadas / Diodos conduzindo / BJTs ativos)
    extraRestr.forEach((restr, idx) => {
      const restrIdx = numNodes + activeVoltageSources.length + idx;

      if (restr.n1 > 0) {
        A[restr.n1 - 1][restrIdx] += 1;
        A[restrIdx][restr.n1 - 1] += 1;
      }
      if (restr.n2 > 0) {
        A[restr.n2 - 1][restrIdx] -= 1;
        A[restrIdx][restr.n2 - 1] -= 1;
      }
      // Adiciona pequena resistência interna para evitar matriz singular em curtos
      A[restrIdx][restrIdx] = -1e-4;
      B[restrIdx] = restr.vDrop;

      // Dependência CCCS para BJT ativo
      if (restr.type === 'bjt_be' && restr.bjtType === 'npn') {
        const nC = restr.nC!;
        const nE = restr.nE!;
        const beta = restr.beta!;
        if (nC > 0) A[nC - 1][restrIdx] += beta;
        if (nE > 0) A[nE - 1][restrIdx] -= beta;
      } else if (restr.type === 'bjt_eb' && restr.bjtType === 'pnp') {
        const nC = restr.nC!;
        const nE = restr.nE!;
        const beta = restr.beta!;
        if (nC > 0) A[nC - 1][restrIdx] -= beta; // Corrente entra no C e sai do E (?) Wait!
        if (nE > 0) A[nE - 1][restrIdx] += beta;
      }
    });

    // Resolve o sistema Ax = B
    try {
      solutionVec = solveLinearSystem(A, B);
    } catch (err) {
      // Em caso de falha (matriz singular), tenta adicionar condutância mínima de bypass para o terra
      // a todos os nós e resolve novamente
      const bypassA = A.map((row, rIdx) => 
        row.map((val, cIdx) => (rIdx === cIdx && rIdx < numNodes) ? val + 1e-9 : val)
      );
      try {
        solutionVec = solveLinearSystem(bypassA, B);
      } catch {
        // Se falhar mesmo assim, repassa o erro
        throw err;
      }
    }

    // 3. Atualizar estados dos diodos e verificar convergência
    // Lê as tensões nodais resultantes para checar se o estado de condução dos diodos deve mudar
    const getNodeVoltage = (nodeIdx: number) => {
      if (nodeIdx === 0) return 0;
      return solutionVec[nodeIdx - 1];
    };

    let stateChanged = false;
    diodes.forEach(d => {
      const vAnode = getNodeVoltage(d.nodeAnode);
      const vCathode = getNodeVoltage(d.nodeCathode);
      const vd = vAnode - vCathode;

      const isCurrentlyConducting = diodeConducting[d.compId];
      let shouldConduct = isCurrentlyConducting;

      if (!isCurrentlyConducting && vd > d.vOn) {
        // Tensão excedeu a queda direta, diodo entra em condução
        shouldConduct = true;
        stateChanged = true;
      } else if (isCurrentlyConducting) {
        // Diodo conduzindo: determinamos a corrente através da restrição MNA correspondente
        // A corrente MNA é a corrente que flui do terminal 1 (+) para o terminal 2 (-) da restrição.
        // A restrição foi adicionada na lista extraRestr.
        const restrIdx = extraRestr.findIndex(r => r.compId === d.compId);
        if (restrIdx !== -1) {
          const currentMnaIdx = numNodes + activeVoltageSources.length + restrIdx;
          const iDiode = solutionVec[currentMnaIdx]; // Sentido MNA (+) -> (-)
          if (iDiode < 0) {
            // Corrente reversa detectada -> corta o diodo
            shouldConduct = false;
            stateChanged = true;
          }
        }
      }

      diodeConducting[d.compId] = shouldConduct;
    });

    bjts.forEach(t => {
      const vB = getNodeVoltage(t.nB);
      const vC = getNodeVoltage(t.nC);
      const vE = getNodeVoltage(t.nE);
      
      const prevState = bjtState[t.compId];
      let nextState = prevState;

      if (t.type === 'npn') {
        const vBE = vB - vE;
        const vCE = vC - vE;
        const vBC = vB - vC;

        if (prevState === 'cutoff') {
          if (vBE > 0.6) nextState = vBC > 0.6 ? 'saturation' : 'active';
        } else if (prevState === 'active') {
          const idx = extraRestr.findIndex(r => r.compId === t.compId && r.type === 'bjt_be');
          const iB = idx !== -1 ? solutionVec[numNodes + activeVoltageSources.length + idx] : 0;
          if (iB < 0) nextState = 'cutoff';
          else if (vCE < 0.2) nextState = 'saturation';
        } else if (prevState === 'saturation') {
          const idxBE = extraRestr.findIndex(r => r.compId === t.compId + '_be');
          const idxCE = extraRestr.findIndex(r => r.compId === t.compId + '_ce');
          const iB = idxBE !== -1 ? solutionVec[numNodes + activeVoltageSources.length + idxBE] : 0;
          const iC = idxCE !== -1 ? solutionVec[numNodes + activeVoltageSources.length + idxCE] : 0;
          
          if (iB < 0) nextState = 'cutoff';
          else if (iC > t.beta * iB) nextState = 'active';
        }
      } else { // pnp
        const vEB = vE - vB;
        const vEC = vE - vC;
        const vCB = vC - vB;

        if (prevState === 'cutoff') {
          if (vEB > 0.6) nextState = vCB > 0.6 ? 'saturation' : 'active';
        } else if (prevState === 'active') {
          const idx = extraRestr.findIndex(r => r.compId === t.compId && r.type === 'bjt_eb');
          const iB = idx !== -1 ? solutionVec[numNodes + activeVoltageSources.length + idx] : 0;
          if (iB < 0) nextState = 'cutoff';
          else if (vEC < 0.2) nextState = 'saturation';
        } else if (prevState === 'saturation') {
          const idxEB = extraRestr.findIndex(r => r.compId === t.compId + '_eb');
          const idxEC = extraRestr.findIndex(r => r.compId === t.compId + '_ec');
          const iB = idxEB !== -1 ? solutionVec[numNodes + activeVoltageSources.length + idxEB] : 0;
          const iC = idxEC !== -1 ? solutionVec[numNodes + activeVoltageSources.length + idxEC] : 0;
          
          if (iB < 0) nextState = 'cutoff';
          else if (iC > t.beta * iB) nextState = 'active';
        }
      }

      if (prevState !== nextState) {
        bjtState[t.compId] = nextState;
        stateChanged = true;
      }
    });

    if (!stateChanged) {
      converged = true;
    }

    lastExtraRestrictions = extraRestr;
  }

  // 4. Mapear resultados da simulação resolvidos
  const getNodeVoltage = (nodeIdx: number) => {
    if (nodeIdx === 0) return 0;
    return solutionVec[nodeIdx - 1];
  };

  const nodeVoltages: Record<string, number> = {};
  for (let i = 0; i <= numNodes; i++) {
    nodeVoltages[String(i)] = getNodeVoltage(i);
  }

  const branchCurrents: Record<string, number> = {};
  const componentStates: Record<string, any> = {};

  const nextCapacitorVoltages = { ...state.capacitorVoltages };
  const nextCapacitorCurrents = { ...state.capacitorCurrents };
  const nextInductorVoltages = { ...state.inductorVoltages };
  const nextInductorCurrents = { ...state.inductorCurrents };
  const nextProbePeaks = { ...state.probePeaks };

  // Calcula correntes e potências para cada componente
  components.forEach(comp => {
    const getTermNode = (tId: string) => terminalToNode[getTerminalKey(comp.id, tId)];

    let voltage = 0;
    let current = 0;

    if (comp.type === 'resistor' || comp.type === 'ldr' || comp.type === 'motor_dc') {
      const n1 = getTermNode('t1');
      const n2 = getTermNode('t2');
      voltage = getNodeVoltage(n1) - getNodeVoltage(n2);
      
      let r: number;
      if (comp.type === 'resistor') {
        r = Math.max(Number(comp.properties.resistance?.value ?? 1000), 0.01);
      } else if (comp.type === 'motor_dc') {
        r = Math.max(Number(comp.properties.resistance?.value ?? 10), 0.01);
      } else {
        const light = Number(comp.properties.light?.value ?? 50);
        r = Math.max(0.1, 1000000 / (1 + light * 10.0));
      }
      current = voltage / r;
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'relay') {
      const nC1 = getTermNode('coil1');
      const nC2 = getTermNode('coil2');
      voltage = getNodeVoltage(nC1) - getNodeVoltage(nC2);
      
      const rCoil = Math.max(Number(comp.properties.coilResistance?.value ?? 100), 1);
      current = voltage / rCoil;
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'source_dc' || comp.type === 'source_ac' || comp.type === 'source_pulse' || comp.type === 'function_generator') {
      const nPos = getTermNode('p');
      const nNeg = getTermNode('n');
      voltage = getNodeVoltage(nPos) - getNodeVoltage(nNeg);
      
      // Encontra a corrente resolvida no ramo MNA
      const srcIdx = activeVoltageSources.findIndex(s => s.compId === comp.id);
      if (srcIdx !== -1) {
        // O valor do vetor de soluções no índice de corrente é a corrente entrando no polo positivo da fonte
        // Portanto, a corrente fornecida pela fonte é o negativo desse valor
        current = -solutionVec[numNodes + srcIdx];
      }
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'source_current') {
      const nPos = getTermNode('p');
      const nNeg = getTermNode('n');
      voltage = getNodeVoltage(nPos) - getNodeVoltage(nNeg);
      current = Number(comp.properties.current?.value ?? 0.01);
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'capacitor' || comp.type === 'capacitor_ceramic' || comp.type === 'capacitor_polyester') {
      const c = Number(comp.properties.capacitance?.value ?? 1e-6);
      const n1 = getTermNode('t1');
      const n2 = getTermNode('t2');
      const v1 = getNodeVoltage(n1);
      const v2 = getNodeVoltage(n2);
      
      const vCap = v1 - v2;
      const gEq = (2 * c) / dt;
      const vPrev = state.capacitorVoltages[comp.id] ?? 0;
      const iPrev = state.capacitorCurrents[comp.id] ?? 0;
      const iEq = -gEq * vPrev - iPrev;

      voltage = vCap;
      current = gEq * vCap + iEq; // i = gEq * v + iEq
      
      branchCurrents[comp.id] = current;
      nextCapacitorVoltages[comp.id] = voltage;
      nextCapacitorCurrents[comp.id] = current;
    } else if (comp.type === 'inductor') {
      const l = Number(comp.properties.inductance?.value ?? 1e-3);
      const n1 = getTermNode('t1');
      const n2 = getTermNode('t2');
      const v1 = getNodeVoltage(n1);
      const v2 = getNodeVoltage(n2);

      const vInd = v1 - v2;
      const gEq = dt / (2 * l);
      const vPrev = state.inductorVoltages[comp.id] ?? 0;
      const iPrev = state.inductorCurrents[comp.id] ?? 0;
      const iEq = iPrev + gEq * vPrev;

      voltage = vInd;
      current = gEq * vInd + iEq; // i = gEq * v + iEq

      branchCurrents[comp.id] = current;
      nextInductorVoltages[comp.id] = voltage;
      nextInductorCurrents[comp.id] = current;
    } else if (comp.type === 'switch') {
      const n1 = getTermNode('t1');
      const n2 = getTermNode('t2');
      voltage = getNodeVoltage(n1) - getNodeVoltage(n2);
      
      const isOpen = !(comp.properties.state?.value ?? false);
      if (isOpen) {
        current = 0;
      } else {
        // Encontra a chave na lista de extraRestr
        const restrIdx = switches.filter(sw => !sw.isOpen).findIndex(sw => sw.compId === comp.id);
        if (restrIdx !== -1) {
          const restrMnaIdx = numNodes + activeVoltageSources.length + restrIdx;
          current = solutionVec[restrMnaIdx];
        }
      }
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'diodo' || comp.type === 'led' || comp.type === 'zener') {
      const nAnode = getTermNode('a');
      const nCathode = getTermNode('c');
      voltage = getNodeVoltage(nAnode) - getNodeVoltage(nCathode);

      if (diodeConducting[comp.id]) {
        // Encontra o diodo na lista de extraRestr
        const activeSwCount = switches.filter(sw => !sw.isOpen).length;
        const diodeIdx = diodes.filter(d => diodeConducting[d.compId]).findIndex(d => d.compId === comp.id);
        if (diodeIdx !== -1) {
          const restrMnaIdx = numNodes + activeVoltageSources.length + activeSwCount + diodeIdx;
          current = solutionVec[restrMnaIdx];
        }
      } else {
        current = 0;
      }
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'transistor_bjt_npn' || comp.type === 'transistor_bjt_pnp') {
      const nC = getTermNode('c');
      const nE = getTermNode('e');
      voltage = getNodeVoltage(nC) - getNodeVoltage(nE); // V_CE
      
      // I_C can be extracted from the MNA if saturation, or from beta*I_B if active
      const bState = bjtState[comp.id];
      if (bState === 'cutoff') {
        current = 0;
      } else {
        // Find in extraRestr
        if (bState === 'active') {
          const typeStr = comp.type === 'transistor_bjt_npn' ? 'bjt_be' : 'bjt_eb';
          const rIdx = lastExtraRestrictions.findIndex(r => r.compId === comp.id && r.type === typeStr);
          if (rIdx !== -1) {
            const iB = solutionVec[numNodes + activeVoltageSources.length + rIdx];
            current = (Number(comp.properties.beta?.value ?? 100)) * iB; // I_C
          }
        } else { // saturation
          const typeStr = comp.type === 'transistor_bjt_npn' ? 'bjt_ce_sat' : 'bjt_ec_sat';
          const rIdx = lastExtraRestrictions.findIndex(r => r.compId === comp.id + (comp.type === 'transistor_bjt_npn' ? '_ce' : '_ec') && r.type === typeStr);
          if (rIdx !== -1) {
            current = solutionVec[numNodes + activeVoltageSources.length + rIdx]; // I_C
          }
        }
      }
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'ammeter') {
      voltage = 0; // ideal
      const srcIdx = activeVoltageSources.findIndex(s => s.compId === comp.id);
      if (srcIdx !== -1) {
        current = solutionVec[numNodes + srcIdx];
      }
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'voltmeter') {
      const nPos = getTermNode('p');
      const nNeg = getTermNode('n');
      voltage = getNodeVoltage(nPos) - getNodeVoltage(nNeg);
      current = 0; // Ideal (alta impedância)
      branchCurrents[comp.id] = current;
    } else if (comp.type === 'oscilloscope') {
      const nCh1 = getTermNode('ch1');
      const nG1 = getTermNode('g1');
      const nCh2 = getTermNode('ch2');
      const nG2 = getTermNode('g2');
      voltage = getNodeVoltage(nCh1) - getNodeVoltage(nG1);
      current = 0; // Ideal (alta impedância)
      branchCurrents[comp.id] = current;
      componentStates[comp.id] = {
        voltage,
        current,
        power: 0,
        custom: {
          ch1Voltage: voltage,
          ch2Voltage: getNodeVoltage(nCh2) - getNodeVoltage(nG2)
        }
      };
      return;
    } else if (comp.type === 'ground') {
      voltage = 0;
      current = 0;
    } else if (comp.type === 'junction') {
      const nJ = terminalToNode[getTerminalKey(comp.id, 'j1')];
      voltage = getNodeVoltage(nJ);
      current = 0;
    } else if (comp.type === 'probe_dc' || comp.type === 'probe_ac') {
      const nP = getTermNode('p');
      voltage = getNodeVoltage(nP);
      current = 0;
      if (comp.type === 'probe_ac') {
        const prevPeak = state.probePeaks?.[comp.id] ?? 0;
        const currentAbs = Math.abs(voltage);
        const nextPeak = Math.max(prevPeak * 0.998, currentAbs);
        nextProbePeaks[comp.id] = nextPeak;
      }
    }

    let isBurned = false;
    let burnMessage = '';

    // Verifica sobrecarga (queima do componente)
    if (comp.type === 'led' || comp.type === 'diodo' || comp.type === 'zener') {
      if (Math.abs(current) > 0.1) { // Mais de 100mA num LED/Diodo queima
        isBurned = true;
        burnMessage = 'Corrente excessiva!';
      }
    } else if (comp.type === 'resistor' || comp.type === 'pot') {
      const p = Math.abs(voltage * current);
      if (p > 1.0) { // Mais de 1 Watt num resistor comum
        isBurned = true;
        burnMessage = 'Sobrecarga de potência!';
      }
    } else if (comp.type === 'source_dc') {
      if (Math.abs(current) > 5.0) { // Bateria em curto-circuito (>5A)
        isBurned = true;
        burnMessage = 'Curto-circuito!';
      }
    }

    const acPeak = comp.type === 'probe_ac' ? (nextProbePeaks[comp.id] ?? Math.abs(voltage)) : undefined;

    componentStates[comp.id] = {
      voltage,
      current,
      power: Math.abs(voltage * current),
      isBurned,
      burnMessage,
      custom: comp.type === 'probe_ac' ? { vPeak: acPeak, vRms: (acPeak ?? 0) / Math.SQRT2 } : undefined
    };
  });

  const estimateWireCurrents = () => {
    const terminalInjection: Record<string, number> = {};
    const addInjection = (compId: string, termId: string, currentValue: number) => {
      const key = getTerminalKey(compId, termId);
      terminalInjection[key] = (terminalInjection[key] ?? 0) + currentValue;
    };
    const addTwoTerminalLoad = (comp: CircuitComponent, t1: string, t2: string) => {
      const i = componentStates[comp.id]?.current ?? 0;
      addInjection(comp.id, t1, -i);
      addInjection(comp.id, t2, i);
    };
    const addTwoTerminalSource = (comp: CircuitComponent, p: string, n: string) => {
      const i = componentStates[comp.id]?.current ?? 0;
      addInjection(comp.id, p, i);
      addInjection(comp.id, n, -i);
    };

    components.forEach(comp => {
      if (comp.type === 'source_dc' || comp.type === 'source_ac' || comp.type === 'source_pulse' || comp.type === 'function_generator') {
        addTwoTerminalSource(comp, 'p', 'n');
      } else if (comp.type === 'source_current') {
        addTwoTerminalLoad(comp, 'p', 'n');
      } else if (
        comp.type === 'resistor' ||
        comp.type === 'ldr' ||
        comp.type === 'motor_dc' ||
        comp.type === 'capacitor' ||
        comp.type === 'capacitor_ceramic' ||
        comp.type === 'capacitor_polyester' ||
        comp.type === 'inductor' ||
        comp.type === 'switch'
      ) {
        addTwoTerminalLoad(comp, 't1', 't2');
      } else if (comp.type === 'relay') {
        addTwoTerminalLoad(comp, 'coil1', 'coil2');
      } else if (comp.type === 'diodo' || comp.type === 'led' || comp.type === 'zener') {
        addTwoTerminalLoad(comp, 'a', 'c');
      } else if (comp.type === 'ammeter') {
        addTwoTerminalLoad(comp, 'p', 'n');
      } else if (comp.type === 'transistor_bjt_npn' || comp.type === 'transistor_bjt_pnp') {
        const i = componentStates[comp.id]?.current ?? 0;
        addInjection(comp.id, 'c', -i);
        addInjection(comp.id, 'e', i);
      }
    });

    const adjacency: Record<string, { to: string; wireId: string; direction: 1 | -1 }[]> = {};
    const result: Record<string, number> = {};
    const addEdge = (from: string, to: string, wireId: string, direction: 1 | -1) => {
      if (!adjacency[from]) adjacency[from] = [];
      adjacency[from].push({ to, wireId, direction });
    };

    wires.forEach(wire => {
      const fromKey = getTerminalKey(wire.from.componentId, wire.from.terminalId);
      const toKey = getTerminalKey(wire.to.componentId, wire.to.terminalId);
      result[wire.id] = 0;
      addEdge(fromKey, toKey, wire.id, 1);
      addEdge(toKey, fromKey, wire.id, -1);
    });

    const visited = new Set<string>();
    const solveSubtree = (vertex: string, parentWireId: string | null): number => {
      visited.add(vertex);
      let subtreeInjection = terminalInjection[vertex] ?? 0;

      for (const edge of adjacency[vertex] ?? []) {
        if (edge.wireId === parentWireId) continue;
        if (visited.has(edge.to)) continue;

        const childInjection = solveSubtree(edge.to, edge.wireId);
        const currentFromVertexToChild = -childInjection;
        result[edge.wireId] = edge.direction * currentFromVertexToChild;
        subtreeInjection += childInjection;
      }

      return subtreeInjection;
    };

    Object.keys(adjacency).forEach(vertex => {
      if (!visited.has(vertex)) {
        solveSubtree(vertex, null);
      }
    });

    return result;
  };

  const wireCurrents = estimateWireCurrents();

  return {
    result: {
      nodeVoltages,
      branchCurrents,
      wireCurrents,
      componentStates
    },
    nextState: {
      capacitorVoltages: nextCapacitorVoltages,
      capacitorCurrents: nextCapacitorCurrents,
      inductorVoltages: nextInductorVoltages,
      inductorCurrents: nextInductorCurrents,
      probePeaks: nextProbePeaks,
      time: state.time + dt,
      nodeVoltages
    }
  };
}
