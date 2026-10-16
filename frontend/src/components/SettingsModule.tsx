'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { RotateCcw, Save, Store } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Banner, Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { getApiErrorCode, getApiErrorMessage } from '@/utils/handleApiError';
import { formatCpfCnpj, isValidCpfCnpj, normalizeCpfCnpjDigits } from '@/utils/cpfCnpj';
import { BusinessProfileSection } from '@/components/settings/BusinessProfileSection';
import { AccountSection } from '@/components/settings/AccountSection';
import { ScheduleSection } from '@/components/settings/ScheduleSection';
import { RemindersSection } from '@/components/settings/RemindersSection';
import { IntegrationsSection } from '@/components/settings/IntegrationsSection';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { ComissaoPadraoSection } from '@/components/settings/ComissaoPadraoSection';
import { CrmSettingsSection } from '@/components/settings/CrmSettingsSection';
import { EtiquetasSection } from '@/components/settings/EtiquetasSection';
import {
  DIAS_SEMANA,
  normalizePhoneDigits,
  formatPhoneInput,
  type AccountProfileState,
  type DiaSemanaId,
  type DiasAbertosState,
  type FormErrors,
  type PasswordState,
  type SettingsState,
} from '@/components/settings/types';

const SETTINGS_STORAGE_KEY = 'easyagenda.settings.v1';

interface SettingsModuleProps {
  initialBusinessName: string;
}

const buildDefaultSettings = (): SettingsState => ({
  whatsappInstanceName: '',
  diasAbertos: {
    seg: true,
    ter: true,
    qua: true,
    qui: true,
    sex: true,
    sab: false,
    dom: false,
  },
  openingTime: '09:00',
  closingTime: '20:00',
  slotIntervalMinutes: 30,
  allowWalkins: true,
  autoConfirmAppointments: false,
  whatsappReminders: true,
});

const buildDefaultAccountProfile = (businessName: string, email: string): AccountProfileState => ({
  businessName: businessName || '',
  ownerName: '',
  whatsapp: '',
  cpfCnpj: '',
  email: email || '',
});

const buildDefaultPasswordState = (): PasswordState => ({
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
});

const shouldUseLocalFallback = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return true;
  }

  const status = error.response?.status;
  if (!status) {
    return true;
  }

  if (status === 404) {
    return true;
  }

  return status >= 500;
};

const normalizeDiasAbertos = (value: unknown, fallback: DiasAbertosState): DiasAbertosState => {
  if (Array.isArray(value)) {
    const selected = new Set(value.map((dia) => String(dia)));
    return DIAS_SEMANA.reduce(
      (acc, dia) => ({
        ...acc,
        [dia.id]: selected.has(dia.id),
      }),
      {} as DiasAbertosState
    );
  }

  if (value && typeof value === 'object') {
    const source = value as Partial<Record<DiaSemanaId, unknown>>;
    return DIAS_SEMANA.reduce(
      (acc, dia) => ({
        ...acc,
        [dia.id]: source[dia.id] === true,
      }),
      {} as DiasAbertosState
    );
  }

  return { ...fallback };
};

const buildSettingsFromPayload = (
  payload: Partial<SettingsState> & { diasAbertos?: unknown },
  fallback: SettingsState
): SettingsState => ({
  ...fallback,
  ...payload,
  diasAbertos: normalizeDiasAbertos(payload.diasAbertos, fallback.diasAbertos),
});

const buildSettingsSavePayload = (settings: SettingsState) => ({
  ...settings,
  diasAbertos: DIAS_SEMANA.filter((dia) => settings.diasAbertos[dia.id]).map((dia) => dia.id),
});

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const getPasswordRequirementsError = (value: string) => {
  if (value.length < 8) {
    return 'A nova senha deve ter pelo menos 8 caracteres.';
  }

  if (!/[A-Z]/.test(value)) {
    return 'A nova senha deve conter pelo menos uma letra maiúscula.';
  }

  if (!/[0-9]/.test(value)) {
    return 'A nova senha deve conter pelo menos um número.';
  }

  return null;
};

const getAccountProfileSaveErrorMessage = (error: unknown) => {
  const code = getApiErrorCode(error);
  const fallbackMessage = getApiErrorMessage(error, 'Não foi possível atualizar os dados cadastrais.');
  const normalizedMessage = fallbackMessage.toLowerCase();

  if (code === 'CONFLICT' || normalizedMessage.includes('e-mail já está em uso') || normalizedMessage.includes('email já cadastrado')) {
    return 'E-mail já está em uso.';
  }

  if (code === 'VALIDATION_ERROR' || normalizedMessage.includes('cpf/cnpj')) {
    if (normalizedMessage.includes('whatsapp')) {
      return 'WhatsApp inválido.';
    }

    if (normalizedMessage.includes('e-mail') || normalizedMessage.includes('email')) {
      return 'E-mail inválido.';
    }

    return 'CPF/CNPJ inválido.';
  }

  return 'Não foi possível atualizar os dados cadastrais.';
};

export function SettingsModule({ initialBusinessName }: SettingsModuleProps) {
  const { user, refreshMe } = useAuth();
  const defaults = useMemo(() => buildDefaultSettings(), []);
  const isTenantAdmin = user?.role === 'tenant_admin';

  const [settings, setSettings] = useState<SettingsState>(defaults);
  const [accountProfile, setAccountProfile] = useState<AccountProfileState>(
    buildDefaultAccountProfile(initialBusinessName, user?.email || '')
  );
  const [passwordForm, setPasswordForm] = useState<PasswordState>(buildDefaultPasswordState());

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);

  const [accountLoading, setAccountLoading] = useState(isTenantAdmin);
  const [accountSaving, setAccountSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [accountErrors, setAccountErrors] = useState<FormErrors<keyof AccountProfileState>>({});
  const [passwordErrors, setPasswordErrors] = useState<FormErrors<keyof PasswordState>>({});

  const { showToast } = useToast();

  useEffect(() => {
    setAccountProfile((prev) => ({
      ...prev,
      businessName: prev.businessName || initialBusinessName || '',
      email: prev.email || user?.email || '',
    }));
  }, [initialBusinessName, user?.email]);

  useEffect(() => {
    const loadSettings = async () => {
      setSettingsLoading(true);

      try {
        const response = await api.get('/business/settings');
        const merged = buildSettingsFromPayload(response.data as Partial<SettingsState>, defaults);

        setSettings(merged);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
        setUsingLocalFallback(false);
      } catch (error: unknown) {
        if (!shouldUseLocalFallback(error)) {
          setSettings(defaults);
          setUsingLocalFallback(false);
          showToast(getApiErrorMessage(error, 'Não foi possível carregar as configurações.'), 'error');
          return;
        }

        try {
          const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
          const parsed = raw ? (JSON.parse(raw) as Partial<SettingsState>) : {};

          setSettings(buildSettingsFromPayload(parsed, defaults));
          setUsingLocalFallback(true);
        } catch {
          setSettings(defaults);
          setUsingLocalFallback(true);
        }
      } finally {
        setSettingsLoading(false);
      }
    };

    loadSettings();
  }, [defaults, showToast]);

  useEffect(() => {
    if (!isTenantAdmin) {
      setAccountLoading(false);
      return;
    }

    const loadAccountProfile = async () => {
      setAccountLoading(true);

      try {
        const response = await api.get('/business/account-profile');
        const data = response.data as AccountProfileState;

        setAccountProfile({
          businessName: data.businessName || initialBusinessName || '',
          ownerName: data.ownerName || '',
          whatsapp: formatPhoneInput(data.whatsapp || ''),
          cpfCnpj: formatCpfCnpj(data.cpfCnpj || ''),
          email: data.email || user?.email || '',
        });
        setAccountErrors({});
      } catch (error: unknown) {
        showToast(getApiErrorMessage(error, 'Não foi possível carregar os dados cadastrais.'), 'error');
      } finally {
        setAccountLoading(false);
      }
    };

    loadAccountProfile();
  }, [initialBusinessName, isTenantAdmin, showToast, user?.email]);

  const updateSettingsField = <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateAccountField = <K extends keyof AccountProfileState>(field: K, value: AccountProfileState[K]) => {
    setAccountProfile((prev) => ({
      ...prev,
      [field]: value,
    }));

    setAccountErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }));
  };

  const updatePasswordField = <K extends keyof PasswordState>(field: K, value: PasswordState[K]) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    setPasswordErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }));
  };

  const validateAccountProfile = () => {
    const nextErrors: FormErrors<keyof AccountProfileState> = {};

    if (!accountProfile.businessName.trim()) {
      nextErrors.businessName = 'Informe o nome do negócio.';
    }

    if (!accountProfile.ownerName.trim()) {
      nextErrors.ownerName = 'Informe o nome do responsável.';
    }

    const whatsappDigits = normalizePhoneDigits(accountProfile.whatsapp);
    if (!whatsappDigits) {
      nextErrors.whatsapp = 'Informe o WhatsApp.';
    } else if (whatsappDigits.length < 10) {
      nextErrors.whatsapp = 'Informe um WhatsApp com DDD válido.';
    }

    const cpfCnpjDigits = normalizeCpfCnpjDigits(accountProfile.cpfCnpj);
    if (!cpfCnpjDigits) {
      nextErrors.cpfCnpj = 'Informe o CPF/CNPJ.';
    } else if (!isValidCpfCnpj(cpfCnpjDigits)) {
      nextErrors.cpfCnpj = 'Informe um CPF/CNPJ válido.';
    }

    if (!accountProfile.email.trim()) {
      nextErrors.email = 'Informe o e-mail da conta.';
    } else if (!isValidEmail(accountProfile.email)) {
      nextErrors.email = 'Informe um e-mail válido.';
    }

    setAccountErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validatePasswordForm = () => {
    const nextErrors: FormErrors<keyof PasswordState> = {};

    if (!passwordForm.currentPassword) {
      nextErrors.currentPassword = 'Informe a senha atual.';
    }

    const passwordRequirementError = getPasswordRequirementsError(passwordForm.newPassword);
    if (!passwordForm.newPassword) {
      nextErrors.newPassword = 'Informe a nova senha.';
    } else if (passwordRequirementError) {
      nextErrors.newPassword = passwordRequirementError;
    }

    if (!passwordForm.confirmNewPassword) {
      nextErrors.confirmNewPassword = 'Confirme a nova senha.';
    } else if (passwordForm.confirmNewPassword !== passwordForm.newPassword) {
      nextErrors.confirmNewPassword = 'A confirmação da nova senha não confere.';
    }

    if (
      passwordForm.currentPassword &&
      passwordForm.newPassword &&
      passwordForm.currentPassword === passwordForm.newPassword
    ) {
      nextErrors.newPassword = 'A nova senha deve ser diferente da senha atual.';
    }

    setPasswordErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveSettings = async () => {
    setSettingsSaving(true);

    try {
      const response = await api.put('/business/settings', buildSettingsSavePayload(settings));
      const merged = buildSettingsFromPayload(response.data as Partial<SettingsState>, settings);

      setSettings(merged);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      setUsingLocalFallback(false);
      showToast('Preferências operacionais salvas com sucesso.', 'success');
    } catch (error: unknown) {
      if (shouldUseLocalFallback(error)) {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        setUsingLocalFallback(true);
        showToast(
          getApiErrorMessage(
            error,
            'Não foi possível salvar no servidor. As preferências ficaram salvas localmente neste navegador.'
          ),
          'error'
        );
      } else {
        setUsingLocalFallback(false);
        showToast(getApiErrorMessage(error, 'Não foi possível salvar as preferências operacionais.'), 'error');
      }
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveAccountProfile = async () => {
    if (!validateAccountProfile()) {
      return;
    }

    setAccountSaving(true);

    try {
      const response = await api.put('/business/account-profile', {
        businessName: accountProfile.businessName.trim(),
        ownerName: accountProfile.ownerName.trim(),
        whatsapp: normalizePhoneDigits(accountProfile.whatsapp),
        cpfCnpj: normalizeCpfCnpjDigits(accountProfile.cpfCnpj),
        email: accountProfile.email.trim().toLowerCase(),
      });

      const data = response.data as AccountProfileState;

      setAccountProfile({
        businessName: data.businessName || accountProfile.businessName.trim(),
        ownerName: data.ownerName || accountProfile.ownerName.trim(),
        whatsapp: formatPhoneInput(data.whatsapp || accountProfile.whatsapp),
        cpfCnpj: formatCpfCnpj(data.cpfCnpj || accountProfile.cpfCnpj),
        email: data.email || accountProfile.email.trim().toLowerCase(),
      });
      setAccountErrors({});
      await refreshMe();
      showToast('Dados cadastrais atualizados com sucesso.', 'success');
    } catch (error: unknown) {
      showToast(getAccountProfileSaveErrorMessage(error), 'error');
    } finally {
      setAccountSaving(false);
    }
  };

  const savePassword = async () => {
    if (!validatePasswordForm()) {
      return;
    }

    setPasswordSaving(true);

    try {
      const response = await api.put('/business/account-password', passwordForm);
      const payload = response.data as { message?: string };

      setPasswordForm(buildDefaultPasswordState());
      setPasswordErrors({});
      await refreshMe();
      showToast(payload.message || 'Senha alterada com sucesso.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível alterar a senha.'), 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  const resetSettings = () => {
    setSettings(defaults);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    showToast('Preferências operacionais restauradas para o padrão.', 'info');
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      {usingLocalFallback && (
        <Banner tone="warning">
          Algumas preferências operacionais estão em modo local por indisponibilidade temporária do servidor.
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BusinessProfileSection
          isTenantAdmin={isTenantAdmin}
          accountLoading={accountLoading}
          accountSaving={accountSaving}
          accountProfile={accountProfile}
          accountErrors={accountErrors}
          onFieldChange={updateAccountField}
          onSave={saveAccountProfile}
        />

        <AccountSection
          isTenantAdmin={isTenantAdmin}
          passwordForm={passwordForm}
          passwordErrors={passwordErrors}
          passwordSaving={passwordSaving}
          onFieldChange={updatePasswordField}
          onSave={savePassword}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ScheduleSection
          settingsLoading={settingsLoading}
          diasAbertos={settings.diasAbertos}
          openingTime={settings.openingTime}
          closingTime={settings.closingTime}
          slotIntervalMinutes={settings.slotIntervalMinutes}
          allowWalkins={settings.allowWalkins}
          autoConfirmAppointments={settings.autoConfirmAppointments}
          onFieldChange={updateSettingsField}
        />

        <RemindersSection
          settingsLoading={settingsLoading}
          whatsappReminders={settings.whatsappReminders}
          onFieldChange={updateSettingsField}
        />

        <IntegrationsSection
          settingsLoading={settingsLoading}
          whatsappInstanceName={settings.whatsappInstanceName}
          onFieldChange={updateSettingsField}
          className="lg:col-span-2"
        />
      </div>

      <ComissaoPadraoSection />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CrmSettingsSection />
        <EtiquetasSection />
      </div>

      <AppearanceSection />

      <Card className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-ink">
            <Store className="h-[18px] w-[18px] text-brand-text" aria-hidden="true" />
            <span className="font-semibold">Preferências operacionais</span>
          </div>
          <p className="text-[15px] text-muted">
            Horários, notificações e integrações técnicas continuam sendo salvos separadamente dos dados cadastrais
            da conta.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" onClick={resetSettings}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restaurar padrões
          </Button>
          <Button onClick={saveSettings} loading={settingsSaving} disabled={settingsLoading}>
            {!settingsSaving && <Save className="h-[18px] w-[18px]" aria-hidden="true" />}
            {settingsSaving ? 'Salvando...' : 'Salvar preferências'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
