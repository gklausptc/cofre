import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarMesReferencia, hojeIso } from '@/core/utils/date';
import { useFaturasStore } from '@/store/faturasStore';
import { useAvisoStore } from '@/store/avisoStore';
import { encontrarPagamentosSoltos, faturasAntigasEmAberto } from '@/domain/usecases/automacoes/faturasSoltas';
import type { DadosParaConciliar } from '@/domain/usecases/importacao/conciliar';

type Props = { dados: DadosParaConciliar; onMudou: () => void };

/**
 * Duas arrumações que aparecem depois de importar extratos antigos: pagamento de fatura que
 * entrou como gasto (conta em dobro e deixa a fatura atrasada) e faturas antigas sem pagamento.
 */
export function FaturasParaArrumar({ dados, onMudou }: Props) {
  const { colors } = useAppTheme();
  const ligarPagamentos = useFaturasStore((s) => s.ligarPagamentos);
  const mostrarAviso = useAvisoStore((s) => s.mostrar);
  const [salvando, setSalvando] = useState(false);
  const [verAntigas, setVerAntigas] = useState(false);
  const hoje = hojeIso();

  const soltos = useMemo(() => encontrarPagamentosSoltos(dados, hoje), [dados, hoje]);
  const antigas = useMemo(() => faturasAntigasEmAberto(dados, hoje, soltos), [dados, hoje, soltos]);
  if (soltos.length === 0 && antigas.length === 0) return null;

  async function corrigirSoltos() {
    setSalvando(true);
    try {
      await ligarPagamentos(soltos.map((s) => ({ pagamento: s.pagamento, parcelaIds: s.parcelaIds, movimentacaoId: s.movimentacaoId })));
      mostrarAviso({ mensagem: `${soltos.length} ${soltos.length === 1 ? 'pagamento ligado à fatura' : 'pagamentos ligados às faturas'}.` });
      onMudou();
    } finally {
      setSalvando(false);
    }
  }

  async function marcarAntigas() {
    setSalvando(true);
    try {
      await ligarPagamentos(antigas.map((a) => ({ pagamento: a.pagamento, parcelaIds: a.parcelaIds, movimentacaoId: null })));
      mostrarAviso({ mensagem: `${antigas.length} ${antigas.length === 1 ? 'fatura marcada como paga' : 'faturas marcadas como pagas'}.` });
      onMudou();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 12 }}>
      {soltos.length > 0 && (
        <Card style={{ borderColor: colors.warning }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Feather name="alert-triangle" size={16} color={colors.warning} style={{ marginRight: 8 }} />
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, flex: 1 }}>
              {soltos.length === 1 ? 'Um pagamento de fatura está contando como gasto' : `${soltos.length} pagamentos de fatura estão contando como gasto`}
            </Text>
          </View>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
            As compras da fatura já são gastos; o pagamento dela não pode contar de novo. Ligando, a fatura fica paga e o gasto
            some dos relatórios (o saldo da conta não muda).
          </Text>
          {soltos.map((s) => (
            <View key={s.movimentacaoId} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                {formatarData(s.data)} · {s.descricao}
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                {formatarMoeda(s.valor)} → fatura {s.cartaoNome} de {formatarMesReferencia(s.pagamento.mesReferencia)} ({formatarMoeda(s.totalDaFatura)})
              </Text>
            </View>
          ))}
          <Button titulo={soltos.length === 1 ? 'Ligar à fatura' : 'Ligar todos às faturas'} onPress={corrigirSoltos} carregando={salvando} />
        </Card>
      )}
      {antigas.length > 0 && (
        <Card>
          <Pressable
            onPress={() => setVerAntigas((v) => !v)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}
          >
            <Feather name="clock" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, flex: 1 }}>
              {antigas.length === 1 ? '1 fatura antiga aparece como atrasada' : `${antigas.length} faturas antigas aparecem como atrasadas`}
            </Text>
            <Feather name={verAntigas ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </Pressable>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 8 }}>
            Comum depois de importar faturas sem o extrato da conta que pagou. Se você já pagou, marque como pagas (nenhuma
            saída é lançada na conta).
          </Text>
          {verAntigas &&
            antigas.map((a) => (
              <Text
                key={`${a.pagamento.cartaoId}-${a.pagamento.mesReferencia}`}
                className="font-body"
                style={{ color: colors.text, fontSize: 12, paddingVertical: 3 }}
              >
                {a.cartaoNome} · venceu {formatarData(a.pagamento.dataVencimento)} · {formatarMoeda(a.total)}
              </Text>
            ))}
          <Button titulo="Já paguei: marcar como pagas" variante="secundaria" onPress={marcarAntigas} carregando={salvando} />
        </Card>
      )}
    </View>
  );
}
