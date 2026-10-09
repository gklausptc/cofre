import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { Button } from '@/components/Button';
import { MonthSelector } from '@/components/MonthSelector';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { useFaturasStore } from '@/store/faturasStore';
import { gerarExtratoCartaoCSV, gerarExtratoContaCSV } from '@/domain/usecases/gerarExtratoCSV';
import { formatarMesReferencia, mesAnterior, mesAtualIso, mesSeguinte } from '@/core/utils/date';

type TipoOrigem = 'conta' | 'cartao';
type Periodo = 'mes' | 'tudo';

function nomeDeArquivoSeguro(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export default function ExportarExtratoScreen() {
  const { colors } = useAppTheme();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { contas: contasFixas, carregar: carregarContasFixas } = useContasFixasStore();
  const { faturas, carregar: carregarFaturas } = useFaturasStore();

  useFocusEffect(
    useCallback(() => {
      carregarContas();
      carregarCartoes();
      carregarCategorias();
      carregarMovimentacoes();
      carregarGastos();
      carregarParcelas();
      carregarCompras();
      carregarContasFixas();
      carregarFaturas();
    }, [
      carregarContas,
      carregarCartoes,
      carregarCategorias,
      carregarMovimentacoes,
      carregarGastos,
      carregarParcelas,
      carregarCompras,
      carregarContasFixas,
      carregarFaturas,
    ])
  );

  const [tipoOrigem, setTipoOrigem] = useState<TipoOrigem>('conta');
  const [contaId, setContaId] = useState<number | null>(null);
  const [cartaoId, setCartaoId] = useState<number | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [mes, setMes] = useState(mesAtualIso());
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cartoesAtivos = useMemo(() => cartoes.filter((c) => c.ativo !== false), [cartoes]);
  const categoriasPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  const conta = contas.find((c) => c.id === contaId) ?? null;
  const cartao = cartoesAtivos.find((c) => c.id === cartaoId) ?? null;
  const origemEscolhida = tipoOrigem === 'conta' ? conta !== null : cartao !== null;

  const opcoesOrigem = useMemo(
    () =>
      tipoOrigem === 'conta'
        ? contas.map((c) => ({ valor: String(c.id), rotulo: c.nomeConta }))
        : cartoesAtivos.map((c) => ({ valor: String(c.id), rotulo: c.nome })),
    [tipoOrigem, contas, cartoesAtivos]
  );

  function montarCSV(): { nome: string; conteudo: string } | null {
    if (tipoOrigem === 'conta' && conta) {
      const mesEscolhido = periodo === 'mes' ? mes : null;
      return {
        nome: `extrato-${nomeDeArquivoSeguro(conta.nomeConta)}-${mesEscolhido ?? 'tudo'}.csv`,
        conteudo: gerarExtratoContaCSV(conta, movimentacoes, categoriasPorId, mesEscolhido),
      };
    }
    if (tipoOrigem === 'cartao' && cartao) {
      return {
        nome: `fatura-${nomeDeArquivoSeguro(cartao.nome)}-${mes}.csv`,
        conteudo: gerarExtratoCartaoCSV(cartao, gastos, parcelas, compras, contasFixas, categoriasPorId, mes, faturas),
      };
    }
    return null;
  }

  async function handleExportar() {
    const csv = montarCSV();
    if (!csv) return;
    setErro(null);
    setExportando(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setErro('O compartilhamento não está disponível neste aparelho.');
        return;
      }
      const arquivo = new File(Paths.cache, csv.nome);
      arquivo.create({ overwrite: true, intermediates: true });
      arquivo.write(csv.conteudo);
      await Sharing.shareAsync(arquivo.uri, {
        mimeType: 'text/csv',
        dialogTitle: tipoOrigem === 'conta' ? 'Exportar extrato da conta' : 'Exportar fatura do cartão',
        UTI: 'public.comma-separated-values-text',
      });
    } catch {
      setErro('Não consegui gerar o arquivo. Tente novamente.');
    } finally {
      setExportando(false);
    }
  }

  const descricaoPeriodo =
    tipoOrigem === 'conta'
      ? periodo === 'mes'
        ? `Movimentações de ${formatarMesReferencia(mes)}`
        : 'Todo o histórico da conta'
      : `Itens da fatura que vence em ${formatarMesReferencia(mes)}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ScreenHeader title="Exportar extrato" subtitle="CSV para abrir no Excel ou enviar" />

        <ChipSelect<TipoOrigem>
          label="Exportar de"
          opcoes={[
            { valor: 'conta', rotulo: 'Conta bancária' },
            { valor: 'cartao', rotulo: 'Cartão de crédito' },
          ]}
          valor={tipoOrigem}
          onSelecionar={setTipoOrigem}
        />

        {opcoesOrigem.length === 0 ? (
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
            {tipoOrigem === 'conta'
              ? 'Cadastre uma conta bancária para exportar o extrato.'
              : 'Cadastre um cartão de crédito para exportar a fatura.'}
          </Text>
        ) : (
          <>
            <ChipSelect
              label={tipoOrigem === 'conta' ? 'Qual conta?' : 'Qual cartão?'}
              opcoes={opcoesOrigem}
              valor={
                tipoOrigem === 'conta'
                  ? contaId !== null
                    ? String(contaId)
                    : ''
                  : cartaoId !== null
                    ? String(cartaoId)
                    : ''
              }
              onSelecionar={(v) => (tipoOrigem === 'conta' ? setContaId(Number(v)) : setCartaoId(Number(v)))}
            />

            {tipoOrigem === 'conta' && (
              <ChipSelect<Periodo>
                label="Período"
                opcoes={[
                  { valor: 'mes', rotulo: 'Um mês' },
                  { valor: 'tudo', rotulo: 'Tudo' },
                ]}
                valor={periodo}
                onSelecionar={setPeriodo}
              />
            )}

            {(tipoOrigem === 'cartao' || periodo === 'mes') && (
              <Card style={{ paddingHorizontal: 0, paddingBottom: 0, marginBottom: 16 }}>
                <Text
                  className="font-body-medium"
                  style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, paddingHorizontal: 20 }}
                >
                  {tipoOrigem === 'conta' ? 'Mês' : 'Mês de vencimento da fatura'}
                </Text>
                <MonthSelector
                  mesReferencia={mes}
                  onAnterior={() => setMes(mesAnterior(mes))}
                  onProximo={() => setMes(mesSeguinte(mes))}
                />
              </Card>
            )}

            <View style={{ marginBottom: 16 }}>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                {descricaoPeriodo}. Separador ponto e vírgula, valores com vírgula decimal — abre direto no Excel
                em português.
              </Text>
            </View>

            {erro && (
              <Text className="font-body" style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>
                {erro}
              </Text>
            )}

            <Button
              titulo="Exportar CSV"
              onPress={handleExportar}
              disabled={!origemEscolhida}
              carregando={exportando}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
