import type { CircuitComponent, CircuitWire } from '../../types/circuit';

export const SCHEMATIC_ONLY_PCB_TYPES = new Set([
  'junction',
  'ground',
  'source_dc',
  'bench_supply',
  'source_ac',
  'source_pulse',
  'function_generator',
  'source_current',
  'voltmeter',
  'ammeter',
  'multimeter',
  'oscilloscope',
  'logic_analyzer',
  'megohmmeter',
  'net_label',
  'probe_dc',
  'probe_ac'
]);

export const isPcbPhysicalComponent = (component: CircuitComponent) => (
  !SCHEMATIC_ONLY_PCB_TYPES.has(component.type)
);

const terminalKey = (componentId: string, terminalId: string) => `${componentId}:${terminalId}`;

export function getPcbPhysicalComponents(components: CircuitComponent[]) {
  return components.filter(isPcbPhysicalComponent);
}

export function getPcbConnections(components: CircuitComponent[], wires: CircuitWire[]): CircuitWire[] {
  const physicalIds = new Set(getPcbPhysicalComponents(components).map(component => component.id));
  const parent: Record<string, string> = {};

  const find = (key: string): string => {
    if (!parent[key]) parent[key] = key;
    if (parent[key] === key) return key;
    parent[key] = find(parent[key]);
    return parent[key];
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  };

  components.forEach(component => {
    component.terminals.forEach(terminal => {
      find(terminalKey(component.id, terminal.id));
    });
  });

  const coords: Record<string, string[]> = {};
  components.forEach(component => {
    component.terminals.forEach(terminal => {
      const key = `${terminal.x},${terminal.y}`;
      coords[key] = [...(coords[key] || []), terminalKey(component.id, terminal.id)];
    });
  });

  Object.values(coords).forEach(keys => {
    for (let i = 1; i < keys.length; i++) union(keys[0], keys[i]);
  });

  wires.forEach(wire => {
    union(
      terminalKey(wire.from.componentId, wire.from.terminalId),
      terminalKey(wire.to.componentId, wire.to.terminalId)
    );
  });

  const nets: Record<string, Array<{ componentId: string; terminalId: string }>> = {};
  components.forEach(component => {
    component.terminals.forEach(terminal => {
      if (!physicalIds.has(component.id)) return;
      const key = terminalKey(component.id, terminal.id);
      const root = find(key);
      nets[root] = [...(nets[root] || []), { componentId: component.id, terminalId: terminal.id }];
    });
  });

  const connections: CircuitWire[] = [];
  const seen = new Set<string>();

  Object.values(nets).forEach(terminals => {
    if (terminals.length < 2) return;
    const [hub, ...others] = terminals;

    others.forEach(target => {
      const pairKey = [terminalKey(hub.componentId, hub.terminalId), terminalKey(target.componentId, target.terminalId)]
        .sort()
        .join('__');

      if (seen.has(pairKey)) return;
      seen.add(pairKey);

      connections.push({
        id: `pcb_${pairKey.replace(/[^a-zA-Z0-9_]+/g, '_')}`,
        from: hub,
        to: target
      });
    });
  });

  return connections;
}
