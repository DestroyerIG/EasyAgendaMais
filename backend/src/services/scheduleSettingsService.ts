import { businessSettingsRepository } from '../repositories/businessSettingsRepository.js';
import logger from '../utils/logger.js';
import { BUSINESS_SCHEDULE_DEFAULTS } from '../config/scheduleDefaults.js';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const ALLOWED_SLOT_INTERVALS = new Set([0, 15, 20, 30, 45, 60, 90, 120]);
const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
type DiaSemana = typeof DIAS_SEMANA[number];

const DEFAULT_DIAS_ABERTOS: Record<DiaSemana, boolean> = {
  seg: true,
  ter: true,
  qua: true,
  qui: true,
  sex: true,
  sab: false,
  dom: false,
};

export const DEFAULT_SCHEDULE_SETTINGS = {
  openingTime: BUSINESS_SCHEDULE_DEFAULTS.openingTime,
  closingTime: BUSINESS_SCHEDULE_DEFAULTS.closingTime,
  slotIntervalMinutes: BUSINESS_SCHEDULE_DEFAULTS.slotIntervalMinutes,
  diasAbertos: { ...DEFAULT_DIAS_ABERTOS },
  allowWalkins: BUSINESS_SCHEDULE_DEFAULTS.allowWalkins,
  autoConfirmAppointments: BUSINESS_SCHEDULE_DEFAULTS.autoConfirmAppointments,
  timezone: DEFAULT_TIMEZONE,
};

export interface ScheduleSettings {
  openingTime?: string;
  closingTime?: string;
  slotIntervalMinutes?: unknown;
  diasAbertos?: unknown;
  allowWalkins?: unknown;
  autoConfirmAppointments?: unknown;
  timezone?: unknown;
}

export interface NormalizedScheduleSettings {
  openingTime: string;
  closingTime: string;
  slotIntervalMinutes: number;
  diasAbertos: Record<DiaSemana, boolean>;
  allowWalkins: boolean;
  autoConfirmAppointments: boolean;
  timezone: string;
}

const BOOLEAN_TRUE_VALUES = new Set<unknown>([true, 1, '1', 'true']);

const toMinutes = (timeValue: string): number => {
  const [hours = 0, minutes = 0] = timeValue.split(':').map(Number);
  return (hours * 60) + minutes;
};

const fromMinutes = (totalMinutes: number): string => {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    return BOOLEAN_TRUE_VALUES.has(value.trim().toLowerCase());
  }

  return BOOLEAN_TRUE_VALUES.has(value);
};

const normalizeTime = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();

  if (/^\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized.slice(0, 5);
  }

  return fallback;
};

const normalizeSlotInterval = (value: unknown): number => {
  const numeric = Number(value);

  if (Number.isInteger(numeric) && ALLOWED_SLOT_INTERVALS.has(numeric)) {
    return numeric;
  }

  return DEFAULT_SCHEDULE_SETTINGS.slotIntervalMinutes;
};

const normalizeDiasAbertos = (value: unknown): Record<DiaSemana, boolean> => {
  if (Array.isArray(value)) {
    const selected = new Set(value.map((day) => String(day || '').trim().toLowerCase()));
    return DIAS_SEMANA.reduce((acc, day) => ({
      ...acc,
      [day]: selected.has(day),
    }), {} as Record<DiaSemana, boolean>);
  }

  if (value && typeof value === 'object') {
    const objValue = value as Record<string, unknown>;
    return DIAS_SEMANA.reduce((acc, day) => ({
      ...acc,
      [day]: objValue[day] === true,
    }), {} as Record<DiaSemana, boolean>);
  }

  return { ...DEFAULT_DIAS_ABERTOS };
};

const normalizeTimezone = (value: unknown): string => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  const fromEnv = process.env.BUSINESS_TIMEZONE || process.env.APP_TIMEZONE || process.env.TZ || '';
  const preferred = candidate || fromEnv || DEFAULT_TIMEZONE;

  try {
    Intl.DateTimeFormat('pt-BR', { timeZone: preferred }).format(new Date());
    return preferred;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

const getClockInTimezone = (currentDate: Date, timeZone: string): { hours: number; minutes: number; totalMinutes: number } => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(currentDate);

  const hourPart = parts.find((part) => part.type === 'hour');
  const minutePart = parts.find((part) => part.type === 'minute');

  const hours = Number(hourPart?.value || 0);
  const minutes = Number(minutePart?.value || 0);

  return {
    hours,
    minutes,
    totalMinutes: (hours * 60) + minutes,
  };
};

const getDateInTimezone = (currentDate: Date, timeZone: string): string | null => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(currentDate);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
};

const getDiaSemanaFromDate = (dateValue: Date | string): DiaSemana | null => {
  const date = dateValue instanceof Date ? dateValue : new Date(`${dateValue}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return ((['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as DiaSemana[])[date.getDay()]) ?? null;
};

const normalizeBookedTimes = (bookedTimes: unknown[] = []): Set<string> => {
  const normalized = new Set<string>();

  for (const bookedTime of bookedTimes) {
    const time = normalizeTime(String(bookedTime || ''), '');
    if (time) {
      normalized.add(time);
    }
  }

  return normalized;
};

export const normalizeScheduleSettings = (settings: ScheduleSettings = {}): NormalizedScheduleSettings => {
  const openingTime = normalizeTime(settings.openingTime, DEFAULT_SCHEDULE_SETTINGS.openingTime);
  const closingTime = normalizeTime(settings.closingTime, DEFAULT_SCHEDULE_SETTINGS.closingTime);

  let normalizedOpening = openingTime;
  let normalizedClosing = closingTime;

  if (toMinutes(normalizedClosing) <= toMinutes(normalizedOpening)) {
    normalizedOpening = DEFAULT_SCHEDULE_SETTINGS.openingTime;
    normalizedClosing = DEFAULT_SCHEDULE_SETTINGS.closingTime;
  }

  return {
    openingTime: normalizedOpening,
    closingTime: normalizedClosing,
    slotIntervalMinutes: normalizeSlotInterval(settings.slotIntervalMinutes),
    diasAbertos: normalizeDiasAbertos(settings.diasAbertos),
    allowWalkins: normalizeBoolean(settings.allowWalkins, DEFAULT_SCHEDULE_SETTINGS.allowWalkins),
    autoConfirmAppointments: normalizeBoolean(settings.autoConfirmAppointments, DEFAULT_SCHEDULE_SETTINGS.autoConfirmAppointments),
    timezone: normalizeTimezone(settings.timezone),
  };
};

export const getBusinessScheduleSettings = async (businessId: string): Promise<NormalizedScheduleSettings> => {
  try {
    const settings = await businessSettingsRepository.findOperationalSettingsByBusinessId(businessId);

    if (!settings) {
      logger.warn(
        { businessId },
        'Configuracao operacional nao encontrada; aplicando fallback seguro para o atendimento'
      );
      return { ...DEFAULT_SCHEDULE_SETTINGS };
    }

    const normalized = normalizeScheduleSettings(settings as ScheduleSettings);

    logger.debug(
      {
        businessId,
        openingTime: normalized.openingTime,
        closingTime: normalized.closingTime,
        slotIntervalMinutes: normalized.slotIntervalMinutes,
        diasAbertos: normalized.diasAbertos,
        allowWalkins: normalized.allowWalkins,
        autoConfirmAppointments: normalized.autoConfirmAppointments,
        timezone: normalized.timezone,
      },
      'Configuracao operacional carregada para o bot'
    );

    return normalized;
  } catch (error) {
    logger.error(
      { err: error, businessId },
      'Falha ao carregar configuracao operacional; aplicando fallback seguro para o atendimento'
    );

    return { ...DEFAULT_SCHEDULE_SETTINGS };
  }
};

export const formatBusinessHoursRange = (settings: ScheduleSettings = {}): string => {
  const normalized = normalizeScheduleSettings(settings);
  return `${normalized.openingTime} as ${normalized.closingTime}`;
};

export const isWithinBusinessHours = (settings: ScheduleSettings = {}, currentDate: Date = new Date()): boolean => {
  const normalized = normalizeScheduleSettings(settings);
  const now = getClockInTimezone(currentDate, normalized.timezone).totalMinutes;
  const openingMinutes = toMinutes(normalized.openingTime);
  const closingMinutes = toMinutes(normalized.closingTime);

  return now >= openingMinutes && now < closingMinutes;
};

export const isBusinessOpenOnDate = (settings: ScheduleSettings = {}, selectedDate: Date | string = new Date()): boolean => {
  const normalized = normalizeScheduleSettings(settings);
  const diaSemana = getDiaSemanaFromDate(selectedDate);

  if (!diaSemana) {
    return true;
  }

  return normalized.diasAbertos[diaSemana] === true;
};

interface GenerateSlotsOptions {
  serviceDurationMinutes?: number;
  bookedTimes?: unknown[];
  currentDate?: Date;
  blockedRanges?: Array<{ start: string; end: string }>;
}

export const generateAvailableTimeSlots = (
  settings: ScheduleSettings = {},
  selectedDate: string | null | undefined,
  {
    serviceDurationMinutes,
    bookedTimes = [],
    currentDate = new Date(),
    blockedRanges = [],
  }: GenerateSlotsOptions = {}
): string[] => {
  const normalized = normalizeScheduleSettings(settings);
  if (!isBusinessOpenOnDate(normalized, selectedDate || currentDate)) {
    return [];
  }

  const openingMinutes = toMinutes(normalized.openingTime);
  const closingMinutes = toMinutes(normalized.closingTime);
  const duration = Number.isInteger(serviceDurationMinutes) && (serviceDurationMinutes as number) > 0
    ? serviceDurationMinutes as number
    : DEFAULT_SCHEDULE_SETTINGS.slotIntervalMinutes;
  const slotStep = normalized.slotIntervalMinutes > 0 ? normalized.slotIntervalMinutes : duration;

  const normalizedBookedTimes = normalizeBookedTimes(bookedTimes);

  let firstSlotMinute = openingMinutes;

  const todayInTimezone = getDateInTimezone(currentDate, normalized.timezone);
  if (selectedDate && todayInTimezone && selectedDate === todayInTimezone) {
    const nowMinutes = getClockInTimezone(currentDate, normalized.timezone).totalMinutes;

    if (nowMinutes > openingMinutes) {
      const elapsed = nowMinutes - openingMinutes;
      const nextStep = Math.ceil(elapsed / slotStep);
      firstSlotMinute = openingMinutes + (nextStep * slotStep);
    }
  }

  const availableSlots: string[] = [];

  for (let minute = firstSlotMinute; minute + duration <= closingMinutes; minute += slotStep) {
    const slot = fromMinutes(minute);
    const cruzaBloqueio = blockedRanges.some(({ start, end }) => {
      const ini = toMinutes(start);
      const fim = toMinutes(end);
      return minute < fim && minute + duration > ini;
    });
    if (!normalizedBookedTimes.has(slot) && !cruzaBloqueio) {
      availableSlots.push(slot);
    }
  }

  return availableSlots;
};
