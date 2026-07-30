import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../../state/useStore';
import { Sliders, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { CircuitComponent, PcbLayoutComponent, PcbRoute, Terminal } from '../../types/circuit';

interface Pcb3dViewerProps {
  boardName?: string;
  boardColor: string;
  setBoardColor: (color: string) => void;
  boardDimensions: { width: number; height: number };
  pcbLayout?: Record<string, PcbLayoutComponent>;
  pcbRoutes?: Record<string, PcbRoute>;
}

export default function Pcb3dViewer({ boardName = 'Board 1', boardColor, setBoardColor, boardDimensions, pcbLayout = {}, pcbRoutes = {} }: Pcb3dViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const { components, wires, isSimulating } = useStore();

  // Controle de rotação da câmera (esférico manual)
  const cameraAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 15 });
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // Cinza azulado claro para combinar com a UI

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 2. Iluminação
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 40;
    const d = 15;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // Luz de preenchimento para ver de baixo da placa
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-10, -20, -10);
    scene.add(fillLight);

    // 3. Materiais comuns
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(boardColor),
      roughness: 0.2,
      metalness: 0.1,
    });

    const copperMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Dourado
      metalness: 0.9,
      roughness: 0.1,
    });

    const drcErrorMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Vermelho de erro
      roughness: 0.1,
      metalness: 0.8,
      emissive: 0xef4444,
      emissiveIntensity: 0.8
    });

    const leadMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc, // Prateado
      metalness: 0.8,
      roughness: 0.2,
    });

    // 4. Criação física da placa (PCB) usando as dimensões configuradas pelo usuário
    const boardWidth = boardDimensions.width;
    const boardHeight = boardDimensions.height;

    // Calcula os limites físicos do circuito para centralizar no espaço da placa 3D
    let minGridX = 0, maxGridX = 0, minGridY = 0, maxGridY = 0;
    if (components.length > 0) {
      minGridX = Math.min(...components.map(c => c.x));
      maxGridX = Math.max(...components.map(c => c.x));
      minGridY = Math.min(...components.map(c => c.y));
      maxGridY = Math.max(...components.map(c => c.y));
    }

    const centerX = minGridX + (maxGridX - minGridX) / 2;
    const centerY = minGridY + (maxGridY - minGridY) / 2;

    const boardThickness = 0.15;
    const boardGeo = new THREE.BoxGeometry(boardWidth, boardThickness, boardHeight);
    const boardMesh = new THREE.Mesh(boardGeo, boardMaterial);
    boardMesh.receiveShadow = true;
    scene.add(boardMesh);

    // Grid de referência visual sutil em cima da placa
    const boardGridHelper = new THREE.GridHelper(Math.max(boardWidth, boardHeight), Math.round(Math.max(boardWidth, boardHeight)), 0xcccccc, 0xdddddd);
    boardGridHelper.position.y = boardThickness / 2 + 0.005;
    scene.add(boardGridHelper);

    const hasPcbLayout = Object.keys(pcbLayout).length > 0;

    // Helper para converter coordenada da placa para 3D
    const to3DCoords = (boardX: number, boardY: number, heightOffset = boardThickness / 2) => {
      const x = boardX;
      const z = boardY;
      return new THREE.Vector3(x, heightOffset, z);
    };

    const rotateTerminal = (term: Terminal, rotation: number) => {
      const angle = (rotation * Math.PI) / 180;
      const relX = term.relX * 0.35;
      const relY = term.relY * 0.35;
      return {
        x: relX * Math.cos(angle) - relY * Math.sin(angle),
        y: relX * Math.sin(angle) + relY * Math.cos(angle)
      };
    };

    const getComponentBoardPosition = (comp: CircuitComponent) => {
      const layout = pcbLayout[comp.id];
      if (layout) return {
        x: layout.x,
        y: layout.y,
        rotation: layout.rotation ?? comp.rotation
      };

      return {
        x: comp.x - centerX,
        y: comp.y - centerY,
        rotation: comp.rotation
      };
    };

    const getTerminalBoardPosition = (comp: CircuitComponent, term: Terminal) => {
      const compPos = getComponentBoardPosition(comp);
      if (hasPcbLayout) {
        const rel = rotateTerminal(term, compPos.rotation);
        return { x: compPos.x + rel.x, y: compPos.y + rel.y };
      }

      return { x: term.x - centerX, y: term.y - centerY };
    };

    // 5. Renderização dos Pads e Componentes
    const renderedPads = new Set<string>();

    components.forEach(comp => {
      const compBoardPos = getComponentBoardPosition(comp);
      const compPos = to3DCoords(compBoardPos.x, compBoardPos.y);
      const group = new THREE.Group();
      group.position.copy(compPos);
      
      // Rotação do componente (convertida de graus para radianos em torno de Y)
      group.rotation.y = -THREE.MathUtils.degToRad(compBoardPos.rotation);
      scene.add(group);

      // Renderiza Pads (furos de solda metalizados)
      comp.terminals.forEach(term => {
        const termBoardPos = getTerminalBoardPosition(comp, term);
        const termPosLocal = hasPcbLayout
          ? new THREE.Vector3(term.relX * 0.35, 0, term.relY * 0.35)
          : to3DCoords(termBoardPos.x, termBoardPos.y).sub(compPos);
        const padKey = `${termBoardPos.x.toFixed(3)},${termBoardPos.y.toFixed(3)}`;
        
        // Verifica se o terminal está fora da placa física (DRC)
        const isOutside = Math.abs(termBoardPos.x) > boardWidth / 2 ||
                           Math.abs(termBoardPos.y) > boardHeight / 2;
        const currentPadMat = isOutside ? drcErrorMaterial : copperMaterial;

        if (!renderedPads.has(padKey)) {
          renderedPads.add(padKey);
          
          // Anel superior do Pad
          const padGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.01, 16);
          const padMesh = new THREE.Mesh(padGeo, currentPadMat);
          padMesh.position.copy(termPosLocal).add(new THREE.Vector3(0, 0.001, 0));
          group.add(padMesh);

          // Anel inferior do Pad
          const padBottomMesh = padMesh.clone();
          padBottomMesh.position.y = -boardThickness - 0.001;
          group.add(padBottomMesh);
        }

        // Perninha do componente descendo no pad (fica vermelha de erro se fora da placa)
        const leadGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8);
        const leadMesh = new THREE.Mesh(leadGeo, isOutside ? drcErrorMaterial : leadMaterial);
        leadMesh.position.copy(termPosLocal).add(new THREE.Vector3(0, 0.1, 0));
        group.add(leadMesh);
      });

      // Renderização detalhada da carcaça do componente
      switch (comp.type) {
        case 'resistor': {
          // Corpo cilíndrico bege
          const bodyGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.8, 16);
          bodyGeo.rotateZ(Math.PI / 2);
          const resistorMat = new THREE.MeshStandardMaterial({ color: 0xded0b6, roughness: 0.6 });
          const body = new THREE.Mesh(bodyGeo, resistorMat);
          body.position.y = 0.18;
          body.castShadow = true;
          group.add(body);

          // Fio conectando as pernas ao corpo
          const wireGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8);
          wireGeo.rotateZ(Math.PI / 2);
          const wiresMesh = new THREE.Mesh(wireGeo, leadMaterial);
          wiresMesh.position.y = 0.18;
          group.add(wiresMesh);

          // Listras coloridas do resistor (com base na resistência)
          const stripColors = [0x8b5a2b, 0x000000, 0xff0000, 0xd4af37]; // Marrom, Preto, Vermelho, Dourado para 1kΩ
          const valueStr = String(comp.properties.resistance?.value || '1k');
          if (valueStr.includes('100') && !valueStr.includes('100k')) {
            stripColors[2] = 0x964b00; // Marrom (100 ohms)
          } else if (valueStr.includes('10k')) {
            stripColors[2] = 0xffa500; // Laranja (10k ohms)
          } else if (valueStr.includes('100k')) {
            stripColors[2] = 0xffff00; // Amarelo (100k)
          } else if (valueStr.includes('220')) {
            stripColors[0] = 0xff0000; // Vermelho
            stripColors[1] = 0xff0000; // Vermelho
            stripColors[2] = 0x964b00; // Marrom
          }

          stripColors.forEach((color, idx) => {
            const stripGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.06, 16);
            stripGeo.rotateZ(Math.PI / 2);
            const stripMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
            const strip = new THREE.Mesh(stripGeo, stripMat);
            strip.position.set(-0.25 + idx * 0.18, 0.18, 0);
            group.add(strip);
          });
          break;
        }

        case 'capacitor': {
          // Corpo cilíndrico do capacitor eletrolítico (vertical)
          const bodyGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.8, 16);
          const capMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 }); // Preto/Azul escuro
          const body = new THREE.Mesh(bodyGeo, capMat);
          body.position.y = 0.4;
          body.castShadow = true;
          group.add(body);

          // Faixa cinza de polaridade negativa
          const stripeGeo = new THREE.CylinderGeometry(0.245, 0.245, 0.8, 16, 1, false, Math.PI, Math.PI / 3);
          const stripeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4 });
          const stripe = new THREE.Mesh(stripeGeo, stripeMat);
          stripe.position.y = 0.4;
          group.add(stripe);

          // Topo prateado de alumínio
          const topGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.01, 16);
          const topMesh = new THREE.Mesh(topGeo, leadMaterial);
          topMesh.position.y = 0.805;
          group.add(topMesh);
          break;
        }

        case 'capacitor_ceramic': {
          // Disco cerâmico marrom/laranja
          const diskGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16);
          diskGeo.rotateX(Math.PI / 2);
          const mat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 }); // Amber
          const disk = new THREE.Mesh(diskGeo, mat);
          disk.position.y = 0.3;
          disk.castShadow = true;
          group.add(disk);
          break;
        }

        case 'capacitor_polyester': {
          // Caixa tipo chiclete verde
          const boxGeo = new THREE.BoxGeometry(0.4, 0.5, 0.2);
          const mat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }); // Verde escuro
          const box = new THREE.Mesh(boxGeo, mat);
          box.position.y = 0.25;
          box.castShadow = true;
          group.add(box);
          break;
        }

        case 'led': {
          // Domo translúcido colorido
          const capGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16);
          const domeGeo = new THREE.SphereGeometry(0.2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
          domeGeo.translate(0, 0.15, 0);

          const ledColorVal = comp.properties.color?.value || 'red';
          let hexColor = 0xef4444; // Vermelho
          if (ledColorVal === 'green') hexColor = 0x22c55e;
          if (ledColorVal === 'blue') hexColor = 0x3b82f6;
          if (ledColorVal === 'yellow') hexColor = 0xeab308;
          if (ledColorVal === 'orange') hexColor = 0xf97316;
          if (ledColorVal === 'white') hexColor = 0xf8fafc;

          // Se a simulação estiver ativa e houver tensão, acende!
          const isLit = isSimulating && comp.simulationState && ((comp.simulationState.voltage ?? 0) > 1.2);

          const ledMat = new THREE.MeshPhysicalMaterial({
            color: hexColor,
            transmission: isLit ? 0.2 : 0.8,
            opacity: 1,
            transparent: true,
            roughness: 0.1,
            emissive: isLit ? hexColor : 0x000000,
            emissiveIntensity: isLit ? 3.2 : 0
          });

          const cap = new THREE.Mesh(capGeo, ledMat);
          cap.position.y = 0.15;
          const dome = new THREE.Mesh(domeGeo, ledMat);
          
          cap.castShadow = true;
          group.add(cap);
          group.add(dome);

          if (isLit) {
            const pointLight = new THREE.PointLight(hexColor, 1.2, 5);
            pointLight.position.set(0, 0.5, 0);
            group.add(pointLight);
          }
          break;
        }

        case 'diodo': {
          // Diodo retificador comum (preto com listra cinza)
          const bodyGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.6, 16);
          bodyGeo.rotateZ(Math.PI / 2);
          const diodoMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
          const body = new THREE.Mesh(bodyGeo, diodoMat);
          body.position.y = 0.14;
          body.castShadow = true;
          group.add(body);

          // Faixa de catodo (prateada)
          const bandGeo = new THREE.CylinderGeometry(0.145, 0.145, 0.1, 16);
          const bandMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 });
          bandGeo.rotateZ(Math.PI / 2);
          const band = new THREE.Mesh(bandGeo, bandMat);
          band.position.set(0.18, 0.14, 0);
          group.add(band);

          // Fio metálico
          const wireGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
          wireGeo.rotateZ(Math.PI / 2);
          const wiresMesh = new THREE.Mesh(wireGeo, leadMaterial);
          wiresMesh.position.y = 0.14;
          group.add(wiresMesh);
          break;
        }

        case 'switch': {
          // Caixa preta do switch
          const bodyGeo = new THREE.BoxGeometry(0.5, 0.35, 0.5);
          const swMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
          const body = new THREE.Mesh(bodyGeo, swMat);
          body.position.y = 0.175;
          body.castShadow = true;
          group.add(body);

          // Botão colorido do switch
          const state = comp.properties.state?.value ?? false;
          const btnGeo = new THREE.BoxGeometry(0.24, 0.16, 0.24);
          const btnMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }); // Vermelho
          const btn = new THREE.Mesh(btnGeo, btnMat);
          // Altera posição ou inclinação com base no estado lig/deslig
          btn.position.set(0, 0.35, state ? 0.06 : -0.06);
          btn.rotation.x = state ? 0.2 : -0.2;
          btn.castShadow = true;
          group.add(btn);
          break;
        }

        case 'ground': {
          // Terminal de Terra sutil (Pad metálico com pino central preto)
          const pinGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8);
          const pinMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.7 });
          const pin = new THREE.Mesh(pinGeo, pinMat);
          pin.position.y = 0.2;
          group.add(pin);
          break;
        }

        case 'inductor': {
          // Ferrite central
          const coreGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12);
          coreGeo.rotateZ(Math.PI / 2);
          const coreMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.8 });
          const core = new THREE.Mesh(coreGeo, coreMat);
          core.position.y = 0.18;
          core.castShadow = true;
          group.add(core);

          // Espiras de cobre (Torus ao redor do ferrite)
          const wireMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8, roughness: 0.2 }); // Cor de cobre/bronze
          for (let i = 0; i < 5; i++) {
            const turnGeo = new THREE.TorusGeometry(0.15, 0.03, 8, 16);
            turnGeo.rotateY(Math.PI / 2);
            const turn = new THREE.Mesh(turnGeo, wireMat);
            turn.position.set(-0.2 + i * 0.1, 0.18, 0);
            group.add(turn);
          }

          // Terminais de fio de metal
          const leadWireGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
          leadWireGeo.rotateZ(Math.PI / 2);
          const leadWire = new THREE.Mesh(leadWireGeo, leadMaterial);
          leadWire.position.y = 0.18;
          group.add(leadWire);
          break;
        }

        case 'ldr': {
          // Corpo cerâmico branco
          const bodyGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.06, 16);
          const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = 0.12;
          body.castShadow = true;
          group.add(body);

          // Sensor vermelho (CdS)
          const sensorGeo = new THREE.TorusGeometry(0.16, 0.02, 8, 16);
          sensorGeo.rotateX(Math.PI / 2);
          const sensorMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });
          const sensor = new THREE.Mesh(sensorGeo, sensorMat);
          sensor.position.y = 0.155;
          group.add(sensor);
          
          const centerGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.01, 12);
          const center = new THREE.Mesh(centerGeo, sensorMat);
          center.position.y = 0.155;
          group.add(center);

          // Pernas longas de metal
          const wireGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8);
          wireGeo.rotateZ(Math.PI / 2);
          const wiresMesh = new THREE.Mesh(wireGeo, leadMaterial);
          wiresMesh.position.y = 0.12;
          group.add(wiresMesh);
          break;
        }

        case 'pot': {
          // Corpo principal (caixa azul)
          const bodyGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
          const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4 }); // Azul
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = 0.25;
          body.castShadow = true;
          group.add(body);

          // Eixo metálico
          const shaftGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12);
          const shaft = new THREE.Mesh(shaftGeo, leadMaterial);
          shaft.position.y = 0.6;
          shaft.castShadow = true;
          group.add(shaft);

          // Knob de controle (plástico cinza/preto)
          const knobGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.15, 12);
          const knobMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6 });
          const knob = new THREE.Mesh(knobGeo, knobMat);
          knob.position.y = 0.75;
          
          const setting = Number(comp.properties.setting?.value ?? 50);
          knob.rotation.y = (setting / 100) * Math.PI * 1.5 - (Math.PI * 0.75); // Rotaciona 270 graus proporcionalmente
          group.add(knob);

          // Indicador visual no knob
          const ptrGeo = new THREE.BoxGeometry(0.03, 0.16, 0.08);
          const ptrMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const ptr = new THREE.Mesh(ptrGeo, ptrMat);
          ptr.position.set(0, 0.08, -0.08);
          knob.add(ptr);
          break;
        }

        case 'logic_and':
        case 'logic_or':
        case 'logic_not': {
          // Corpo do CI (preto fosco)
          const icGeo = new THREE.BoxGeometry(1.2, 0.28, 0.5);
          const icMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.7 });
          const ic = new THREE.Mesh(icGeo, icMat);
          ic.position.y = 0.24;
          ic.castShadow = true;
          group.add(ic);

          // Chanfro / Meia lua indicador do pino 1
          const notchGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8, 1, false, 0, Math.PI);
          const notch = new THREE.Mesh(notchGeo, icMat);
          notch.position.set(-0.6, 0.24, 0);
          notch.rotation.z = Math.PI / 2;
          group.add(notch);

          // Pinos do CI DIP (7 de cada lado)
          const pinColor = leadMaterial;
          for (let i = 0; i < 7; i++) {
            const zOffset = 0.27;
            const xPos = -0.45 + i * 0.15;
            
            // Pernas lado superior
            const pin1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.08), pinColor);
            pin1.position.set(xPos, 0.12, zOffset);
            group.add(pin1);

            // Pernas lado inferior
            const pin2 = pin1.clone();
            pin2.position.z = -zOffset;
            group.add(pin2);
          }
          break;
        }

        case 'junction': {
          // Junção é apenas solda física, não desenha carcaça 3D
          break;
        }

        default: {
          // Bloco padrão azul escuro para componentes gerais/displays/fontes
          const widthVal = comp.type === 'osc' ? 1.6 : 0.8;
          const depthVal = comp.type === 'osc' ? 0.8 : 0.6;
          const heightVal = comp.type === 'osc' ? 0.9 : 0.5;

          const boxGeo = new THREE.BoxGeometry(widthVal, heightVal, depthVal);
          const boxMat = new THREE.MeshStandardMaterial({
            color: comp.type === 'osc' ? 0x475569 : 0x0f172a, // Cinza para osciloscópio, azul escuro para outros
            roughness: 0.4
          });
          const box = new THREE.Mesh(boxGeo, boxMat);
          box.position.y = heightVal / 2;
          box.castShadow = true;
          group.add(box);

          // Detalhes extras se for Osciloscópio (exibe a tela)
          if (comp.type === 'osc') {
            const screenGeo = new THREE.PlaneGeometry(1.3, 0.6);
            const screenMat = new THREE.MeshBasicMaterial({ color: 0x064e3b }); // Fundo verde escuro
            const screen = new THREE.Mesh(screenGeo, screenMat);
            screen.position.set(0, 0.4, 0.405);
            group.add(screen);

            // Grelha da tela do osciloscópio
            const screenGrid = new THREE.GridHelper(1.2, 6, 0x047857, 0x047857);
            screenGrid.rotation.x = Math.PI / 2;
            screenGrid.position.set(0, 0.4, 0.408);
            group.add(screenGrid);
          }
          break;
        }
      }
    });

    // 6. Roteamento de Trilhas (Traces) na parte de baixo da placa (Bottom Copper)
    wires.forEach(wire => {
      const compFrom = components.find(c => c.id === wire.from.componentId);
      const compTo = components.find(c => c.id === wire.to.componentId);

      if (!compFrom || !compTo) return;

      const termFrom = compFrom.terminals.find(t => t.id === wire.from.terminalId);
      const termTo = compTo.terminals.find(t => t.id === wire.to.terminalId);

      if (!termFrom || !termTo) return;

      const fromBoard = getTerminalBoardPosition(compFrom, termFrom);
      const toBoard = getTerminalBoardPosition(compTo, termTo);
      const routePoints = pcbRoutes[wire.id]?.points || [];

      // Coordenadas mundiais 3D no fundo da placa (-boardThickness/2 - 0.002)
      const p1 = to3DCoords(fromBoard.x, fromBoard.y, -boardThickness / 2 - 0.005);
      const p2 = to3DCoords(toBoard.x, toBoard.y, -boardThickness / 2 - 0.005);

      const points: THREE.Vector3[] = [
        p1,
        ...routePoints.map(point => to3DCoords(point.x, point.y, -boardThickness / 2 - 0.005)),
        p2
      ];

      // Desenha a trilha como uma fita plana fina 3D (para cada segmento)
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const distance = start.distanceTo(end);

        if (distance < 0.05) continue;

        // Se o fio ou parte dele está fora da placa física, acende o erro de DRC na trilha
        const isStartOutside = Math.abs(start.x) > boardWidth / 2 || Math.abs(start.z) > boardHeight / 2;
        const isEndOutside = Math.abs(end.x) > boardWidth / 2 || Math.abs(end.z) > boardHeight / 2;
        const currentCopperMat = (isStartOutside || isEndOutside) ? drcErrorMaterial : copperMaterial;

        // Geometria da trilha
        const traceGeo = new THREE.BoxGeometry(0.12, 0.015, distance);
        const traceMesh = new THREE.Mesh(traceGeo, currentCopperMat);
        
        // Posiciona no meio do segmento
        const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        traceMesh.position.copy(midPoint);

        // Rotaciona a trilha para alinhar com a direção do segmento
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        
        // Define rotação Y com base na direção
        const angleY = Math.atan2(direction.x, direction.z);
        traceMesh.rotation.y = angleY;

        scene.add(traceMesh);
      }
    });

    // 7. Loop de Animação e Renderização
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Atualiza posição da câmera com base nos ângulos esféricos controlados pelo drag do mouse
      const angle = cameraAngleRef.current;
      camera.position.x = angle.radius * Math.sin(angle.phi) * Math.sin(angle.theta);
      camera.position.y = angle.radius * Math.cos(angle.phi);
      camera.position.z = angle.radius * Math.sin(angle.phi) * Math.cos(angle.theta);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    // 8. Eventos de Resize do Container
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Limpeza
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [components, wires, isSimulating, boardColor, boardDimensions, pcbLayout, pcbRoutes]);

  // Manipuladores de mouse para rotação esférica (Orbit simplificado)
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;

    const angle = cameraAngleRef.current;
    
    // Rotaciona theta livremente
    angle.theta -= deltaX * 0.007;
    // Limita phi para não ultrapassar os pólos (evita inversão de câmera)
    angle.phi = Math.max(0.1, Math.min(Math.PI - 0.1, angle.phi - deltaY * 0.007));

    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  // Controles rápidos de Câmera
  const resetCamera = () => {
    cameraAngleRef.current = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 15 };
  };

  const zoomIn = () => {
    cameraAngleRef.current.radius = Math.max(5, cameraAngleRef.current.radius - 2);
  };

  const zoomOut = () => {
    cameraAngleRef.current.radius = Math.min(40, cameraAngleRef.current.radius + 2);
  };

  return (
    <div className="w-full h-full flex flex-col relative bg-slate-100 dark:bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner">
      {/* Controles de Placa superiores */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-xl shadow-md border border-slate-200/50 dark:border-slate-800/50 text-xs">
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-slate-700 dark:text-slate-200">{boardName}</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            {(boardDimensions.width * 10).toFixed(0)} x {(boardDimensions.height * 10).toFixed(0)} mm
          </span>
        </div>
        <div className="h-7 w-px bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 font-medium">
          <Sliders className="w-3.5 h-3.5" />
          <span>Máscara de Solda:</span>
        </div>
        <div className="flex items-center space-x-1">
          {[
            { name: 'Verde Clássico', color: '#1b4d3e' },
            { name: 'Azul Premium', color: '#102a43' },
            { name: 'Vermelho Rubi', color: '#610b0b' },
            { name: 'Preto Fosco', color: '#18181b' }
          ].map((item) => (
            <button
              key={item.color}
              onClick={() => setBoardColor(item.color)}
              className={`w-4 h-4 rounded-full border cursor-pointer transition-all hover:scale-110 ${
                boardColor === item.color
                  ? 'border-indigo-600 dark:border-indigo-400 ring-2 ring-indigo-500/20 shadow-sm'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
              style={{ backgroundColor: item.color }}
              title={item.name}
            />
          ))}
        </div>
      </div>

      {/* Controles rápidos de Câmera à direita */}
      <div className="absolute right-4 bottom-4 z-10 flex flex-col space-y-1.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-1.5 rounded-xl shadow-md border border-slate-200/50 dark:border-slate-800/50">
        <button
          onClick={zoomIn}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
          title="Aproximar Zoom"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={zoomOut}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
          title="Afastar Zoom"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={resetCamera}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer border-t border-slate-200/50 dark:border-slate-800/50"
          title="Resetar Câmera"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Dica de arrastar */}
      <div className="absolute left-4 bottom-4 z-10 text-[10px] text-slate-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/50 px-2 py-1 rounded-md pointer-events-none">
        Arraste com o mouse para girar a placa 360° | Scroll para Zoom
      </div>

      {/* Canvas Mount */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      />
    </div>
  );
}
