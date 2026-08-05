import { useStore } from '../../state/useStore';
import type { CircuitComponent, CircuitWire, SimulationResult } from '../../types/circuit';
import { runSimulationStep } from '../core/solver';
import type { SolverState } from '../core/solver';

class SimulationManager {
  private worker: Worker | null = null;
  private isFallbackMode = false;
  private fallbackIntervalId: any = null;
  
  // Estados locais para modo de fallback
  private fallbackComponents: CircuitComponent[] = [];
  private fallbackWires: CircuitWire[] = [];
  private fallbackSolverState: SolverState = {
    capacitorVoltages: {},
    capacitorCurrents: {},
    inductorVoltages: {},
    inductorCurrents: {},
    time: 0,
    nodeVoltages: {},
    probePeaks: {},
    probeDisplayValues: {},
    probeDisplayTimes: {}
  };

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.isFallbackMode = true;
      return;
    }

    try {
      // Criação do worker usando URL nativa no Vite
      this.worker = new Worker(
        new URL('./simulation.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event) => {
        const { type, data, message, time } = event.data;

        if (type === 'results') {
          this.handleSimulationResults(data, time);
        } else if (type === 'error') {
          console.error('Erro na simulação do worker:', message);
          useStore.getState().setIsSimulating(false);
          alert(`Erro na simulação: ${message}`);
        }
      };
    } catch (e) {
      console.warn('Falha ao inicializar o Web Worker. Rodando em modo de compatibilidade na thread principal.', e);
      this.isFallbackMode = true;
    }
  }

  // Envia circuito atualizado para o worker ou salva localmente no fallback
  public updateCircuit(components: CircuitComponent[], wires: CircuitWire[]) {
    if (this.isFallbackMode) {
      this.fallbackComponents = components;
      this.fallbackWires = wires;
      return;
    }

    if (this.worker) {
      this.worker.postMessage({
        type: 'update',
        data: { components, wires }
      });
    }
  }

  // Atualiza parâmetros da simulação
  public updateSettings(speed: number, timestep: number) {
    if (this.worker && !this.isFallbackMode) {
      this.worker.postMessage({
        type: 'setSettings',
        data: { speed, timestep }
      });
    }
  }

  public start() {
    if (this.isFallbackMode) {
      this.startFallbackLoop();
      return;
    }

    if (this.worker) {
      const { simulationSpeed, timestep } = useStore.getState();
      this.updateSettings(simulationSpeed, timestep);
      this.worker.postMessage({ type: 'start' });
    }
  }

  public stop() {
    if (this.isFallbackMode) {
      this.stopFallbackLoop();
      return;
    }

    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
    }
  }

  public reset() {
    if (this.isFallbackMode) {
      this.fallbackSolverState = {
        capacitorVoltages: {},
        capacitorCurrents: {},
        inductorVoltages: {},
        inductorCurrents: {},
        time: 0,
        nodeVoltages: {},
        probePeaks: {},
        probeDisplayValues: {},
        probeDisplayTimes: {}
      };
      this.handleSimulationResults({ nodeVoltages: {}, branchCurrents: {}, wireCurrents: {}, componentStates: {} }, 0);
      return;
    }

    if (this.worker) {
      this.worker.postMessage({ type: 'reset' });
    }
  }

  // Processa as medições calculadas e injeta no estado do Zustand
  private handleSimulationResults(results: SimulationResult, time: number) {
    const store = useStore.getState();
    if (!store.isSimulating && time > 0) {
      return;
    }
    
    // Atualiza o estado de simulação de cada componente
    const updatedComponents = store.components.map(comp => {
      const state = results.componentStates[comp.id];
      if (state) {
        return {
          ...comp,
          simulationState: {
            voltage: state.voltage,
            current: state.current,
            power: state.power,
            custom: state.custom,
            isBurned: state.isBurned,
            burnMessage: state.burnMessage
          }
        };
      }
      return comp;
    });

    const updatedWires = store.wires.map(wire => {
      const current = results.wireCurrents?.[wire.id];
      if (current !== undefined) {
        return {
          ...wire,
          simulationState: { current }
        };
      }
      return wire;
    });

    // Atualiza o estado no store de forma que não gere loops infinitos
    useStore.setState({
      components: updatedComponents,
      wires: updatedWires
      // Armazena as tensões dos nós no store se precisarmos
    });

    // Dispara evento customizado para notificar o Canvas para redesenhar
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('circuit-simulation-tick', { 
        detail: { results, time } 
      }));
    }
  }

  // --- Modo de Fallback na Thread Principal ---
  private startFallbackLoop() {
    if (this.fallbackIntervalId) return;

    const tick = () => {
      const { simulationSpeed, timestep } = useStore.getState();
      
      try {
        let currentResult: SimulationResult | null = null;
        const steps = Math.max(1, Math.round(10 * simulationSpeed));
        
        for (let i = 0; i < steps; i++) {
          const step = runSimulationStep(
            this.fallbackComponents,
            this.fallbackWires,
            this.fallbackSolverState,
            timestep
          );
          currentResult = step.result;
          this.fallbackSolverState = step.nextState;
        }

        if (currentResult) {
          this.handleSimulationResults(currentResult, this.fallbackSolverState.time);
        }
      } catch (err: any) {
        console.error('Erro na simulação local:', err);
        this.stopFallbackLoop();
        useStore.getState().setIsSimulating(false);
        alert(`Erro na simulação: ${err.message || err}`);
      }
    };

    // Roda a ~60fps
    this.fallbackIntervalId = setInterval(tick, 16);
  }

  private stopFallbackLoop() {
    if (this.fallbackIntervalId) {
      clearInterval(this.fallbackIntervalId);
      this.fallbackIntervalId = null;
    }
  }
}

export const simulationManager = new SimulationManager();
export default simulationManager;
