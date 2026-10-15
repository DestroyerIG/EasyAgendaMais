'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Icon, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { SecaoRecolhivel } from '@/components/clientes/SecaoRecolhivel';
import { formatDataNegocio } from '@/lib/formatters';
import { salvarFichaTecnica, type CampoPersonalizado, type FichaTecnicaDto, type Segmento } from '@/lib/crm';
import { SEGMENTOS } from '@/lib/technicalSheetTemplates';

export const MAX_CAMPOS_LIVRES = 20;

const ICONE_SEGMENTO: Record<Segmento, string> = {
  unhas: 'brush',
  cilios_sobrancelhas: 'visibility',
  cabelo: 'content_cut',
  barbearia: 'content_cut',
  estetica: 'spa',
  outro: 'assignment',
};

export interface FichaTecnicaProps {
  clienteId: string;
  ficha: FichaTecnicaDto;
  onSalva: (ficha: FichaTecnicaDto) => void;
}

/** Ficha técnica do segmento do salão: alergias em destaque, campos do modelo e campos livres. */
export function FichaTecnica({ clienteId, ficha, onSalva }: FichaTecnicaProps) {
  const { showToast } = useToast();
  const [alergias, setAlergias] = useState('');
  const [editandoAlergias, setEditandoAlergias] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [livres, setLivres] = useState<CampoPersonalizado[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Recomeça do que está salvo sempre que a ficha muda (carga inicial e depois de salvar).
  useEffect(() => {
    setAlergias(ficha.allergies ?? '');
    setValores({ ...ficha.fields });
    setLivres(ficha.customFields.map((c) => ({ ...c })));
    setEditandoAlergias(false);
  }, [ficha]);

  const rotuloSegmento = SEGMENTOS[ficha.segmento]?.rotulo ?? SEGMENTOS.outro.rotulo;

  const salvar = async () => {
    // Só as chaves do modelo do segmento (chaves antigas de outro segmento ficam de fora)
    // e só o que foi preenchido.
    const fields: Record<string, string> = {};
    for (const campo of ficha.campos) {
      const v = (valores[campo.key] ?? '').trim();
      if (v) fields[campo.key] = v;
    }
    const customFields = livres
      .map((c) => ({ label: c.label.trim(), value: c.value.trim() }))
      .filter((c) => c.label);
    setSalvando(true);
    try {
      const salva = await salvarFichaTecnica(clienteId, { allergies: alergias.trim() || null, fields, customFields });
      showToast('Ficha técnica atualizada', 'success');
      onSalva(salva);
    } catch {
      showToast('Erro ao salvar a ficha técnica', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const alterarLivre = (i: number, parte: Partial<CampoPersonalizado>) =>
    setLivres((atual) => atual.map((c, j) => (j === i ? { ...c, ...parte } : c)));

  return (
    <SecaoRecolhivel
      titulo={`Ficha técnica — ${rotuloSegmento}`}
      icone={ICONE_SEGMENTO[ficha.segmento] ?? 'assignment'}
      iconeClassName="bg-brand/12 text-brand-text"
      subtitulo={
        ficha.updatedAt
          ? `Atualizada em ${formatDataNegocio(ficha.updatedAt)}${ficha.updatedBy ? ` por ${ficha.updatedBy}` : ''}`
          : 'Ainda não preenchida'
      }
    >
      <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-warning/12 p-3.5 text-warning-text">
        <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-bold">Alergias e restrições</span>
            {!editandoAlergias && (
              <button
                type="button"
                onClick={() => setEditandoAlergias(true)}
                className="text-[12px] font-bold hover:underline"
              >
                Editar alergias
              </button>
            )}
          </div>
          {editandoAlergias ? (
            <Textarea
              aria-label="Alergias e restrições"
              value={alergias}
              onChange={(e) => setAlergias(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ex.: sensível a primer ácido"
            />
          ) : (
            <p className="whitespace-pre-line text-[13px] text-ink">{alergias.trim() || 'Nenhuma alergia registrada'}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ficha.campos.map((campo) => {
          const id = `ficha-${campo.key}`;
          const valor = valores[campo.key] ?? '';
          return (
            <Field key={campo.key} id={id} label={campo.label} className={campo.type === 'texto' && campo.key.includes('observ') ? 'sm:col-span-2' : undefined}>
              {campo.type === 'opcoes' ? (
                <Select id={id} value={valor} onChange={(e) => setValores((v) => ({ ...v, [campo.key]: e.target.value }))}>
                  <option value="">Não informado</option>
                  {/* Valor salvo que saiu da lista de opções continua visível. */}
                  {valor && !(campo.options ?? []).includes(valor) && <option value={valor}>{valor}</option>}
                  {(campo.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={id}
                  value={valor}
                  maxLength={500}
                  onChange={(e) => setValores((v) => ({ ...v, [campo.key]: e.target.value }))}
                />
              )}
            </Field>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink">Campos livres</span>
        {livres.length === 0 && <p className="text-[12px] text-muted">Anote aqui o que o modelo não cobre.</p>}
        {livres.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`Rótulo do campo ${i + 1}`}
              placeholder="Rótulo"
              value={c.label}
              maxLength={60}
              onChange={(e) => alterarLivre(i, { label: e.target.value })}
              className="flex-1"
            />
            <Input
              aria-label={`Valor do campo ${i + 1}`}
              placeholder="Valor"
              value={c.value}
              maxLength={500}
              onChange={(e) => alterarLivre(i, { value: e.target.value })}
              className="flex-1"
            />
            <button
              type="button"
              aria-label={`Remover campo ${i + 1}`}
              onClick={() => setLivres((atual) => atual.filter((_, j) => j !== i))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/12 hover:text-danger"
            >
              <Icon name="delete" size={18} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLivres((atual) => [...atual, { label: '', value: '' }])}
          disabled={livres.length >= MAX_CAMPOS_LIVRES}
          className="inline-flex items-center gap-1 self-start text-[13px] font-bold text-brand-text hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline"
        >
          <Icon name="add" size={16} />
          Adicionar campo
        </button>
      </div>

      <Button variant="secondary" fullWidth className="mt-4" onClick={salvar} loading={salvando} disabled={salvando}>
        <Icon name="tune" size={18} />
        Atualizar ficha técnica
      </Button>
    </SecaoRecolhivel>
  );
}
