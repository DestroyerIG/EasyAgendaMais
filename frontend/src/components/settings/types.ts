import { formatPhone } from '@/lib/formatters';

export const DIAS_SEMANA = [
  { id: 'seg', label: 'Segunda' },
  { id: 'ter', label: 'Terça' },
  { id: 'qua', label: 'Quarta' },
  { id: 'qui', label: 'Quinta' },
  { id: 'sex', label: 'Sexta' },
  { id: 'sab', label: 'Sábado' },
  { id: 'dom', label: 'Domingo' },
] as const;

export const INTERVALOS = [
  { value: 0, label: 'Sem intervalo' },
  { value: 15, label: '15 minutos' },
  { value: 20, label: '20 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 45, label: '45 minutos' },
  { value: 60, label: '60 minutos' },
  { value: 90, label: '90 minutos' },
  { value: 120, label: '120 minutos' },
] as const;

export type DiaSemanaId = (typeof DIAS_SEMANA)[number]['id'];
export type DiasAbertosState = Record<DiaSemanaId, boolean>;

export interface SettingsState {
  whatsappInstanceName: string;
  diasAbertos: DiasAbertosState;
  openingTime: string;
  closingTime: string;
  slotIntervalMinutes: number;
  allowWalkins: boolean;
  autoConfirmAppointments: boolean;
  whatsappReminders: boolean;
}

export interface AccountProfileState {
  businessName: string;
  ownerName: string;
  whatsapp: string;
  cpfCnpj: string;
  email: string;
}

export interface PasswordState {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export type FormErrors<T extends string> = Partial<Record<T, string>>;

export const normalizePhoneDigits = (value: string) => value.replace(/\D+/g, '').slice(0, 18);

export const formatPhoneInput = (value: string) => {
  const digits = normalizePhoneDigits(value).slice(0, 11);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return formatPhone(digits);
};
