'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Field, Icon, IconButton, Input, Modal, ModalFooter, Skeleton } from '@/components/ui';
import { materialIcon } from '@/lib/materialIconAdapter';
import { useToast } from '@/components/Toast';
import { atualizarProduto, criarProduto, listarProdutos, removerProduto, type Produto } from '@/lib/produtos';
import { getApiErrorMessage } from '@/utils/handleApiError';

const InventoryIcon = materialIcon('inventory_2');
const EditIcon = materialIcon('edit');
const DeleteIcon = materialIcon('delete');
const SaveIcon = materialIcon('save');

const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const ProdutosTab = () => {
  const { showToast } = useToast();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setProdutos(await listarProdutos());
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao carregar produtos'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const abrir = (p?: Produto) => {
    setEditing(p ?? null);
    setNome(p?.name ?? '');
    setDescricao(p?.description ?? '');
    setPreco(p ? String(p.price) : '');
    setOpen(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(preco);
    if (!nome.trim() || Number.isNaN(price) || price < 0) return;
    const payload = { name: nome.trim(), description: descricao.trim() || null, price };
    setSaving(true);
    try {
      if (editing) {
        await atualizarProduto(editing.id, payload);
        showToast('Produto atualizado', 'success');
      } else {
        await criarProduto(payload);
        showToast('Produto cadastrado', 'success');
      }
      setOpen(false);
      await load();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao salvar produto'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remover = async (p: Produto) => {
    if (!confirm(`Remover o produto "${p.name}"?`)) return;
    try {
      await removerProduto(p.id);
      showToast('Produto removido', 'success');
      await load();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao remover produto'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => abrir()}>
          <Icon name="add" size={16} /> Novo produto
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-16 w-full" label="Carregando..." />
      ) : produtos.length === 0 ? (
        <EmptyState
          icon={InventoryIcon}
          title="Nenhum produto cadastrado"
          description="Cadastre os produtos que você vende no atendimento para lançá-los na comanda."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {produtos.map(p => (
            <Card key={p.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold text-ink">{p.name}</h3>
                {p.description ? <p className="text-[15px] text-muted">{p.description}</p> : null}
                <p className="mt-1 text-[15px] font-semibold text-brand-text">{formatBRL(p.price)}</p>
              </div>
              <div className="flex gap-1">
                <IconButton icon={EditIcon} label={`Editar ${p.name}`} onClick={() => abrir(p)} />
                <IconButton icon={DeleteIcon} label={`Remover ${p.name}`} onClick={() => remover(p)} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar produto' : 'Novo produto'}
        icon="inventory_2"
        footer={
          <ModalFooter
            onCancel={() => setOpen(false)}
            onSubmit={() => (document.getElementById('produto-form') as HTMLFormElement | null)?.requestSubmit()}
            submitLabel="Salvar produto"
            submitIcon={SaveIcon}
            submitting={saving}
          />
        }
      >
        <form id="produto-form" onSubmit={salvar} className="space-y-4">
          <Field id="produto-nome" label="Nome">
            <Input id="produto-nome" required value={nome} onChange={e => setNome(e.target.value)} />
          </Field>
          <Field id="produto-descricao" label="Descrição curta (opcional)">
            <Input id="produto-descricao" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Produto home care" />
          </Field>
          <Field id="produto-preco" label="Preço">
            <Input id="produto-preco" required type="number" min={0} step="0.01" value={preco} onChange={e => setPreco(e.target.value)} placeholder="0,00" />
          </Field>
        </form>
      </Modal>
    </div>
  );
};
