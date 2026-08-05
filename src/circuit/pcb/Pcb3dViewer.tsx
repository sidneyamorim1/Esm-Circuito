import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../../state/useStore';
import { Sliders, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { CircuitComponent, PcbLayoutComponent, PcbRoute, Terminal } from '../../types/circuit';
import { getPcbConnections, getPcbPhysicalComponents } from './pcbNetlist';

interface Pcb3dViewerProps {
  boardName?: string;
  boardColor: string;
  setBoardColor: (color: string) => void;
  boardDimensions: { width: number; height: number };
  showMountingHoles?: boolean;
  mountingHoleDiameter?: number;
  mountingHoleMargin?: number;
  showSolderPads?: boolean;
  solderPadDiameter?: number;
  pcbLayout?: Record<string, PcbLayoutComponent>;
  pcbRoutes?: Record<string, PcbRoute>;
}

export default function Pcb3dViewer({
  boardName = 'Board 1',
  boardColor,
  setBoardColor,
  boardDimensions,
  showMountingHoles = true,
  mountingHoleDiameter = 3.2,
  mountingHoleMargin = 5,
  showSolderPads = true,
  solderPadDiameter = 1.6,
  pcbLayout = {},
  pcbRoutes = {}
}: Pcb3dViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const { components, wires, isSimulating } = useStore();
  const initialCameraRadius = Math.max(8, Math.max(boardDimensions.width, boardDimensions.height) * 1.35);
  const minCameraRadius = Math.max(2.5, Math.max(boardDimensions.width, boardDimensions.height) * 0.35);
  const maxCameraRadius = Math.max(30, Math.max(boardDimensions.width, boardDimensions.height) * 4);
  const [cameraRadius, setCameraRadius] = useState(initialCameraRadius);
  const pcbComponents = useMemo(
    () => getPcbPhysicalComponents(components),
    [components]
  );
  const pcbWires = useMemo(
    () => getPcbConnections(components, wires),
    [components, wires]
  );

  // Controle de rotação da câmera (esférico manual)
  const cameraAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: initialCameraRadius });
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    cameraAngleRef.current.radius = Math.max(minCameraRadius, Math.min(maxCameraRadius, cameraAngleRef.current.radius));
    setCameraRadius(cameraAngleRef.current.radius);
  }, [minCameraRadius, maxCameraRadius]);

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

    const topCopperMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4d21f,
      metalness: 0.85,
      roughness: 0.12,
      emissive: 0x3b3300,
      emissiveIntensity: 0.08
    });

    const bottomCopperMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d3dff,
      metalness: 0.7,
      roughness: 0.18,
      emissive: 0x050b44,
      emissiveIntensity: 0.08
    });

    const airwireMaterial = new THREE.LineBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.65
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
    if (pcbComponents.length > 0) {
      minGridX = Math.min(...pcbComponents.map(c => c.x));
      maxGridX = Math.max(...pcbComponents.map(c => c.x));
      minGridY = Math.min(...pcbComponents.map(c => c.y));
      maxGridY = Math.max(...pcbComponents.map(c => c.y));
    }

    const centerX = minGridX + (maxGridX - minGridX) / 2;
    const centerY = minGridY + (maxGridY - minGridY) / 2;

    const boardThickness = 0.15;
    const boardGeo = new THREE.BoxGeometry(boardWidth, boardThickness, boardHeight);
    const boardMesh = new THREE.Mesh(boardGeo, boardMaterial);
    boardMesh.receiveShadow = true;
    scene.add(boardMesh);

    if (showMountingHoles) {
      const holeRadius = (mountingHoleDiameter / 10) / 2;
      const margin = mountingHoleMargin / 10;
      const holePositions = [
        [-boardWidth / 2 + margin, -boardHeight / 2 + margin],
        [boardWidth / 2 - margin, -boardHeight / 2 + margin],
        [-boardWidth / 2 + margin, boardHeight / 2 - margin],
        [boardWidth / 2 - margin, boardHeight / 2 - margin]
      ];

      holePositions.forEach(([x, z]) => {
        const ringGeo = new THREE.TorusGeometry(holeRadius * 1.45, 0.025, 8, 24);
        ringGeo.rotateX(Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, copperMaterial);
        ring.position.set(x, boardThickness / 2 + 0.012, z);
        scene.add(ring);

        const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, boardThickness + 0.02, 24);
        const holeMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.8 });
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.set(x, boardThickness / 2 + 0.018, z);
        scene.add(hole);
      });
    }

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

    pcbComponents.forEach(comp => {
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

        if (showSolderPads && !renderedPads.has(padKey)) {
          renderedPads.add(padKey);
          
          // Anel superior do Pad
          const padRadius = (solderPadDiameter / 10) / 2;
          const padGeo = new THREE.CylinderGeometry(padRadius, padRadius, 0.01, 16);
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
        case 'resistor':
        case 'resistor_5w':
        case 'resistor_smd': {
          if (comp.type === 'resistor_5w') {
            // Bloco Cerâmico 5W
            const bodyGeo = new THREE.BoxGeometry(0.8, 0.3, 0.3);
            const resistorMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 }); // Branco Cerâmico
            const body = new THREE.Mesh(bodyGeo, resistorMat);
            body.position.y = 0.15;
            body.castShadow = true;
            group.add(body);
            
            // Fios grossos
            const wireGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8);
            wireGeo.rotateZ(Math.PI / 2);
            const wiresMesh = new THREE.Mesh(wireGeo, leadMaterial);
            wiresMesh.position.y = 0.15;
            group.add(wiresMesh);
          } else if (comp.type === 'resistor_smd') {
            // Bloco preto pequeno
            const bodyGeo = new THREE.BoxGeometry(0.3, 0.1, 0.15);
            const resistorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 }); // Preto Escuro
            const body = new THREE.Mesh(bodyGeo, resistorMat);
            body.position.y = 0.05;
            body.castShadow = true;
            group.add(body);
            
            // Contatos prateados nas pontas
            const contactGeo = new THREE.BoxGeometry(0.06, 0.11, 0.16);
            const contactLeft = new THREE.Mesh(contactGeo, leadMaterial);
            contactLeft.position.set(-0.15, 0.05, 0);
            group.add(contactLeft);
            const contactRight = new THREE.Mesh(contactGeo, leadMaterial);
            contactRight.position.set(0.15, 0.05, 0);
            group.add(contactRight);
          } else {
            // Resistor comum PTH (1/4W)
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

            // Listras coloridas do resistor
            const stripColors = [0x8b5a2b, 0x000000, 0xff0000, 0xd4af37]; // Marrom, Preto, Vermelho, Dourado para 1kΩ
            const valueStr = String(comp.properties.resistance?.value || '1k');
            if (valueStr.includes('100') && !valueStr.includes('100k')) {
              stripColors[2] = 0x964b00; // Marrom
            } else if (valueStr.includes('10k')) {
              stripColors[2] = 0xffa500; // Laranja
            } else if (valueStr.includes('100k')) {
              stripColors[2] = 0xffff00; // Amarelo
            } else if (valueStr.includes('220')) {
              stripColors[0] = 0xff0000;
              stripColors[1] = 0xff0000;
              stripColors[2] = 0x964b00;
            }

            stripColors.forEach((color, idx) => {
              const stripGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.06, 16);
              stripGeo.rotateZ(Math.PI / 2);
              const stripMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
              const strip = new THREE.Mesh(stripGeo, stripMat);
              strip.position.set(-0.25 + idx * 0.18, 0.18, 0);
              group.add(strip);
            });
          }
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
          const diskGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16);
          diskGeo.rotateX(Math.PI / 2);
          const mat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.8 }); // Yellow/Amber
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

        case 'trimpot_multi': {
          // Trimpot multivoltas longo azul
          const bodyGeo = new THREE.BoxGeometry(0.8, 0.4, 0.4);
          const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.4 }); // Azul
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = 0.2;
          body.castShadow = true;
          group.add(body);

          // Parafuso dourado de ajuste no topo
          const screwGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12);
          const screwMat = new THREE.MeshStandardMaterial({ color: 0xfde047, metalness: 0.8, roughness: 0.2 }); // Dourado
          const screw = new THREE.Mesh(screwGeo, screwMat);
          screw.position.set(0.3, 0.42, 0); // Fica numa das pontas
          group.add(screw);
          break;
        }

        case 'pot': {
          // Corpo principal (cilindro creme)
          const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 24);
          bodyGeo.rotateZ(Math.PI / 2); // Deita o cilindro horizontalmente
          const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4 }); // Creme/bege
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.set(0, 0.4, 0);
          body.castShadow = true;
          group.add(body);

          // Eixo metálico
          const shaftGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 16);
          shaftGeo.rotateZ(Math.PI / 2);
          const shaft = new THREE.Mesh(shaftGeo, leadMaterial);
          shaft.position.set(0.6, 0.4, 0);
          shaft.castShadow = true;
          group.add(shaft);

          // Knob de controle (plástico cinza/preto)
          const knobGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.15, 24);
          knobGeo.rotateZ(Math.PI / 2);
          const knobMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6 });
          const knob = new THREE.Mesh(knobGeo, knobMat);
          knob.position.set(0.75, 0.4, 0);
          
          const setting = Number(comp.properties.setting?.value ?? 50);
          knob.rotation.x = (setting / 100) * Math.PI * 1.5 - (Math.PI * 0.75); // Rotaciona 270 graus proporcionalmente
          group.add(knob);

          // Indicador visual no knob
          const ptrGeo = new THREE.BoxGeometry(0.16, 0.04, 0.16);
          const ptrMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const ptr = new THREE.Mesh(ptrGeo, ptrMat);
          ptr.position.set(0, 0.1, 0);
          knob.add(ptr);
          break;
        }

        case 'regulator_7805': {
          // TO-220 Package em pé
          const bodyGeo = new THREE.BoxGeometry(0.6, 0.6, 0.2);
          const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.set(0, 0.6, 0);
          body.castShadow = true;
          group.add(body);

          // Tab Metálico
          const tabGeo = new THREE.BoxGeometry(0.6, 0.4, 0.05);
          const tab = new THREE.Mesh(tabGeo, leadMaterial);
          tab.position.set(0, 1.1, -0.075);
          tab.castShadow = true;
          group.add(tab);
          
          // Furo no tab (usando um cilindro preto simples)
          const holeGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12);
          holeGeo.rotateX(Math.PI/2);
          const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
          const hole = new THREE.Mesh(holeGeo, holeMat);
          hole.position.set(0, 1.1, -0.075);
          group.add(hole);
          break;
        }

        case 'arduino_nano': {
          // Placa do Arduino Nano (4.3cm x 1.8cm, convertido para unidades do 3D: ~3.0 x 1.2)
          const boardGeo = new THREE.BoxGeometry(3.0, 0.1, 1.2);
          const boardMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 }); // Azul
          const board = new THREE.Mesh(boardGeo, boardMat);
          board.position.y = 0.3;
          board.castShadow = true;
          group.add(board);

          // CI ATMega328 (QFP ou parecido)
          const mcuGeo = new THREE.BoxGeometry(0.6, 0.05, 0.6);
          const mcuMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
          const mcu = new THREE.Mesh(mcuGeo, mcuMat);
          mcu.position.set(0.3, 0.375, 0);
          mcu.rotation.y = Math.PI / 4;
          group.add(mcu);

          // Conector USB Mini (Prata)
          const usbGeo = new THREE.BoxGeometry(0.5, 0.2, 0.4);
          const usb = new THREE.Mesh(usbGeo, leadMaterial);
          usb.position.set(-1.25, 0.45, 0);
          group.add(usb);

          // Pinos Header (2 fileiras)
          const pinColor = leadMaterial;
          for (let i = 0; i < 15; i++) {
            const xPos = -1.4 + i * 0.2;
            
            // Fileira superior
            const pin1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), pinColor);
            pin1.position.set(xPos, 0.15, -0.5);
            group.add(pin1);

            // Fileira inferior
            const pin2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), pinColor);
            pin2.position.set(xPos, 0.15, 0.5);
            group.add(pin2);
          }
          break;
        }

        case 'ic_7442':
        case 'adc_0808':
        case 'ic_555':
        case 'opamp_tl072':
        case 'opamp_tl074':
        case 'logic_and':
        case 'logic_or':
        case 'logic_not': {
          let numPins = 14;
          if (comp.type === 'logic_and' || comp.type === 'logic_or' || comp.type === 'logic_not') numPins = 14;
          if (comp.type === 'ic_7442') numPins = 16;
          if (comp.type === 'adc_0808') numPins = 28;
          if (comp.type === 'ic_555' || comp.type === 'opamp_tl072') numPins = 8;
          if (comp.type === 'opamp_tl074') numPins = 14;

          const pinRows = numPins / 2;
          const pitch = 0.2;
          const length = pinRows * pitch + 0.1;

          // Corpo do CI (preto fosco)
          const icGeo = new THREE.BoxGeometry(length, 0.28, 0.5);
          const icMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.7 });
          const ic = new THREE.Mesh(icGeo, icMat);
          ic.position.y = 0.24;
          ic.castShadow = true;
          group.add(ic);

          // Chanfro / Meia lua indicador do pino 1
          const notchGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8, 1, false, 0, Math.PI);
          const notch = new THREE.Mesh(notchGeo, icMat);
          notch.position.set(-length/2, 0.24, 0);
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

    // 6. Roteamento de Trilhas (Traces). Sem rota salva, mostra guia/airwire.
    pcbWires.forEach(wire => {
      const compFrom = pcbComponents.find(c => c.id === wire.from.componentId);
      const compTo = pcbComponents.find(c => c.id === wire.to.componentId);

      if (!compFrom || !compTo) return;

      const termFrom = compFrom.terminals.find(t => t.id === wire.from.terminalId);
      const termTo = compTo.terminals.find(t => t.id === wire.to.terminalId);

      if (!termFrom || !termTo) return;

      const fromBoard = getTerminalBoardPosition(compFrom, termFrom);
      const toBoard = getTerminalBoardPosition(compTo, termTo);
      const route = pcbRoutes[wire.id];
      const routePoints = route?.points || [];
      const routeLayer = route?.layer ?? 'top';
      const isRouted = Boolean(route);
      const traceY = routeLayer === 'top' ? boardThickness / 2 + 0.018 : -boardThickness / 2 - 0.018;

      const p1 = to3DCoords(fromBoard.x, fromBoard.y, traceY);
      const p2 = to3DCoords(toBoard.x, toBoard.y, traceY);

      const points: THREE.Vector3[] = [
        p1,
        ...routePoints.map(point => to3DCoords(point.x, point.y, traceY)),
        p2
      ];

      if (!isRouted) {
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeometry, airwireMaterial);
        scene.add(line);
        return;
      }

      const customCopperMaterial = route?.color
        ? new THREE.MeshStandardMaterial({ color: route.color, metalness: 0.75, roughness: 0.25 })
        : null;

      // Desenha a trilha como uma fita plana fina 3D (para cada segmento)
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const distance = start.distanceTo(end);

        if (distance < 0.05) continue;

        // Se o fio ou parte dele está fora da placa física, acende o erro de DRC na trilha
        const isStartOutside = Math.abs(start.x) > boardWidth / 2 || Math.abs(start.z) > boardHeight / 2;
        const isEndOutside = Math.abs(end.x) > boardWidth / 2 || Math.abs(end.z) > boardHeight / 2;
        const currentCopperMat = (isStartOutside || isEndOutside)
          ? drcErrorMaterial
          : (customCopperMaterial ?? (routeLayer === 'top' ? topCopperMaterial : bottomCopperMaterial));

        // Geometria da trilha
        const traceWidth = Math.max(0.08, route?.width ?? 0.18);
        const traceGeo = new THREE.BoxGeometry(traceWidth, 0.018, distance);
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

    Object.entries(pcbRoutes).forEach(([routeId, route]) => {
      const isLinkedRoute = pcbWires.some(wire => wire.id === routeId);
      if (isLinkedRoute || !route.manual || route.points.length < 2) return;

      const routeLayer = route.layer ?? 'top';
      const traceY = routeLayer === 'top' ? boardThickness / 2 + 0.018 : -boardThickness / 2 - 0.018;
      const points = route.points.map(point => to3DCoords(point.x, point.y, traceY));
      const customCopperMaterial = route.color
        ? new THREE.MeshStandardMaterial({ color: route.color, metalness: 0.75, roughness: 0.25 })
        : null;

      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const distance = start.distanceTo(end);
        if (distance < 0.05) continue;

        const traceWidth = Math.max(0.08, route.width ?? 0.18);
        const traceGeo = new THREE.BoxGeometry(traceWidth, 0.018, distance);
        const traceMesh = new THREE.Mesh(traceGeo, customCopperMaterial ?? (routeLayer === 'top' ? topCopperMaterial : bottomCopperMaterial));
        const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        traceMesh.position.copy(midPoint);

        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        traceMesh.rotation.y = Math.atan2(direction.x, direction.z);
        scene.add(traceMesh);
      }
    });

    // 7. Loop de Animação e Renderização
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Atualiza posição da câmera com base nos ângulos esféricos controlados pelo drag do mouse
      const angle = cameraAngleRef.current;
      angle.radius = Math.max(minCameraRadius, Math.min(maxCameraRadius, angle.radius));
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
  }, [pcbComponents, pcbWires, isSimulating, boardColor, boardDimensions, pcbLayout, pcbRoutes, minCameraRadius, maxCameraRadius]);

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
    const radius = Math.max(8, Math.max(boardDimensions.width, boardDimensions.height) * 1.35);
    cameraAngleRef.current = { theta: Math.PI / 4, phi: Math.PI / 3, radius };
    setCameraRadius(radius);
  };

  const zoomIn = () => {
    const nextRadius = Math.max(minCameraRadius, cameraAngleRef.current.radius * 0.82);
    cameraAngleRef.current.radius = nextRadius;
    setCameraRadius(nextRadius);
  };

  const zoomOut = () => {
    const nextRadius = Math.min(maxCameraRadius, cameraAngleRef.current.radius * 1.22);
    cameraAngleRef.current.radius = nextRadius;
    setCameraRadius(nextRadius);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 0.88 : 1.14;
    const nextRadius = Math.max(minCameraRadius, Math.min(maxCameraRadius, cameraAngleRef.current.radius * zoomFactor));
    cameraAngleRef.current.radius = nextRadius;
    setCameraRadius(nextRadius);
  };

  const zoomPercent = Math.round((maxCameraRadius / cameraRadius) * 100);

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
        <div className="px-2 py-1 text-[10px] font-bold text-center text-slate-500 dark:text-slate-400 font-mono">
          {zoomPercent}%
        </div>
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
        onWheel={handleWheel}
      />
    </div>
  );
}
