import type { CircuitComponent, CircuitWire, Viewport } from '../../types/circuit';
import { useStore } from '../../state/useStore';

// Grid size padrão
export const GRID_SIZE = 20;

// Paleta de Cores HSL Premium (Estilo Proteus ISIS)
const COLORS = {
  light: {
    grid: '#c6c4b2', // Grid mais escuro que o fundo
    wireBase: '#166534', // Fio inativo Verde Escuro
    wireVoltPos: '#dc2626', // Fio positivo Vermelho
    wireVoltNeg: '#2563eb', // Fio negativo Azul
    wireVoltNeutral: '#166534', // Mantém verde neutro
    electron: '#22c55e', // Elétron (fluxo de corrente em verde brilhante)
    component: '#7f1d1d', // Componentes em vermelho escuro/bordô
    selected: '#6366f1', // Seleção (azul)
    text: '#111827', // Texto Quase Preto
    terminal: '#ef4444', 
    bg: '#e0ddc9' // Fundo clássico bege/caqui
  },
  dark: { // Tema escuro mantém uma estética noturna moderna mas respeitando cores
    grid: '#1e293b',
    wireBase: '#16a34a', // Verde mais claro
    wireVoltPos: '#ef4444', 
    wireVoltNeg: '#3b82f6', 
    wireVoltNeutral: '#16a34a',
    electron: '#4ade80', // Fluxo de corrente em verde brilhante no tema escuro
    component: '#fca5a5', // Componentes avermelhados
    selected: '#818cf8', 
    text: '#f1f5f9',
    terminal: '#f87171',
    bg: '#0f172a'
  }
};

// Retorna a cor do fio correspondente à tensão
function getVoltageColor(voltage: number, theme: 'light' | 'dark'): string {
  const colors = COLORS[theme];
  if (voltage > 0.1) {
    // Interpolação simples de verde
    return colors.wireVoltPos;
  } else if (voltage < -0.1) {
    // Interpolação simples de azul
    return colors.wireVoltNeg;
  }
  return colors.wireVoltNeutral;
}

function getLedColor(colorValue: unknown): string {
  const color = String(colorValue || 'red');
  const colors: Record<string, string> = {
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
    yellow: '#eab308',
    orange: '#f97316',
    white: '#f8fafc'
  };
  return colors[color] || colors.red;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Desenha elétrons correndo no fio
function drawElectrons(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  current: number,
  animationTime: number,
  theme: 'light' | 'dark'
) {
  if (Math.abs(current) < 1e-6) return; // Corrente insignificante

  const colors = COLORS[theme];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) return;

  const ux = dx / length;
  const uy = dy / length;

  // Velocidade proporcional à corrente (com limitadores)
  const baseSpeed = 30; // Pixels por segundo (velocidade base reduzida)
  const currentFactor = Math.min(Math.abs(current) * 10, 3); // Limita velocidade máxima
  const speed = baseSpeed * currentFactor * (current < 0 ? -1 : 1);
  
  const electronSpacing = 15; // pixels entre elétrons
  const offset = (animationTime * speed) % electronSpacing;

  ctx.save();
  ctx.fillStyle = colors.electron;
  ctx.shadowColor = colors.electron;
  ctx.shadowBlur = theme === 'dark' ? 6 : 2;

  // Desenha os pontos dos elétrons ao longo do segmento
  let dist = offset < 0 ? offset + electronSpacing : offset;
  while (dist < length) {
    const ex = x1 + ux * dist;
    const ey = y1 + uy * dist;
    ctx.beginPath();
    ctx.arc(ex, ey, 2, 0, 2 * Math.PI);
    ctx.fill();
    dist += electronSpacing;
  }
  ctx.restore();
}

// Renderizador dos Componentes
export function drawComponent(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  theme: 'light' | 'dark',
  isSelected: boolean
) {
  const colors = COLORS[theme];
  const cx = comp.x * GRID_SIZE;
  const cy = comp.y * GRID_SIZE;
  const rotation = comp.rotation;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  // Aplica escala negativa para espelhamento estilo Proteus
  ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);

  // Define estilos de desenho
  ctx.strokeStyle = isSelected ? colors.selected : colors.component;
  ctx.lineWidth = isSelected ? 2.5 : 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'transparent';

  // Brilho neon sutil no modo escuro
  if (theme === 'dark') {
    ctx.shadowColor = isSelected ? colors.selected : colors.component;
    ctx.shadowBlur = isSelected ? 8 : 2;
  }

  // Desenha o símbolo de acordo com o tipo de componente
  switch (comp.type) {
    case 'junction': {
      // Conta quantos fios conectam a essa junção
      const wires = useStore.getState().wires;
      const wireCount = wires.filter(w => 
        w.from.componentId === comp.id || w.to.componentId === comp.id
      ).length;

      // Se for apenas uma dobra intermediária (1 ou 2 conexões), fica invisível
      if (wireCount <= 2) {
        break;
      }

      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, 2 * Math.PI);
      const voltage = comp.simulationState?.voltage ?? 0;
      const isSimulating = useStore.getState().isSimulating;
      
      ctx.fillStyle = isSelected 
        ? colors.selected 
        : (isSimulating ? getVoltageColor(voltage, theme) : colors.wireBase);
      ctx.fill();
      break;
    }

    case 'ground': {
      // Entrada e traços do terra
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(0, 0); // Fio de entrada
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10); // Barra vertical
      ctx.moveTo(4, -6);
      ctx.lineTo(4, 6);  // Barra do meio
      ctx.moveTo(8, -2);
      ctx.lineTo(8, 2);  // Barra final
      ctx.stroke();
      break;
    }

    case 'resistor': {
      // Resistor Estilo Proteus (Caixa Retangular)
      ctx.beginPath();
      // Conexões laterais
      ctx.moveTo(-40, 0);
      ctx.lineTo(-20, 0);
      ctx.moveTo(20, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();
      
      // Corpo retângulo
      ctx.beginPath();
      ctx.rect(-20, -8, 40, 16);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      // Label do valor e Referência
      const rVal = comp.properties.resistance?.value ?? 1000;
      let labelText = `${rVal}Ω`;
      if (Number(rVal) >= 1e6) labelText = `${(Number(rVal) / 1e6).toFixed(1)}M`;
      else if (Number(rVal) >= 1e3) labelText = `${(Number(rVal) / 1e3).toFixed(1)}k`;

      // Desenha texto sem espelhamento
      ctx.save();
      ctx.translate(0, 18);
      // Mantém texto na vertical se rotacionado
      if (rotation === 90 || rotation === 270) {
        ctx.rotate(-Math.PI / 2);
      }
      ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);
      ctx.fillStyle = colors.text;
      ctx.font = '10px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, 0, 0);
      ctx.restore();
      break;
    }

    case 'bench_supply':
    case 'source_dc': {
      // Bateria / Fonte DC (Traços paralelos)
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-10, 0);
      ctx.moveTo(10, 0);
      ctx.lineTo(40, 0);
      
      // Placa positiva (+) maior, fina
      ctx.moveTo(-10, -15);
      ctx.lineTo(-10, 15);
      // Placa negativa (-) menor, grossa
      ctx.lineWidth = (isSelected ? 2.5 : 2) * 2;
      ctx.moveTo(10, -8);
      ctx.lineTo(10, 8);
      ctx.stroke();

      // Sinais de polaridade (+ e -)
      ctx.lineWidth = isSelected ? 2.5 : 2;
      ctx.fillStyle = colors.text;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+', -18, -12);
      ctx.fillText('-', 18, -8);

      // Label da tensão (texto sem espelhamento)
      const vVal = comp.properties.voltage?.value ?? 5;
      const currentLimit = comp.properties.currentLimit?.value ?? 1;
      ctx.save();
      ctx.translate(0, 24);
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      // No scaling for voltage label to prevent mirroring
      ctx.font = '10px font-mono';
      ctx.fillText(comp.type === 'bench_supply' ? `${vVal}V ${currentLimit}A` : `${vVal}V`, 0, 0);
      if (comp.type === 'bench_supply') {
        ctx.fillText('PSU', 0, -32);
      }
      ctx.restore();
      break;
    }

    case 'source_ac':
    case 'source_pulse': {
      // Conexões de fios externas
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-18, 0);
      ctx.moveTo(18, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Círculo preenchido
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, 2 * Math.PI);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      if (comp.type === 'source_ac') {
        // Desenha senoide dentro
        ctx.moveTo(-10, 0);
        ctx.bezierCurveTo(-5, -10, -5, -10, 0, 0);
        ctx.bezierCurveTo(5, 10, 5, 10, 10, 0);
      } else {
        // Desenha pulso quadrado dentro
        ctx.moveTo(-10, 5);
        ctx.lineTo(-10, -5);
        ctx.lineTo(0, -5);
        ctx.lineTo(0, 5);
        ctx.lineTo(10, 5);
      }
      ctx.stroke();

      // Label
      const fVal = comp.properties.frequency?.value ?? 60;
      ctx.save();
      ctx.translate(0, 28);
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);
      ctx.fillStyle = colors.text;
      ctx.font = '9px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText(`${fVal}Hz`, 0, 0);
      ctx.restore();
      break;
    }

    case 'function_generator': {
      // Conexões de fios externas
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-24, 0);
      ctx.moveTo(24, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Corpo retangular do gerador de funções
      ctx.beginPath();
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(-24, -18, 48, 36, 6);
      } else {
        ctx.rect(-24, -18, 48, 36);
      }
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6366f1';
      ctx.stroke();

      // Mini Tela Digital no Gerador
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-18, -14, 36, 11);

      // Desenha a forma de onda ativa dentro do display
      const waveform = String(comp.properties.waveform?.value ?? 'sine');
      ctx.beginPath();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;

      if (waveform === 'square') {
        ctx.moveTo(-12, -8);
        ctx.lineTo(-12, -13);
        ctx.lineTo(-2, -13);
        ctx.lineTo(-2, -8);
        ctx.lineTo(8, -8);
        ctx.lineTo(8, -13);
        ctx.lineTo(12, -13);
      } else if (waveform === 'triangle') {
        ctx.moveTo(-14, -8);
        ctx.lineTo(-7, -13);
        ctx.lineTo(0, -8);
        ctx.lineTo(7, -13);
        ctx.lineTo(14, -8);
      } else if (waveform === 'sawtooth') {
        ctx.moveTo(-14, -8);
        ctx.lineTo(-2, -13);
        ctx.lineTo(-2, -8);
        ctx.lineTo(10, -13);
        ctx.lineTo(10, -8);
      } else {
        // sine
        ctx.moveTo(-14, -10);
        ctx.bezierCurveTo(-7, -15, -7, -15, 0, -10);
        ctx.bezierCurveTo(7, -5, 7, -5, 14, -10);
      }
      ctx.stroke();

      // Rótulo do painel "GEN"
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 9px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText('GEN', 0, 10);

      // Texto de Frequência e Amplitude abaixo
      const fgVal = Number(comp.properties.frequency?.value ?? 1000);
      const vgVal = Number(comp.properties.amplitude?.value ?? 5);
      const fStr = fgVal >= 1000 ? `${(fgVal / 1000).toFixed(1)}kHz` : `${fgVal}Hz`;
      
      ctx.save();
      ctx.translate(0, 28);
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);
      ctx.fillStyle = colors.text;
      ctx.font = '9px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText(`${fStr} | ${vgVal}V`, 0, 0);
      ctx.restore();
      break;
    }

    case 'source_current': {
      // Conexões externas
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-18, 0);
      ctx.moveTo(18, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Círculo preenchido
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, 2 * Math.PI);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();
      
      // Seta de direção da corrente (apontando da esquerda para direita)
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.lineTo(4, -5);
      ctx.moveTo(10, 0);
      ctx.lineTo(4, 5);
      ctx.stroke();

      const iVal = comp.properties.current?.value ?? 0.01;
      ctx.save();
      ctx.translate(0, 28);
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = colors.text;
      ctx.font = '9px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText(`${Number(iVal)*1000}mA`, 0, 0);
      ctx.restore();
      break;
    }

    case 'capacitor':
    case 'capacitor_ceramic':
    case 'capacitor_polyester': {
      // Duas placas paralelas separadas
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-6, 0);
      ctx.moveTo(6, 0);
      ctx.lineTo(40, 0);
      
      if (comp.type === 'capacitor') {
        // Eletrolítico: placa positiva reta, negativa curva
        // Positiva (T1)
        ctx.moveTo(-6, -14);
        ctx.lineTo(-6, 14);
        // Negativa (T2)
        ctx.moveTo(6, -14);
        ctx.quadraticCurveTo(12, 0, 6, 14);
        
        // Sinal +
        ctx.moveTo(-20, -10);
        ctx.lineTo(-14, -10);
        ctx.moveTo(-17, -13);
        ctx.lineTo(-17, -7);
      } else {
        // Cerâmico/Poliéster: Placas retas
        ctx.moveTo(-6, -14);
        ctx.lineTo(-6, 14);
        ctx.moveTo(6, -14);
        ctx.lineTo(6, 14);
      }
      ctx.stroke();

      // Label do valor (texto sem espelhamento)
      const cVal = comp.properties.capacitance?.value ?? 1e-6;
      let labelText = `${Number(cVal)*1e6}μF`;
      if (Number(cVal) < 1e-6) labelText = `${Number(cVal)*1e9}nF`;
      if (Number(cVal) < 1e-9) labelText = `${Number(cVal)*1e12}pF`;

      ctx.save();
      ctx.translate(0, 24);
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);
      ctx.fillStyle = colors.text;
      ctx.font = '9px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, 0, 0);
      ctx.restore();
      break;
    }

    case 'transistor_bjt_npn':
    case 'transistor_bjt_pnp': {
      const isNpn = comp.type === 'transistor_bjt_npn';

      // Terminal e Haste da Base (Esquerda)
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-10, 0);
      ctx.stroke();

      // Placa Condutora da Base (Barra Vertical)
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(-10, 18);
      ctx.stroke();
      ctx.lineWidth = isSelected ? 2.5 : 1.8;

      // Terminal Coletor (Cima - Topo)
      ctx.beginPath();
      ctx.moveTo(20, -40);
      ctx.lineTo(20, -22);
      ctx.lineTo(-10, -10); // Haste diagonal do coletor
      ctx.stroke();

      // Terminal Emissor (Baixo - Inferior)
      ctx.beginPath();
      ctx.moveTo(20, 40);
      ctx.lineTo(20, 22);
      ctx.lineTo(-10, 10); // Haste diagonal do emissor
      ctx.stroke();

      // Círculo envolvente do encapsulamento BJT (Estilo Proteus / TO-92)
      ctx.beginPath();
      ctx.arc(4, 0, 24, 0, 2 * Math.PI);
      ctx.strokeStyle = isSelected ? colors.selected : (theme === 'dark' ? '#334155' : '#cbd5e1');
      ctx.lineWidth = 1;
      ctx.stroke();

      // Restaura cor principal para a seta
      ctx.strokeStyle = isSelected ? colors.selected : colors.component;
      ctx.fillStyle = isSelected ? colors.selected : colors.component;

      // Seta do Emissor (Indica NPN vs PNP)
      ctx.beginPath();
      if (isNpn) {
        // NPN (Not Pointing iN): Seta no Emissor apontando para FORA (em direção ao pino E)
        ctx.moveTo(13, 21.5);
        ctx.lineTo(3.2, 21.1);
        ctx.lineTo(6.8, 13.9);
        ctx.closePath();
        ctx.fill();
      } else {
        // PNP (Pointing iN Protection): Seta no Emissor apontando para DENTRO (em direção à Base)
        ctx.moveTo(-3.1, 13.5);
        ctx.lineTo(6.8, 13.9);
        ctx.lineTo(3.2, 21.1);
        ctx.closePath();
        ctx.fill();
      }

      // Labels dos pinos (B, C, E) estilo ISIS Proteus
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('C', 26, -30);
      ctx.fillText('B', -24, -6);
      ctx.fillText('E', 26, 32);

      // Nome/Identificação do Transistor e Beta (hFE)
      const beta = comp.properties.beta?.value ?? 100;
      ctx.font = '9px font-mono';
      ctx.textAlign = 'left';
      ctx.fillText(isNpn ? 'NPN' : 'PNP', 32, -4);
      ctx.fillStyle = colors.text;
      ctx.font = '8px font-mono';
      ctx.fillText(`β:${beta}`, 32, 8);
      break;
    }
    case 'inductor': {
      // Indutor (Bobina)
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-24, 0);
      ctx.moveTo(24, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      ctx.beginPath();
      // Desenha espiras da bobina (4 arcos interligados)
      ctx.arc(-18, 0, 6, Math.PI, 0, false);
      ctx.arc(-6, 0, 6, Math.PI, 0, false);
      ctx.arc(6, 0, 6, Math.PI, 0, false);
      ctx.arc(18, 0, 6, Math.PI, 0, false);
      ctx.stroke();

      // Label (texto sem espelhamento)
      const lVal = comp.properties.inductance?.value ?? 1e-3;
      let labelText = `${Number(lVal)*1e3}mH`;
      if (Number(lVal) < 1e-3) labelText = `${Number(lVal)*1e6}μH`;
      ctx.save();
      ctx.translate(0, 18);
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);
      ctx.fillStyle = colors.text;
      ctx.font = '9px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, 0, 0);
      ctx.restore();
      break;
    }

    case 'switch': {
      // Interruptor
      const isOpen = !(comp.properties.state?.value ?? false);
      
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-16, 0); // Ponto de entrada
      ctx.moveTo(16, 0);
      ctx.lineTo(40, 0);  // Ponto de saída
      ctx.stroke();

      // Desenha pontinhos nos bornes
      ctx.fillStyle = isSelected ? colors.selected : colors.component;
      ctx.beginPath();
      ctx.arc(-16, 0, 3, 0, 2 * Math.PI);
      ctx.arc(16, 0, 3, 0, 2 * Math.PI);
      ctx.fill();

      // Desenha a haste
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      if (isOpen) {
        // Haste aberta diagonalmente
        ctx.lineTo(12, -18);
      } else {
        // Haste fechada
        ctx.lineTo(16, 0);
      }
      ctx.stroke();
      break;
    }

    case 'motor_dc': {
      // Motor DC
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-16, 0);
      ctx.moveTo(16, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Círculo Central
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, 2 * Math.PI);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      // Letra M (texto sem espelhamento)
      ctx.save();
      ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('M', 0, 0);
      ctx.restore();

      // Animação de Rotação (se corrente for > 0)
      const current = comp.simulationState?.current || 0;
      if (Math.abs(current) > 0.01) {
        ctx.save();
        const speed = current * 3;
        const time = Date.now() / 1000;
        const angle = time * speed;
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.strokeStyle = colors.wireVoltPos;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.arc(0, 0, 12, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    case 'relay': {
      // Base Relé SPDT
      const triggerVoltage = Number(comp.properties.triggerVoltage?.value ?? 5);
      const isActive = Boolean(comp.simulationState?.voltage && Math.abs(comp.simulationState.voltage) > triggerVoltage / 2);
      
      // Contorno
      ctx.beginPath();
      ctx.rect(-24, -48, 48, 96);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();
      ctx.stroke();

      // Conexões e Bornes da Bobina (Esquerda)
      ctx.beginPath();
      ctx.moveTo(-40, -20);
      ctx.lineTo(-24, -20);
      ctx.moveTo(-40, 20);
      ctx.lineTo(-24, 20);
      ctx.stroke();
      
      // Bobina Interna (Quadrado + Linha Zigue-Zague)
      ctx.beginPath();
      ctx.rect(-20, -16, 12, 32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, -16);
      ctx.lineTo(-14, 16);
      ctx.stroke();

      // Conexões do Chaveamento (Direita)
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(40, 0); // COM
      ctx.moveTo(24, -40);
      ctx.lineTo(40, -40); // NC
      ctx.moveTo(24, 40);
      ctx.lineTo(40, 40); // NO
      ctx.stroke();

      // Pontos de Conexão Internos
      ctx.fillStyle = colors.component;
      ctx.beginPath();
      ctx.arc(24, 0, 2, 0, Math.PI * 2); // COM Ponto
      ctx.arc(24, -40, 2, 0, Math.PI * 2); // NC Ponto
      ctx.arc(24, 40, 2, 0, Math.PI * 2); // NO Ponto
      ctx.fill();

      // Haste de Chaveamento
      ctx.beginPath();
      ctx.moveTo(24, 0); // Sai do COM
      if (isActive) {
        ctx.lineTo(24, 40); // Liga no NO
      } else {
        ctx.lineTo(24, -40); // Liga no NC
      }
      ctx.strokeStyle = isActive ? colors.wireVoltPos : colors.component;
      ctx.stroke();

      // Labels internos
      ctx.save();
      ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);
      ctx.fillStyle = colors.text;
      ctx.font = '7px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('COM', 22, -3);
      ctx.fillText('NC', 22, -43);
      ctx.fillText('NO', 22, 37);
      ctx.textAlign = 'left';
      ctx.fillText('C1', -22, -23);
      ctx.fillText('C2', -22, 17);
      ctx.restore();
      break;
    }

    case 'zener':
    case 'diodo':
    case 'led': {
      // Triângulo apontando para cathode
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-12, 0);
      ctx.moveTo(12, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Corpo do diodo
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.lineTo(12, 0);
      ctx.lineTo(-12, 12);
      ctx.closePath();
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      // Linha de barreira do diodo (com abas Z se for Zener)
      ctx.beginPath();
      if (comp.type === 'zener') {
        ctx.moveTo(8, -15);
        ctx.lineTo(12, -12);
        ctx.lineTo(12, 12);
        ctx.lineTo(16, 15);
      } else {
        ctx.moveTo(12, -12);
        ctx.lineTo(12, 12);
      }
      ctx.stroke();

      if (comp.type === 'led') {
        const ledColor = getLedColor(comp.properties.color?.value);
        const iVal = comp.simulationState?.current ?? 0;
        const isLit = iVal > 0.001;

        if (isLit) {
          const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 32);
          glow.addColorStop(0, hexToRgba(ledColor, 0.38));
          glow.addColorStop(0.55, hexToRgba(ledColor, 0.18));
          glow.addColorStop(1, hexToRgba(ledColor, 0));
          ctx.save();
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(0, 0, 34, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore();
        }

        // Desenha duas setas de brilho saindo
        ctx.save();
        ctx.strokeStyle = isLit ? ledColor : colors.component;
        ctx.lineWidth = isLit ? 2.4 : 2;
        ctx.shadowColor = ledColor;
        ctx.shadowBlur = isLit ? 10 : 0;
        ctx.beginPath();
        // Seta 1
        ctx.moveTo(0, -14);
        ctx.lineTo(10, -22);
        ctx.moveTo(10, -22);
        ctx.lineTo(4, -20);
        ctx.moveTo(10, -22);
        ctx.lineTo(8, -16);
        
        // Seta 2
        ctx.moveTo(8, -10);
        ctx.lineTo(18, -18);
        ctx.moveTo(18, -18);
        ctx.lineTo(12, -16);
        ctx.moveTo(18, -18);
        ctx.lineTo(16, -12);
        ctx.stroke();
        ctx.restore();
      }

      if (comp.type === 'zener') {
        const vz = Number(comp.properties.zenerVoltage?.value ?? 5.1);
        ctx.save();
        ctx.fillStyle = colors.text;
        ctx.font = '7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Number.isFinite(vz) ? vz : 5.1}V`, 0, 28);
        ctx.restore();
      }
      break;
    }

    case 'oscilloscope': {
      ctx.save();

      // Bornes externos
      ctx.beginPath();
      ctx.moveTo(-60, -20);
      ctx.lineTo(-34, -20);
      ctx.moveTo(-60, 20);
      ctx.lineTo(-34, 20);
      ctx.moveTo(60, -20);
      ctx.lineTo(34, -20);
      ctx.moveTo(60, 20);
      ctx.lineTo(34, 20);
      ctx.stroke();

      // Corpo
      ctx.beginPath();
      ctx.roundRect(-34, -32, 68, 64, 5);
      ctx.fillStyle = theme === 'dark' ? '#111827' : '#e2e8f0';
      ctx.fill();
      ctx.strokeStyle = isSelected ? colors.selected : '#475569';
      ctx.stroke();

      // Tela
      ctx.beginPath();
      ctx.roundRect(-26, -23, 42, 34, 3);
      ctx.fillStyle = '#020617';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Grade da tela
      ctx.strokeStyle = '#164e63';
      ctx.lineWidth = 0.6;
      for (let x = -20; x <= 10; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, -21);
        ctx.lineTo(x, 9);
        ctx.stroke();
      }
      for (let y = -18; y <= 6; y += 8) {
        ctx.beginPath();
        ctx.moveTo(-24, y);
        ctx.lineTo(14, y);
        ctx.stroke();
      }

      // Ondas CH1 / CH2
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      for (let i = 0; i <= 36; i++) {
        const x = -24 + i;
        const y = -7 + Math.sin(i / 4) * 5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#22c55e';
      ctx.beginPath();
      for (let i = 0; i <= 36; i++) {
        const x = -24 + i;
        const y = -16 + Math.cos(i / 5) * 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Controles
      ctx.fillStyle = theme === 'dark' ? '#334155' : '#94a3b8';
      [[23, -16], [23, -4], [23, 8], [23, 20]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Labels dos bornes
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CH1', -48, -25);
      ctx.fillText('G1', -48, 15);
      ctx.fillText('CH2', 48, -25);
      ctx.fillText('G2', 48, 15);
      ctx.fillText('OSC', -5, 25);

      ctx.restore();
      break;
    }

    case 'megohmmeter': {
      ctx.save();
      const isTesting = comp.simulationState?.custom?.isTesting ?? (comp.properties.isTesting?.value === true);
      const displayVal = comp.simulationState?.custom?.displayRes ?? (isTesting ? 'MEDINDO' : 'OFF');

      // Bornes externos
      ctx.beginPath();
      // LINE (-60, -20)
      ctx.moveTo(-60, -20);
      ctx.lineTo(-34, -20);
      // EARTH (-60, 20)
      ctx.moveTo(-60, 20);
      ctx.lineTo(-34, 20);
      // GUARD (60, 0)
      ctx.moveTo(60, 0);
      ctx.lineTo(34, 0);
      ctx.strokeStyle = colors.wireBase;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Corpo Amarelo/Laranja estilo Fluke/Megger
      ctx.beginPath();
      ctx.roundRect(-34, -32, 68, 64, 6);
      ctx.fillStyle = isSelected ? (theme === 'dark' ? '#b45309' : '#f59e0b') : (theme === 'dark' ? '#92400e' : '#d97706');
      ctx.fill();
      ctx.strokeStyle = isSelected ? colors.selected : '#78350f';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      // Faceplate interna escura
      ctx.beginPath();
      ctx.roundRect(-28, -26, 56, 52, 4);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Display LCD Retroiluminado
      ctx.beginPath();
      ctx.roundRect(-22, -21, 44, 20, 2);
      ctx.fillStyle = isTesting ? '#022c22' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = isTesting ? '#10b981' : '#475569';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Texto do LCD
      ctx.fillStyle = isTesting ? '#34d399' : '#64748b';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isTesting ? (displayVal || '--- MΩ') : 'READY', 0, -8);

      // Indicador HV LED (Vermelho quando testa)
      ctx.beginPath();
      ctx.arc(-16, 12, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isTesting ? '#ef4444' : '#475569';
      ctx.fill();
      if (isTesting) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
      }

      // Botão TEST (Vermelho/Amarelo)
      ctx.beginPath();
      ctx.arc(12, 12, 7, 0, Math.PI * 2);
      ctx.fillStyle = isTesting ? '#dc2626' : '#ea580c';
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Texto no botão TEST
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TEST', 12, 13.5);

      // Labels dos bornes
      ctx.font = 'bold 6.5px monospace';
      ctx.fillStyle = '#ef4444'; // LINE vermelho
      ctx.fillText('LINE', -46, -24);
      ctx.fillStyle = '#94a3b8'; // EARTH cinza
      ctx.fillText('EARTH', -46, 16);
      ctx.fillStyle = '#38bdf8'; // GUARD azul
      ctx.fillText('G', 46, -5);

      // Título do instrumento
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 6px sans-serif';
      ctx.fillText('MEGGER', -3, 21);

      ctx.restore();
      break;
    }

    case 'voltímetro':
    case 'ammeter':
    case 'multimeter':
    case 'voltmeter': {
      // Voltímetro e Amperímetro Animados (Visor Digital Estilo Proteus)
      // Conexões externas
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-24, 0);
      ctx.moveTo(24, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Caixa do display
      ctx.beginPath();
      ctx.rect(-24, -14, 48, 28);
      ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#d1d5db';
      ctx.fill();
      ctx.stroke();

      // Tela interior verde
      ctx.beginPath();
      ctx.rect(-20, -10, 40, 20);
      ctx.fillStyle = theme === 'dark' ? '#064e3b' : '#bbf7d0'; // Verde escuro no dark, verde claro LCD no light
      ctx.fill();
      
      // Borda interna da tela
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.component;
      ctx.stroke();
      
      // Restaura espessura normal
      ctx.lineWidth = isSelected ? 2.5 : 2;

      // Label de instrumento (V ou A)
      const meterMode = String(comp.properties.mode?.value || 'voltage');
      const isVolt = comp.type === 'voltmeter' || (comp.type === 'multimeter' && meterMode !== 'current');
      
      // Valor da medição (animado)
      ctx.save();
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = theme === 'dark' ? '#34d399' : '#166534'; // Texto verde digital
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      
      const val = isVolt ? (comp.simulationState?.voltage ?? 0) : (comp.simulationState?.current ?? 0);
      const absVal = Math.abs(val);
      let valStr = '0.00';
      let unitStr = isVolt ? 'V' : 'A';
      
      if (absVal >= 1) {
        valStr = absVal.toFixed(2);
      } else if (absVal >= 1e-3) {
        valStr = (absVal * 1e3).toFixed(1);
        unitStr = isVolt ? 'mV' : 'mA';
      } else if (absVal >= 1e-6) {
        valStr = (absVal * 1e6).toFixed(1);
        unitStr = isVolt ? 'uV' : 'uA';
      } else if (absVal >= 1e-9) {
        valStr = (absVal * 1e9).toFixed(1);
        unitStr = isVolt ? 'nV' : 'nA';
      } else if (absVal >= 1e-12) {
        valStr = (absVal * 1e12).toFixed(1);
        unitStr = isVolt ? 'pV' : 'pA';
      }
      
      const sign = val < -1e-6 ? '-' : (val > 1e-6 ? '+' : ' ');
      if (comp.type === 'multimeter' && meterMode === 'continuity') {
        ctx.fillText(comp.simulationState?.custom?.continuity ? 'BEEP' : 'OPEN', 0, -1);
      } else {
        ctx.fillText(`${sign}${valStr}`, 0, -1);
      }
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText(comp.type === 'multimeter' && meterMode === 'continuity' ? 'CONT' : unitStr, 0, 7);
      ctx.restore();
      break;
    }

    case 'logic_analyzer': {
      const channelRows = [
        { y: -40, label: 'D0' },
        { y: -20, label: 'D1' },
        { y: 0, label: 'D2' },
        { y: 20, label: 'D3' },
        { y: 40, label: 'GND' }
      ];

      ctx.beginPath();
      channelRows.forEach(({ y }) => {
        ctx.moveTo(-60, y);
        ctx.lineTo(-28, y);
      });
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect(-28, -52, 72, 104, 7);
      ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#e2e8f0';
      ctx.fill();
      ctx.strokeStyle = isSelected ? colors.selected : '#475569';
      ctx.stroke();

      ctx.fillStyle = '#020617';
      ctx.fillRect(-20, -42, 56, 66);
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left';
      const channels = comp.simulationState?.custom?.channels || [];
      ['D0', 'D1', 'D2', 'D3'].forEach((label, index) => {
        const high = channels[index]?.high ?? false;
        ctx.fillStyle = high ? '#22c55e' : '#64748b';
        ctx.fillText(`${label}:${high ? 'H' : 'L'}`, -15, -28 + index * 14);
      });
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('GND', -15, 18);
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'center';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('LOGIC', 8, 44);
      break;
    }

    case 'net_label': {
      const label = String(comp.properties.netName?.value || 'NET').toUpperCase();
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(-8, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-8, -10, 48, 20, 4);
      ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#eff6ff';
      ctx.fill();
      ctx.strokeStyle = isSelected ? colors.selected : '#3b82f6';
      ctx.stroke();
      ctx.fillStyle = theme === 'dark' ? '#93c5fd' : '#1d4ed8';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label.slice(0, 8), 16, 3);
      break;
    }

    case 'probe_dc':
    case 'probe_ac': {
      const isAc = comp.type === 'probe_ac';
      const isSimulating = useStore.getState().isSimulating;
      const voltage = comp.simulationState?.voltage ?? 0;
      const hasMeasuredValue = comp.simulationState !== undefined;
      const displayVoltage = Number(comp.simulationState?.custom?.displayVoltage ?? voltage);
      const accent = isAc ? '#f59e0b' : '#22d3ee';
      const uiFont = '"Segoe UI", Arial, sans-serif';
      const shouldShowReadout = isSimulating || hasMeasuredValue;
      const readout = displayVoltage;
      const readoutText = (() => {
        const absValue = Math.abs(readout);
        if (absValue >= 100) return readout.toFixed(0);
        if (absValue >= 10) return readout.toFixed(1);
        if (absValue >= 1) return readout.toFixed(2);
        return readout.toFixed(3);
      })();

      ctx.font = `bold 10px ${uiFont}`;
      const textWidth = Math.ceil(ctx.measureText(readoutText).width);

      // Anel metálico de contato no ponto de medição (0,0)
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.strokeStyle = isSelected ? colors.selected : '#ffffff';
      ctx.lineWidth = 1.15;
      ctx.stroke();

      // Ponteira curta, no estilo das probes simples do Proteus
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(8, -10);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.1;
      ctx.stroke();

      // Número flutuando perto da ponta, no estilo simples do Proteus
      if (shouldShowReadout) {
        ctx.save();
        ctx.shadowColor = theme === 'dark' ? accent : 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = theme === 'dark' ? 3 : 1;
        ctx.fillStyle = isSelected ? colors.selected : accent;
        ctx.font = `bold 9px ${uiFont}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(readoutText, 10, -12);
        if (textWidth > 0) {
          ctx.beginPath();
          ctx.arc(8, -12, 1.3, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }

    case 'ldr': {
      // Conexões externas
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-20, 0);
      ctx.moveTo(20, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Círculo preenchido
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, 2 * Math.PI);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      // Resistor Zigue-Zague dentro
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-12, -5);
      ctx.lineTo(-6, 5);
      ctx.lineTo(0, -5);
      ctx.lineTo(6, 5);
      ctx.lineTo(12, -5);
      ctx.lineTo(16, 0);
      ctx.stroke();

      // Duas setas de luz inclinadas apontando para dentro
      ctx.beginPath();
      // Seta 1
      ctx.moveTo(-16, -16);
      ctx.lineTo(-7, -7);
      ctx.moveTo(-13, -7);
      ctx.lineTo(-7, -7);
      ctx.lineTo(-7, -13);
      
      // Seta 2
      ctx.moveTo(-7, -20);
      ctx.lineTo(2, -11);
      ctx.moveTo(-4, -11);
      ctx.lineTo(2, -11);
      ctx.lineTo(2, -17);
      ctx.stroke();

      // Label do valor
      const light = comp.properties.light?.value ?? 50;
      ctx.save();
      ctx.translate(0, 32);
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = colors.text;
      ctx.font = '9px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText(`${light}% Lux`, 0, 0);
      ctx.restore();
      break;
    }

    case 'pot': {
      ctx.beginPath();
      // Conexão extrema A (-40, -20) para o resistor (-20, -20)
      ctx.moveTo(-40, -20);
      ctx.lineTo(-20, -20);
      // Conexão extrema B (-40, 20) para o resistor (-20, 20)
      ctx.moveTo(-40, 20);
      ctx.lineTo(-20, 20);
      ctx.stroke();

      // Retângulo preenchido
      ctx.beginPath();
      ctx.rect(-25, -20, 10, 40);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      // Botões de ajuste (setinhas vermelhas do Proteus)
      ctx.fillStyle = '#dc2626'; // Vermelho
      // Seta Cima (+)
      ctx.beginPath();
      ctx.arc(-20, -10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 6px sans-serif';
      ctx.fillText('+', -20, -8);
      // Seta Baixo (-)
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(-20, 10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText('-', -20, 12);

      ctx.fillStyle = colors.text;

      // Cursor W (40, 0) para o meio do resistor
      ctx.beginPath();
      ctx.moveTo(40, 0);
      ctx.lineTo(0, 0);
      // Seta apontando para o resistor (Wiper)
      const setting = Number(comp.properties.setting?.value ?? 50);
      // Posiciona o wiper na tela proporcional ao setting
      const wiperY = -15 + (1 - (setting / 100)) * 30; // setting 100% -> y = -15 (top), 0% -> y = 15 (bottom)
      
      ctx.lineTo(0, wiperY);
      ctx.lineTo(-12, wiperY);
      ctx.moveTo(-18, wiperY);
      ctx.lineTo(-12, wiperY - 4);
      ctx.lineTo(-12, wiperY + 4);
      ctx.lineTo(-18, wiperY);
      ctx.stroke();

      // Label do valor e percentual
      const rVal = comp.properties.resistance?.value ?? 10000;
      let labelText = `${rVal}Ω (${setting}%)`;
      if (Number(rVal) >= 1e6) labelText = `${(Number(rVal) / 1e6).toFixed(1)}M (${setting}%)`;
      else if (Number(rVal) >= 1e3) labelText = `${(Number(rVal) / 1e3).toFixed(1)}k (${setting}%)`;

      ctx.save();
      ctx.translate(0, 32);
      if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = colors.text;
      ctx.font = '9px font-mono';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, 0, 0);
      ctx.restore();
      break;
    }

    case 'logic_and': {
      ctx.beginPath();
      // Entrada 1
      ctx.moveTo(-40, -20);
      ctx.lineTo(-15, -20);
      // Entrada 2
      ctx.moveTo(-40, 20);
      ctx.lineTo(-15, 20);
      // Saída
      ctx.moveTo(15, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Corpo da porta AND preenchido
      ctx.beginPath();
      ctx.moveTo(-15, -25);
      ctx.lineTo(-15, 25);
      ctx.lineTo(0, 25);
      ctx.arc(0, 0, 25, Math.PI / 2, -Math.PI / 2, true);
      ctx.lineTo(-15, -25);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      // Texto de identificação AND
      ctx.save();
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AND', -3, 3);
      ctx.restore();
      break;
    }

    case 'logic_or': {
      ctx.beginPath();
      // Entrada 1
      ctx.moveTo(-40, -20);
      ctx.lineTo(-10, -20);
      // Entrada 2
      ctx.moveTo(-40, 20);
      ctx.lineTo(-10, 20);
      // Saída
      ctx.moveTo(20, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Corpo da porta OR preenchido
      ctx.beginPath();
      ctx.arc(-25, 0, 25, -Math.PI / 3, Math.PI / 3, false);
      ctx.quadraticCurveTo(-2, 25, 20, 0);
      ctx.quadraticCurveTo(-2, -25, -12.5, -21.65);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      // Texto de identificação OR
      ctx.save();
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OR', -4, 3);
      ctx.restore();
      break;
    }

    case 'logic_not': {
      ctx.beginPath();
      // Entrada
      ctx.moveTo(-40, 0);
      ctx.lineTo(-20, 0);
      // Saída
      ctx.moveTo(10, 0);
      ctx.lineTo(40, 0);
      ctx.stroke();

      // Triângulo preenchido
      ctx.beginPath();
      ctx.moveTo(-20, -15);
      ctx.lineTo(-20, 15);
      ctx.lineTo(0, 0);
      ctx.lineTo(-20, -15);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();

      // Bolha inversora
      ctx.beginPath();
      ctx.arc(5, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.stroke();
      break;
    }
  }

  // Desenha os terminais (pontinhos de snap discretos estilo Proteus)
  // As pontas de prova já desenham o terminal visual no corpo do símbolo.
  const activeTool = useStore.getState().activeTool;
  if (comp.type !== 'probe_dc' && comp.type !== 'probe_ac') {
    comp.terminals.forEach(term => {
      ctx.fillStyle = colors.terminal;
      ctx.beginPath();
      // No modo fio ou selecionado fica maior, no modo cursor comum fica discreto (estilo pino Proteus)
      const radius = (activeTool === 'wire' || isSelected) ? 3.5 : 2;
      ctx.arc(term.relX * GRID_SIZE, term.relY * GRID_SIZE, radius, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  // Identificador de Referência Global (ex: R1, D1) para componentes básicos
  // Pula a renderização padrão de ref para meters e junções
  if (comp.type !== 'junction' && comp.type !== 'probe_dc' && comp.type !== 'probe_ac') {
    // Exibe o nome editável do componente. Se não houver nome, cai em uma referência curta.
    const typeInitial = comp.type === 'resistor' || comp.type === 'pot' ? 'R' : 
                        comp.type.startsWith('capacitor') ? 'C' : 
                        comp.type.startsWith('diodo') || comp.type === 'led' || comp.type === 'zener' ? 'D' : 
                        comp.type.startsWith('transistor') ? 'Q' :
                        comp.type === 'inductor' ? 'L' : 
                        comp.type === 'switch' ? 'SW' : 'U';
    
    const hash = comp.id.split('_').pop()?.toUpperCase() || '1';
    const refText = comp.name || `${typeInitial}${hash}`;

    // Ajusta o rótulo de acordo com a geometria do componente.
    // Probes usam badge superior, então o nome precisa ficar abaixo.
    let yOff = -24;
    if (comp.type === 'probe_dc' || comp.type === 'probe_ac') yOff = 34;
    else if (comp.type === 'pot') yOff = -34;
    else if (comp.type.startsWith('transistor')) yOff = -32;

    const labelX = (comp.labelOffset?.x ?? 0) * GRID_SIZE;
    const labelY = yOff + (comp.labelOffset?.y ?? 0) * GRID_SIZE;

    ctx.save();
    ctx.translate(labelX, labelY);
    ctx.scale(comp.mirrorX ? -1 : 1, comp.mirrorY ? -1 : 1);
    ctx.rotate((((comp.labelRotation ?? 0) - rotation) * Math.PI) / 180);
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(refText, 0, 0);
    ctx.restore();
  }

  // Desenha fogo se o componente estiver queimado
  if (comp.simulationState?.isBurned) {
    ctx.save();
    // Desfaz a rotação para o emoji de fogo sempre ficar em pé
    if (rotation === 90 || rotation === 270) ctx.rotate(-Math.PI / 2);
    else if (rotation === 180) ctx.rotate(Math.PI);
    
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔥', 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

// Renderiza todas as conexões de Fio do circuito
export function drawWires(
  ctx: CanvasRenderingContext2D,
  wires: CircuitWire[],
  components: CircuitComponent[],
  theme: 'light' | 'dark',
  selectedWireId: string | null,
  animationTime: number,
  selectedWireIds: string[] = []
) {
  const colors = COLORS[theme];
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  wires.forEach(wire => {
    // Busca os componentes conectados
    const compFrom = components.find(c => c.id === wire.from.componentId);
    const compTo = components.find(c => c.id === wire.to.componentId);

    if (!compFrom || !compTo) return;

    // Busca os terminais
    const termFrom = compFrom.terminals.find(t => t.id === wire.from.terminalId);
    const termTo = compTo.terminals.find(t => t.id === wire.to.terminalId);

    if (!termFrom || !termTo) return;

    // Posições absolutas do grid
    const x1 = termFrom.x * GRID_SIZE;
    const y1 = termFrom.y * GRID_SIZE;
    const x2 = termTo.x * GRID_SIZE;
    const y2 = termTo.y * GRID_SIZE;
    const routePoints = wire.routePoints?.map(point => ({
      x: point.x * GRID_SIZE,
      y: point.y * GRID_SIZE
    })) ?? [];

    const isSelected = selectedWireId === wire.id || selectedWireIds.includes(wire.id);
    ctx.strokeStyle = isSelected ? colors.selected : colors.wireBase;
    
    // Se a simulação estiver ativa, colore os fios com base na tensão do nó do terminal de origem
    const voltage = compFrom.simulationState?.voltage ?? 0;
    
    // A corrente do próprio fio, calculada no MNA. 
    // Como a voltagem V1 é termFrom e V2 é termTo, (V1 - V2) positivo significa corrente de termFrom para termTo.
    const current = wire.simulationState?.current ?? 0;
    
    if (useStore.getState().isSimulating) {
      ctx.strokeStyle = isSelected ? colors.selected : getVoltageColor(voltage, theme);
    }

    // Desenha o fio (estilo ortogonal com quebras)
    // Para simplificar desenha uma linha direta ou com uma quebra ortogonal no meio
    // Desenha o fio (estilo ortogonal com quebras flexíveis)
    if (routePoints.length > 0) {
      const points = [{ x: x1, y: y1 }, ...routePoints, { x: x2, y: y2 }];

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
      ctx.stroke();

      for (let i = 0; i < points.length - 1; i++) {
        drawElectrons(ctx, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, current, animationTime, theme);
      }
      return;
    }

    const verticalFirst = wire.verticalFirst ?? false;
    const bendOffset = wire.bendOffset;
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);

    if (x1 !== x2 && y1 !== y2) {
      if (bendOffset !== undefined) {
        // Z-Shape de 3 segmentos ajustáveis
        if (verticalFirst) {
          const yMid = y1 + bendOffset * GRID_SIZE;
          ctx.lineTo(x1, yMid);
          ctx.lineTo(x2, yMid);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Elétrons
          drawElectrons(ctx, x1, y1, x1, yMid, current, animationTime, theme);
          drawElectrons(ctx, x1, yMid, x2, yMid, current, animationTime, theme);
          drawElectrons(ctx, x2, yMid, x2, y2, current, animationTime, theme);
        } else {
          const xMid = x1 + bendOffset * GRID_SIZE;
          ctx.lineTo(xMid, y1);
          ctx.lineTo(xMid, y2);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Elétrons
          drawElectrons(ctx, x1, y1, xMid, y1, current, animationTime, theme);
          drawElectrons(ctx, xMid, y1, xMid, y2, current, animationTime, theme);
          drawElectrons(ctx, xMid, y2, x2, y2, current, animationTime, theme);
        }
      } else {
        // L-Shape clássico de 2 segmentos
        if (verticalFirst) {
          ctx.lineTo(x1, y2);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Elétrons
          drawElectrons(ctx, x1, y1, x1, y2, current, animationTime, theme);
          drawElectrons(ctx, x1, y2, x2, y2, current, animationTime, theme);
        } else {
          ctx.lineTo(x2, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Elétrons
          drawElectrons(ctx, x1, y1, x2, y1, current, animationTime, theme);
          drawElectrons(ctx, x2, y1, x2, y2, current, animationTime, theme);
        }
      }
    } else {
      // Linha reta direta
      ctx.lineTo(x2, y2);
      ctx.stroke();
      drawElectrons(ctx, x1, y1, x2, y2, current, animationTime, theme);
    }
  });

  ctx.restore();
}

// Desenha a grade de fundo do Canvas
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
  theme: 'light' | 'dark'
) {
  const colors = COLORS[theme];
  ctx.save();

  const zoom = viewport.zoom;
  const size = GRID_SIZE;
  const majorSize = size * 5;
  const visibleLeft = -viewport.x;
  const visibleTop = -viewport.y;
  const visibleRight = visibleLeft + (width / zoom);
  const visibleBottom = visibleTop + (height / zoom);

  // 1. Linhas finas comuns
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 0.5;
  ctx.beginPath();

  const startX = Math.floor(visibleLeft / size) * size;
  for (let x = startX; x <= visibleRight; x += size) {
    ctx.moveTo(x, visibleTop);
    ctx.lineTo(x, visibleBottom);
  }
  const startY = Math.floor(visibleTop / size) * size;
  for (let y = startY; y <= visibleBottom; y += size) {
    ctx.moveTo(visibleLeft, y);
    ctx.lineTo(visibleRight, y);
  }
  ctx.stroke();

  // 2. Linhas principais (a cada 5 divisões)
  ctx.strokeStyle = theme === 'light' ? '#b8b8a8' : '#334155';
  ctx.lineWidth = 1.0;
  ctx.beginPath();

  const majorStartX = Math.floor(visibleLeft / majorSize) * majorSize;
  for (let x = majorStartX; x <= visibleRight; x += majorSize) {
    ctx.moveTo(x, visibleTop);
    ctx.lineTo(x, visibleBottom);
  }
  const majorStartY = Math.floor(visibleTop / majorSize) * majorSize;
  for (let y = majorStartY; y <= visibleBottom; y += majorSize) {
    ctx.moveTo(visibleLeft, y);
    ctx.lineTo(visibleRight, y);
  }
  ctx.stroke();

  ctx.restore();
}
