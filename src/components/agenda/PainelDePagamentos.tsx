import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { AjusteValorModal } from '@/components/AjusteValorModal';
import { PagarFaturaModal } from '@/components/PagarFaturaModal';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useParcelasStore } from '@/store/parcelasStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useFaturasStore } from '@/store/faturasStore';
import type { GrupoPagamento, ItemPagamento, PagamentosDoMes } from '@/domain/usecases/calcularPagamentosDoMes';
import type { ContaBancaria } from '@/domain/types/entities';
import { formatarMoeda } from '@/core/utils/currency';
import { situacaoVencimento } from '@/domain/usecases/mesDaFatura';
import { formatarData, hojeIso } from '@/core/utils/date';

type Prazo = { texto: string; atrasado: boolean };

export function prazoDoGrupo(grupo: GrupoPagamento, hoje: string): Prazo | null {
  if (!grupo.vencimento) return null;
  if (grupo.faturaPaga) return { texto: 'Fatura paga', atrasado: false };
  const situacao = situacaoVencimento(grupo.vencimento, grupo.pendente === 0, hoje);
  return { texto: `${situacao.texto} · ${formatarData(grupo.vencimento, 'dd/MM')}`, atrasado: situacao.atrasado };
}

export function prazoDoItem(item: ItemPagamento, hoje: string): Prazo | null {
  if (!item.vencimento) return null;
  const situacao = situacaoVencimento(item.vencimento, item.paga, hoje);
  return { texto: `${situacao.texto} · ${formatarData(item.vencimento, 'dd/MM')}`, atrasado: situacao.atrasado };
}

type Props = {
  mes: string;
  pagamentos: PagamentosDoMes;
  contas: ContaBancaria[];
  /** Item vindo de uma notificação ('parcela-12' ou 'fatura-3'): aparece no topo, pronto para pagar. */
  destaque: string | null;
  onLimparDestaque: () => void;
};

/**
 * Tudo o que a antiga tela Pagamentos fazia, agora dentro da Agenda: o que falta pagar e o
 * que já foi pago no mês, marcar conta fixa como paga, ajustar valor (com justificativa),
 * pagar a fatura do cartão escolhendo a conta, e o destaque vindo das notificações.
 */
export function PainelDePagamentos({ mes, pagamentos, contas, destaque, onLimparDestaque }: Props) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { marcarPaga, ajustarValor: ajustarParcela, carregar: carregarParcelas } = useParcelasStore();
  const { ajustarValor: ajustarGasto } = useGastosRapidosStore();
  const { pagarFatura } = useFaturasStore();
  const [itemEmEdicao, setItemEmEdicao] = useState<ItemPagamento | null>(null);
  const [grupoEmPagamento, setGrupoEmPagamento] = useState<GrupoPagamento | null>(null);
  const hoje = hojeIso();

  const itemDestacado = (() => {
    if (!destaque) return null;
    if (destaque.startsWith('fatura-')) {
      const cartaoId = Number(destaque.slice('fatura-'.length));
      const grupo = pagamentos.grupos.find((g) => g.cartao?.id === cartaoId) ?? null;
      return grupo ? { tipo: 'fatura' as const, grupo } : null;
    }
    for (const grupo of pagamentos.grupos) {
      const item = grupo.itens.find((i) => i.chave === destaque);
      if (item) return { tipo: 'item' as const, item, grupo };
    }
    return null;
  })();

  async function handleConfirmarAjuste(novoValor: number, justificativa: string) {
    if (!itemEmEdicao) return;
    try {
      if (itemEmEdicao.tipo === 'parcela') {
        await ajustarParcela(itemEmEdicao.origemId, novoValor, justificativa);
      } else {
        await ajustarGasto(itemEmEdicao.origemId, novoValor, justificativa);
      }
      setItemEmEdicao(null);
    } catch (erro) {
      Alert.alert('Não foi possível alterar', erro instanceof Error ? erro.message : 'Tente novamente.');
    }
  }

  async function handleConfirmarFatura(contaBancariaId: number | null) {
    const grupo = grupoEmPagamento;
    if (!grupo?.cartao) return;
    await pagarFatura({
      cartao: grupo.cartao,
      mesReferencia: mes,
      valorPago: grupo.pendente,
      parcelaIds: grupo.itens.filter((i) => i.tipo === 'parcela' && !i.paga).map((i) => i.origemId),
      contaBancariaId,
    });
    await carregarParcelas();
    setGrupoEmPagamento(null);
  }

  return (
    <View style={{ gap: 12 }}>
      {itemDestacado && (
        <Card style={{ borderColor: colors.brand }}>
          {itemDestacado.tipo === 'item' ? (
            <>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                {itemDestacado.item.nome} · {formatarMoeda(itemDestacado.item.valor)}
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 12 }}>
                {itemDestacado.item.paga ? 'Marcada como paga.' : (prazoDoItem(itemDestacado.item, hoje)?.texto ?? itemDestacado.item.detalhe)}
              </Text>
              {!itemDestacado.item.paga && itemDestacado.item.tipo === 'parcela' && itemDestacado.grupo.cartao === null ? (
                <Button titulo="Marcar como paga" onPress={() => marcarPaga(itemDestacado.item.origemId)} />
              ) : (
                <Button titulo="Ok" variante="secundaria" onPress={onLimparDestaque} />
              )}
            </>
          ) : (
            <>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                {itemDestacado.grupo.titulo} · {formatarMoeda(itemDestacado.grupo.pendente)}
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 12 }}>
                {itemDestacado.grupo.faturaPaga ? 'Fatura paga.' : (prazoDoGrupo(itemDestacado.grupo, hoje)?.texto ?? '')}
              </Text>
              {!itemDestacado.grupo.faturaPaga && itemDestacado.grupo.pendente > 0 ? (
                <Button titulo="Pagar fatura" onPress={() => setGrupoEmPagamento(itemDestacado.grupo)} />
              ) : (
                <Button titulo="Ok" variante="secundaria" onPress={onLimparDestaque} />
              )}
            </>
          )}
        </Card>
      )}

      <Card>
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
          Falta pagar
        </Text>
        <Text className="font-heading" style={{ color: colors.text, fontSize: 28, marginTop: 2 }}>
          {formatarMoeda(pagamentos.totalPendente)}
        </Text>
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
          {formatarMoeda(pagamentos.totalPago)} já pago de {formatarMoeda(pagamentos.total)}
        </Text>
      </Card>

      {pagamentos.grupos.length === 0 && (
        <View style={{ marginHorizontal: -20, gap: 12 }}>
          <EmptyState
            icon="check-circle"
            titulo="Nada para pagar neste mês"
            descricao="Contas fixas, parcelas e compras no cartão do mês aparecem aqui."
            acao={{ rotulo: 'Cadastrar conta fixa', onPress: () => router.push('/conta-fixa/novo') }}
          />
        </View>
      )}

      {pagamentos.grupos.map((grupo) => (
        <Card key={grupo.chave} style={{ padding: 0, borderColor: prazoDoGrupo(grupo, hoje)?.atrasado ? colors.danger : colors.border }}>
          <View style={{ padding: 16, paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                {grupo.cartao && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: grupo.cartao.cor }} />}
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                  {grupo.titulo}
                </Text>
              </View>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                {formatarMoeda(grupo.total)}
              </Text>
            </View>
            {prazoDoGrupo(grupo, hoje) && (
              <Text
                className="font-body-medium"
                style={{ color: prazoDoGrupo(grupo, hoje)?.atrasado ? colors.danger : colors.textMuted, fontSize: 11, marginTop: 2 }}
              >
                {prazoDoGrupo(grupo, hoje)?.texto}
              </Text>
            )}
          </View>

          {grupo.itens.map((item) => {
            const alterado = item.valorOriginal !== null && item.valorOriginal !== item.valor;
            const podeEditar = !item.paga;
            const podePagarAvulso = item.tipo === 'parcela' && !item.paga && grupo.cartao === null;
            return (
              <View
                key={item.chave}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  gap: 10,
                }}
              >
                {item.paga ? (
                  <Feather name="check-circle" size={20} color={colors.success} />
                ) : podePagarAvulso ? (
                  <Pressable
                    hitSlop={12}
                    onPress={() => marcarPaga(item.origemId)}
                    accessibilityRole="button"
                    accessibilityLabel={`Marcar ${item.nome} como paga`}
                  >
                    <Feather name="circle" size={20} color={colors.textMuted} />
                  </Pressable>
                ) : (
                  <Feather name="clock" size={20} color={colors.textMuted} />
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    className="font-body-medium"
                    style={{ color: colors.text, fontSize: 13, textDecorationLine: item.paga ? 'line-through' : 'none' }}
                  >
                    {item.nome}
                  </Text>
                  <Text className="font-body" style={{ color: prazoDoItem(item, hoje)?.atrasado ? colors.danger : colors.textMuted, fontSize: 11 }}>
                    {prazoDoItem(item, hoje)?.texto ?? item.detalhe}
                  </Text>
                  {alterado && (
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      Era {formatarMoeda(item.valorOriginal ?? 0)} · {item.justificativa}
                    </Text>
                  )}
                </View>
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
                  {formatarMoeda(item.valor)}
                </Text>
                {podeEditar && (
                  <Pressable hitSlop={12} onPress={() => setItemEmEdicao(item)} accessibilityRole="button" accessibilityLabel={`Ajustar valor de ${item.nome}`}>
                    <Feather name="edit-2" size={16} color={colors.brand} />
                  </Pressable>
                )}
              </View>
            );
          })}

          {grupo.cartao && !grupo.faturaPaga && grupo.pendente > 0 && (
            <Pressable
              onPress={() => setGrupoEmPagamento(grupo)}
              accessibilityRole="button"
              style={{ padding: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }}
            >
              <Text className="font-heading-medium" style={{ color: colors.brand, fontSize: 14 }}>
                Pagar fatura · {formatarMoeda(grupo.pendente)}
              </Text>
            </Pressable>
          )}
        </Card>
      ))}

      {itemEmEdicao && (
        <AjusteValorModal
          key={itemEmEdicao.chave}
          nome={itemEmEdicao.nome}
          valorAtual={itemEmEdicao.valor}
          onCancelar={() => setItemEmEdicao(null)}
          onConfirmar={handleConfirmarAjuste}
        />
      )}
      {grupoEmPagamento && (
        <PagarFaturaModal
          key={grupoEmPagamento.chave}
          titulo={grupoEmPagamento.titulo}
          valor={grupoEmPagamento.pendente}
          contas={contas}
          onCancelar={() => setGrupoEmPagamento(null)}
          onConfirmar={handleConfirmarFatura}
        />
      )}
    </View>
  );
}
