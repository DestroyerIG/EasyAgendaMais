'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Icon, buttonVariants, controlClass } from '@/components/ui';
import { CAIXA } from '@/components/admin/formato';
import { adminApi } from '@/lib/adminApi';
import { cn } from '@/lib/cn';
import type { AdminCoupon, AdminCouponPayload } from '@/types/admin';

type CouponFormState = {
  code: string;
  description: string;
  discount_type: 'percent' | 'fixed';
  discount_value: string;
  max_uses: string;
  valid_until: string;
  active: boolean;
};

const inputClass = cn(controlClass, 'h-11');
const botaoIcone =
  'inline-flex h-11 w-11 items-center justify-center rounded-control border border-line text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:h-9 lg:w-9';

const emptyForm: CouponFormState = {
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value: '',
  max_uses: '',
  valid_until: '',
  active: true,
};

const formatCurrency = (value: string | number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return 'Sem expiração';
  }

  return new Date(value).toLocaleDateString('pt-BR');
};

const toDateInputValue = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString().slice(0, 10);
};

const buildPayload = (form: CouponFormState, includeCode: boolean): AdminCouponPayload => ({
  ...(includeCode ? { code: form.code.trim() } : {}),
  description: form.description.trim() || null,
  discount_type: form.discount_type,
  discount_value: Number(form.discount_value),
  max_uses: form.max_uses ? Number(form.max_uses) : null,
  valid_until: form.valid_until ? new Date(`${form.valid_until}T23:59:59`).toISOString() : null,
  active: form.active,
});

const couponToForm = (coupon: AdminCoupon): CouponFormState => ({
  code: coupon.code,
  description: coupon.description || '',
  discount_type: coupon.discount_type,
  discount_value: String(coupon.discount_value),
  max_uses: coupon.max_uses ? String(coupon.max_uses) : '',
  valid_until: toDateInputValue(coupon.valid_until),
  active: coupon.active,
});

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [editingCoupon, setEditingCoupon] = useState<AdminCoupon | null>(null);
  const [form, setForm] = useState<CouponFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const loadCoupons = async () => {
    setLoading(true);

    try {
      const data = await adminApi.getCoupons();
      setCoupons(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const filteredCoupons = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return coupons;
    }

    return coupons.filter((coupon) =>
      [coupon.code, coupon.description || '', coupon.discount_type]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [coupons, search]);

  const resetForm = () => {
    setEditingCoupon(null);
    setForm(emptyForm);
    setError(null);
  };

  const startEditing = (coupon: AdminCoupon) => {
    setEditingCoupon(coupon);
    setForm(couponToForm(coupon));
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!editingCoupon && !form.code.trim()) {
      setError('Informe o código do cupom.');
      return;
    }

    if (!form.discount_value || Number(form.discount_value) <= 0) {
      setError('Informe um desconto maior que zero.');
      return;
    }

    setSubmitting(true);

    try {
      if (editingCoupon) {
        await adminApi.updateCoupon(editingCoupon.id, buildPayload(form, false));
      } else {
        await adminApi.createCoupon(buildPayload(form, true));
      }

      await loadCoupons();
      resetForm();
    } catch (err) {
      const apiError = err as { response?: { data?: { error?: string } } };
      setError(apiError.response?.data?.error || 'Não foi possível salvar o cupom.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon: AdminCoupon) => {
    setSubmitting(true);

    try {
      await adminApi.updateCoupon(coupon.id, { active: !coupon.active });
      await loadCoupons();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (coupon: AdminCoupon) => {
    const confirmed = window.confirm(`Remover o cupom ${coupon.code}?`);

    if (!confirmed) {
      return;
    }

    setSubmitting(true);

    try {
      await adminApi.deleteCoupon(coupon.id);
      await loadCoupons();

      if (editingCoupon?.id === coupon.id) {
        resetForm();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-ink">Cupons</h1>
        <p className="mt-2 text-sm text-muted">Crie descontos para checkout Pix e acompanhe limites de uso.</p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <form onSubmit={handleSubmit} method="post" className={cn(CAIXA, 'space-y-4 p-5 sm:p-6')}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">{editingCoupon ? 'Editar cupom' : 'Novo cupom'}</h2>
              <p className="mt-1 text-xs text-muted">O código é salvo em maiúsculas.</p>
            </div>
            {editingCoupon ? (
              <button type="button" onClick={resetForm} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'text-xs')}>
                Cancelar
              </button>
            ) : (
              <Icon name="add" size={20} className="text-brand" />
            )}
          </div>

          {error && (
            <p className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <label className="block space-y-2 text-sm">
            <span className="font-semibold text-ink">Código</span>
            <input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              disabled={Boolean(editingCoupon)}
              placeholder="PROMO20"
              className={inputClass}
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="font-semibold text-ink">Descrição</span>
            <input
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Campanha de lançamento"
              className={inputClass}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2 text-sm">
              <span className="font-semibold text-ink">Tipo</span>
              <select
                value={form.discount_type}
                onChange={(event) =>
                  setForm((current) => ({ ...current, discount_type: event.target.value as CouponFormState['discount_type'] }))
                }
                className={inputClass}
              >
                <option value="percent">Percentual</option>
                <option value="fixed">Valor fixo</option>
              </select>
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-semibold text-ink">Desconto</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.discount_value}
                onChange={(event) => setForm((current) => ({ ...current, discount_value: event.target.value }))}
                placeholder={form.discount_type === 'percent' ? '20' : '30.00'}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2 text-sm">
              <span className="font-semibold text-ink">Limite de usos</span>
              <input
                type="number"
                min="1"
                step="1"
                value={form.max_uses}
                onChange={(event) => setForm((current) => ({ ...current, max_uses: event.target.value }))}
                placeholder="Ilimitado"
                className={inputClass}
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-semibold text-ink">Validade</span>
              <input
                type="date"
                value={form.valid_until}
                onChange={(event) => setForm((current) => ({ ...current, valid_until: event.target.value }))}
                className={inputClass}
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 rounded-control border border-line px-3 py-2 text-sm text-ink">
            <input
              type="checkbox"
              className="accent-brand"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            Cupom ativo
          </label>

          <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'primary', size: 'md', fullWidth: true })}>
            {submitting ? 'Salvando...' : editingCoupon ? 'Salvar alterações' : 'Criar cupom'}
          </button>
        </form>

        <section className={cn(CAIXA, 'overflow-x-auto p-5 sm:p-6')}>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">Cupons cadastrados</h2>
              <p className="mt-1 text-xs text-muted">{coupons.length} cupons no total</p>
            </div>
            <label className="relative w-full md:max-w-xs">
              <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cupom"
                className={cn(inputClass, 'pl-9')}
              />
            </label>
          </div>

          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-3">Cupom</th>
                <th className="px-3 py-3">Desconto</th>
                <th className="px-3 py-3">Uso</th>
                <th className="px-3 py-3">Validade</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredCoupons.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">Nenhum cupom encontrado.</td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">Carregando cupons...</td>
                </tr>
              )}

              {filteredCoupons.map((coupon) => (
                <tr key={coupon.id} className="border-t border-line">
                  <td className="px-3 py-4">
                    <p className="font-semibold text-ink">{coupon.code}</p>
                    <p className="text-xs text-muted">{coupon.description || '-'}</p>
                  </td>
                  <td className="px-3 py-4 text-ink">
                    {coupon.discount_type === 'percent'
                      ? `${Number(coupon.discount_value)}%`
                      : formatCurrency(coupon.discount_value)}
                  </td>
                  <td className="px-3 py-4 text-ink">
                    {coupon.current_uses}/{coupon.max_uses || 'ilimitado'}
                  </td>
                  <td className="px-3 py-4 text-ink">{formatDate(coupon.valid_until)}</td>
                  <td className="px-3 py-4">
                    <span className={`badge ${coupon.active ? 'border-success/30 bg-success/10 text-success-text' : 'border-danger/30 bg-danger/10 text-danger'}`}>
                      <Icon name={coupon.active ? 'check_circle' : 'cancel'} size={14} />
                      {coupon.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(coupon)}
                        aria-label="Editar cupom"
                        className={botaoIcone}
                        title="Editar cupom"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(coupon)}
                        disabled={submitting}
                        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'text-xs')}
                      >
                        {coupon.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(coupon)}
                        disabled={submitting}
                        aria-label="Excluir cupom"
                        className={cn(botaoIcone, 'border-danger/30 text-danger hover:bg-danger/10 hover:text-danger')}
                        title="Excluir cupom"
                      >
                        <Icon name="delete" size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}
