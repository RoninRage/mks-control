export type TagEventSource = 'acr122u' | 'webnfc' | 'manual';

export type ReaderStatus = 'attached' | 'detached';

export interface MemberSummary {
  id: string;
  firstName: string;
  lastName: string;
  roles: string[];
  preferredTheme?: 'light' | 'dark' | 'auto';
}

export interface TagEvent {
  type: 'tag';
  uid: string;
  ts: string;
  source: TagEventSource;
  device: string;
  isAdmin?: boolean;
  memberFound?: boolean;
  isInactive?: boolean;
  member?: MemberSummary;
}

export interface ReaderEvent {
  type: 'reader';
  status: ReaderStatus;
  ts: string;
  source: TagEventSource;
  device: string;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  ts: string;
  source: TagEventSource;
  device: string;
}

export interface ReaderErrorEvent {
  type: 'reader-error';
  ts: string;
  source: TagEventSource;
  device: string;
  error: string;
}

export type AuthEvent =
  | TagEvent
  | ReaderEvent
  | HeartbeatEvent
  | ReaderErrorEvent
  | TerminalStateEvent;

export interface Area {
  _id?: string;
  _rev?: string;
  type?: 'area';
  id: string;
  name: string;
  description: string;
  bereichsleiterIds?: string[];
  isActive?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AreaWithMeta extends Area {
  _id: string;
  _rev: string;
}

export interface Equipment {
  _id?: string;
  _rev?: string;
  type?: 'equipment';
  id: string;
  name: string;
  configuration?: string;
  areaId?: string;
  isAvailable: boolean;
  isActive?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  // Shelly output that powers this machine (docs/shelly-plan.md, phase 3).
  control?: EquipmentControl;
}

export interface EquipmentWithMeta extends Equipment {
  _id: string;
  _rev: string;
}

export interface Tag {
  _id?: string;
  _rev?: string;
  id: string;
  tagUid: string;
  memberId: string;
  createdAt?: string;
  updatedAt?: string;
  isActive: boolean;
}

export interface CreateTagRequest {
  tagUid: string;
  memberId: string;
}

export interface Member {
  _id?: string;
  _rev?: string;
  id: string;
  // Business membership number from the Vereinsplaner (e.g. "[A]-1006"), distinct from the
  // CouchDB-internal `id`. Used as the upsert key for the CSV member import.
  memberId?: string;
  firstName: string;
  lastName: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles: string[];
  joinDate: string;
  isActive: boolean;
  preferredTheme?: 'light' | 'dark' | 'auto';
  equipmentPermissions?: Record<string, boolean>;
  tags?: Tag[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMemberRequest {
  firstName: string;
  lastName: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles?: string[];
}

export interface UpdateMemberRequest {
  firstName?: string;
  lastName?: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles?: string[];
  preferredTheme?: 'light' | 'dark' | 'auto';
  isActive?: boolean;
  equipmentPermissions?: Record<string, boolean>;
}

// Per-row failure reported by the CSV member import (POST /api/members/import).
export interface MemberImportError {
  row: number;
  memberId: string;
  reason: string;
}

// Result returned by the CSV member import endpoint.
export interface MemberImportResult {
  success: boolean;
  summary: {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
  };
  errors: MemberImportError[];
}

// ---------------------------------------------------------------------------
// Shelly devices (machine control, phase 1: drivers and device management)
// ---------------------------------------------------------------------------

// Kinds of Shelly components the backend can read or control.
// 'meter' covers stand-alone power meters (Gen2 pm1/em/em1, Gen1 emeters).
export type ShellyComponentKind = 'switch' | 'input' | 'light' | 'cover' | 'meter';

export type ShellyHealth = 'online' | 'offline' | 'unknown';

export interface ShellyComponent {
  kind: ShellyComponentKind;
  index: number;
  // True when the component itself measures power (e.g. switch on a Plus 1PM).
  hasPowerMeter?: boolean;
}

// Result of probing a host: everything needed to create a ShellyDevice.
export interface ShellyProbeResult {
  host: string;
  shellyId: string;
  mac: string;
  model: string;
  // 1 = Gen1 REST API, 2+ = Gen2/Gen3/Gen4 JSON-RPC API.
  gen: number;
  firmware?: string;
  name?: string;
  authRequired: boolean;
  components: ShellyComponent[];
}

export interface ShellyDevice {
  _id?: string;
  _rev?: string;
  type?: 'shellyDevice';
  id: string;
  shellyId: string;
  mac: string;
  model: string;
  gen: number;
  host: string;
  name: string;
  firmware?: string;
  components: ShellyComponent[];
  health: ShellyHealth;
  lastSeenAt?: string;
  isActive: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Live state of one component. Only the fields that fit the kind are set.
export interface ShellyComponentStatus {
  kind: ShellyComponentKind;
  index: number;
  on?: boolean; // switch, light
  brightness?: number; // light, 0-100
  inputState?: boolean | null; // input (null for analog/button inputs without state)
  coverState?: string; // cover: open, closed, opening, closing, stopped, ...
  positionPct?: number; // cover, 0-100 when calibrated
  powerW?: number;
  voltageV?: number;
  currentA?: number;
  energyWh?: number; // total energy counter
}

export interface ShellyDeviceStatus {
  deviceId: string;
  health: ShellyHealth;
  checkedAt: string;
  components: ShellyComponentStatus[];
  error?: string;
}

export interface CreateShellyDeviceRequest {
  host: string;
  name?: string;
}

export interface UpdateShellyDeviceRequest {
  name?: string;
  host?: string;
}

// ---------------------------------------------------------------------------
// Terminals (one Raspberry Pi per machine; phase 2: keys and login at the Pi)
// ---------------------------------------------------------------------------

export interface Terminal {
  _id?: string;
  _rev?: string;
  type?: 'terminal';
  id: string;
  name: string;
  equipmentId: string;
  // SHA-256 of the terminal key. The key itself is only shown once, when it is created.
  tokenHash?: string;
  // Longest release at this Pi before it asks "Noch da?". Empty = never ask.
  maxSessionMinutes?: number;
  // Time to answer "Noch da?" before the machine is switched off. Default 5.
  stillThereTimeoutMinutes?: number;
  lastSeenAt?: string;
  isActive: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Terminal as returned by the admin API (never contains the key hash).
export type TerminalSummary = Omit<Terminal, 'tokenHash'>;

export interface CreateTerminalRequest {
  name: string;
  equipmentId: string;
  maxSessionMinutes?: number | null;
  stillThereTimeoutMinutes?: number | null;
}

export type UpdateTerminalRequest = Partial<CreateTerminalRequest>;

// Returned once on create and on key rotation.
export interface TerminalTokenResponse {
  terminal: TerminalSummary;
  token: string;
}

// Why a member may not release the machine at this terminal.
export type TerminalDenyReason = 'no-permission' | 'equipment-unavailable';

// Why the machine cannot be released right now, independent of who is logged in.
export type MachineBlockReason = 'not-configured' | 'device-offline' | 'interlock-open';

export interface TerminalSessionInfo {
  memberId: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  // True when the member may release the machine (permission, or admin override).
  canRelease: boolean;
  // True when only the admin override allows it.
  adminOverride: boolean;
  denyReason?: TerminalDenyReason;
  startedAt: string;
  expiresAt: string;
}

export type TerminalScanResult = 'login' | 'logout' | 'unknown-tag' | 'inactive-member';

export interface TerminalLastScan {
  result: TerminalScanResult;
  at: string;
}

export interface MachineReleaseInfo {
  usageId: string;
  memberId: string | null;
  memberName: string;
  startedAt: string;
  adminOverride: boolean;
  // Set while the Pi asks "Noch da?"; the machine is switched off at the deadline.
  stillThere?: { askedAt: string; deadline: string };
  // Set after logout in "when idle" mode: the machine runs until it is idle.
  shuttingDown?: { since: string; deadline: string; idleThresholdW: number };
}

export interface TerminalMachineState {
  // Shelly output configured for this machine.
  configured: boolean;
  online: boolean;
  on?: boolean;
  // Power metering available (output's own or a separate meter).
  metered: boolean;
  shutdownMode?: MachineShutdown['mode'];
  powerW?: number;
  blockReason?: MachineBlockReason;
  release: MachineReleaseInfo | null;
  // Safety inputs; ok is null while an input cannot be read.
  interlocks: Array<{ label: string; ok: boolean | null }>;
  // Extra controls on the Pi (only usable while the machine is released).
  extras: MachineExtraState[];
}

export interface MachineExtraState {
  id: string;
  label: string;
  kind: MachineExtraKind;
  online: boolean;
  on?: boolean;
  brightness?: number;
  coverState?: string;
  positionPct?: number;
}

export interface TerminalState {
  terminal: TerminalSummary;
  equipment: { id: string; name: string; isAvailable: boolean } | null;
  session: TerminalSessionInfo | null;
  machine: TerminalMachineState;
  lastScan?: TerminalLastScan;
  // How often the Pi should poll; missing polls mean the Pi is offline.
  pollIntervalMs: number;
}

// WebSocket notice that a terminal's state changed. Contains no member data;
// the Pi fetches the details with its key from GET /api/terminal/state.
export interface TerminalStateEvent {
  type: 'terminal-state';
  terminalId: string;
  ts: string;
}

// ---------------------------------------------------------------------------
// Machine control (phase 3: release, safety timer, "Noch da?", usage records)
// ---------------------------------------------------------------------------

export type MachineControlKind = 'switch' | 'light';

// What happens to the machine when the release ends by logout or "Noch da?" timeout.
export type MachineShutdown =
  | { mode: 'immediate' }
  | {
      // Keep running until the machine is idle (job finished), then switch off.
      mode: 'when-idle';
      idleThresholdW: number; // below this power the machine counts as idle
      idleSeconds: number; // ... for this long
      maxWaitMinutes: number; // switch off after this at the latest
    };

// A Shelly component that measures the machine's power.
export interface MachineMeterRef {
  deviceId: string;
  kind: ShellyComponentKind;
  index: number;
}

export interface EquipmentControl {
  deviceId: string;
  kind: MachineControlKind;
  index: number;
  // Safety timer on the Shelly; the backend renews it while the release lasts.
  watchdogMinutes: number;
  shutdown: MachineShutdown;
  // Separate power meter. Without it, the output's own metering is used if it has one.
  meter?: MachineMeterRef;
  // Inputs that must be in their safe state (e.g. lid closed) to release and keep running.
  interlocks?: MachineInterlock[];
  // Extra outputs operated at the Pi while the machine is released (dimmer, blinds, extraction).
  extras?: MachineExtra[];
}

// A Shelly input wired to a safety contact. Not a replacement for an emergency stop.
export interface MachineInterlock {
  deviceId: string;
  index: number;
  label: string;
  // Safe state of the contact: "closed" (input on) or "open" (input off).
  okWhen: 'closed' | 'open';
}

export type MachineExtraKind = 'switch' | 'light' | 'cover';

export interface MachineExtra {
  id: string;
  label: string;
  deviceId: string;
  kind: MachineExtraKind;
  index: number;
  // Switch this output off when the release ends (e.g. extraction). Not for covers.
  offWithMachine: boolean;
}

export type MachineExtraAction = 'on' | 'off' | 'open' | 'close' | 'stop';

export interface MachineExtraRequest {
  action: MachineExtraAction;
  brightness?: number;
}

export interface SetEquipmentControlRequest {
  deviceId: string;
  kind: MachineControlKind;
  index: number;
  watchdogMinutes?: number;
  shutdown?: MachineShutdown;
  meter?: MachineMeterRef | null;
  interlocks?: MachineInterlock[];
  // id may be omitted for new extras; the backend assigns one.
  extras?: Array<Omit<MachineExtra, 'id'> & { id?: string }>;
}

export type UsageEndReason =
  | 'logout'
  | 'timeout'
  | 'admin'
  | 'device-offline'
  | 'terminal-offline'
  | 'system'
  // Another permitted member took over while the machine was waiting to switch off.
  | 'handover'
  // A safety input left its safe state (e.g. lid opened).
  | 'interlock';

// One release of a machine. Open (no endedAt) while the machine is released.
export interface EquipmentUsage {
  _id?: string;
  _rev?: string;
  type?: 'equipmentUsage';
  id: string;
  equipmentId: string;
  terminalId: string;
  memberId: string | null;
  memberName: string;
  adminOverride: boolean;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  endReason?: UsageEndReason;
  // Energy counter of the meter at the start, and the energy used (end minus start).
  startEnergyWh?: number;
  energyWh?: number;
  // Set when the member logged out in "when idle" mode; the machine runs until idle.
  shutdownRequestedAt?: string;
  shutdownReason?: UsageEndReason;
}

export interface EquipmentUsageView extends EquipmentUsage {
  equipmentName: string;
}

export interface UsageListResponse {
  usages: EquipmentUsageView[];
  totals: { count: number; durationSec: number; energyWh: number };
}
