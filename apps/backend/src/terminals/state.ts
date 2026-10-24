import { getMachineState } from '../machines/machineControl';
import { terminalPollIntervalMs } from '../machines/timing';
import type { TerminalState } from '../types/terminal';
import { toTerminalSummary, type StoredTerminal } from './repository';
import { findEquipment, getLastScan, getSessionInfo } from './sessions';

// Everything the Pi shows: machine, logged-in person, permission and release.
export const getTerminalState = async (terminal: StoredTerminal): Promise<TerminalState> => {
  const equipment = await findEquipment(terminal.equipmentId);
  const [session, machine] = await Promise.all([
    getSessionInfo(terminal.id, equipment),
    getMachineState(terminal, equipment),
  ]);

  return {
    terminal: toTerminalSummary(terminal),
    equipment: equipment
      ? { id: equipment.id, name: equipment.name, isAvailable: equipment.isAvailable }
      : null,
    session,
    machine,
    lastScan: getLastScan(terminal.id),
    pollIntervalMs: terminalPollIntervalMs(),
  };
};
