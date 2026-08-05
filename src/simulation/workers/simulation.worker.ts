import { runSimulationStep } from '../core/solver';
import type { SolverState } from '../core/solver';
import type { CircuitComponent, CircuitWire } from '../../types/circuit';

let components: CircuitComponent[] = [];
let wires: CircuitWire[] = [];
let solverState: SolverState = {
  capacitorVoltages: {},
  capacitorCurrents: {},
  inductorVoltages: {},
  inductorCurrents: {},
  time: 0,
  nodeVoltages: {}
};

let isRunning = false;
let intervalId: any = null;
let simulationSpeed = 1;
let timestep = 0.0001; // 100 microseconds
let stepsPerTick = 10; // Roda 10 passos por tick de 16ms para simulação rápida

function tick() {
  if (!isRunning) return;

  try {
    let nextSolverState = { ...solverState };

    // Executa múltiplos passos por tick e envia sub-amostras para densidade perfeita da onda no osciloscópio
    const loops = Math.round(stepsPerTick * simulationSpeed);
    const sampleInterval = Math.max(1, Math.floor(loops / 8));

    for (let i = 0; i < loops; i++) {
      const step = runSimulationStep(components, wires, nextSolverState, timestep);
      nextSolverState = step.nextState;

      if (i % sampleInterval === 0 || i === loops - 1) {
        self.postMessage({
          type: 'results',
          data: step.result,
          time: nextSolverState.time
        });
      }
    }

    solverState = nextSolverState;
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      message: error.message || 'Erro numérico inesperado durante a simulação.'
    });
    stopSimulation();
  }
}

function startSimulation() {
  if (isRunning) return;
  isRunning = true;
  
  // Roda o loop a ~60fps (16ms)
  intervalId = setInterval(tick, 16);
}

function stopSimulation() {
  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function resetSimulation() {
  solverState = {
    capacitorVoltages: {},
    capacitorCurrents: {},
    inductorVoltages: {},
    inductorCurrents: {},
    time: 0,
    nodeVoltages: {}
  };
  self.postMessage({
    type: 'resetDone'
  });
  if (isRunning) {
    tick();
  }
}

// Escuta as mensagens da thread principal
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'start':
      startSimulation();
      break;
    case 'stop':
      stopSimulation();
      break;
    case 'reset':
      resetSimulation();
      break;
    case 'update':
      components = data.components || [];
      wires = data.wires || [];
      break;
    case 'setSettings':
      simulationSpeed = data.speed ?? simulationSpeed;
      timestep = data.timestep ?? timestep;
      stepsPerTick = Math.max(1, Math.round(0.0016 / timestep)); // Tenta manter a taxa em tempo real
      break;
  }
});
export {};
