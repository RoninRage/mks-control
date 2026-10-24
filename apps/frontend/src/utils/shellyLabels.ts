import type {
  ShellyComponent,
  ShellyComponentKind,
  ShellyComponentStatus,
  ShellyHealth,
} from '@mks-control/shared-types';

// German labels and icons for Shelly components, shared by the device pages.

export const KIND_LABELS: Record<ShellyComponentKind, string> = {
  switch: 'Relais',
  input: 'Eingang',
  light: 'Licht',
  cover: 'Rollladen',
  meter: 'Messung',
};

export const KIND_ICONS: Record<ShellyComponentKind, string> = {
  switch: 'power',
  input: 'input',
  light: 'lightbulb',
  cover: 'blinds',
  meter: 'bolt',
};

export const HEALTH_LABELS: Record<ShellyHealth, string> = {
  online: 'Online',
  offline: 'Offline',
  unknown: 'Unbekannt',
};

export const HEALTH_COLORS: Record<ShellyHealth, string> = {
  online: 'positive',
  offline: 'negative',
  unknown: 'grey-6',
};

const COVER_STATES: Record<string, string> = {
  open: 'Offen',
  opening: 'Öffnet',
  closed: 'Geschlossen',
  close: 'Schließt',
  closing: 'Schließt',
  stopped: 'Gestoppt',
  stop: 'Gestoppt',
  calibrating: 'Kalibriert',
};

export const componentLabel = (component: Pick<ShellyComponent, 'kind' | 'index'>): string =>
  `${KIND_LABELS[component.kind]} ${component.index + 1}`;

const formatNumber = (value: number, digits: number): string =>
  value.toLocaleString('de-DE', { maximumFractionDigits: digits });

// Short text describing the live state, e.g. "An · 123 W" or "Geschlossen · 40 %".
export const describeStatus = (status: ShellyComponentStatus): string => {
  const parts: string[] = [];

  switch (status.kind) {
    case 'switch':
      if (status.on !== undefined) parts.push(status.on ? 'An' : 'Aus');
      break;
    case 'light':
      if (status.on !== undefined) parts.push(status.on ? 'An' : 'Aus');
      if (status.on && status.brightness !== undefined) parts.push(`${status.brightness} %`);
      break;
    case 'cover':
      if (status.coverState) parts.push(COVER_STATES[status.coverState] ?? status.coverState);
      if (status.positionPct !== undefined) parts.push(`${status.positionPct} %`);
      break;
    case 'input':
      if (status.inputState === null || status.inputState === undefined) {
        parts.push('ohne Zustand');
      } else {
        parts.push(status.inputState ? 'Geschlossen' : 'Offen');
      }
      break;
    case 'meter':
      break;
  }

  if (status.powerW !== undefined) parts.push(`${formatNumber(status.powerW, 1)} W`);
  if (status.kind === 'meter' && status.energyWh !== undefined) {
    parts.push(`${formatNumber(status.energyWh / 1000, 2)} kWh`);
  }

  return parts.join(' · ') || '–';
};
