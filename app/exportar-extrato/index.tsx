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
import { gerarExtratoCartaoCSV, gerarExtratoCartaoTudoCSV, gerarExtratoContaCSV } from '@/domain/usecases/gerarExtratoCSV';
import { formatarMesReferencia, hojeIso, mesAnterior, mesAtualIso, mesSeguinte } from '@/core/utils/date';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { montarAnaliseCompleta } from '@/domain/usecases/analiseCompleta';
import { compartilharAnaliseCompleta, compartilharPlanilhaDoCofre } from '@/core/exportacao/exportarAnalise';

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
  const { dados, carregarTudo } = useDadosFinanceiros();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();

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
      carregarTudo();
      carregarMembros();
    }, [
      carregarTudo,
      carregarMembros,
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
  const [exportandoTudo, setExportandoTudo] = useState<'analise' | 'planilha' | null>(null);
  const [erroTudo, setErroTudo] = useState<string | null>(null);

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
        conteudo: gerarExtratoContaCSV(conta, movimentacoes, categoriasPorId, mesEscolhido, { gastos }),
      };
    }
    if (tipoOrigem === 'cartao' && cartao && periodo === 'tudo') {
      return {
        nome: `faturas-${nomeDeArquivoSeguro(cartao.nome)}-tudo.csv`,
        conteudo: gerarExtratoCartaoTudoCSV(cartao, gastos, parcelas, compras, contasFixas, categoriasPorId, faturas),
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

  async function exportarTudo(como: 'analise' | 'planilha') {
    setErroTudo(null);
    setExportandoTudo(como);
    try {
      const agora = new Date();
      const analise = montarAnaliseCompleta({ dados, contas, categorias, membros, hoje: hojeIso(), geradoEm: agora.toISOString() });
      if (como === 'analise') await compartilharAnaliseCompleta(analise);
      else await compartilharPlanilhaDoCofre();
    } catch (falha) {
      setErroTudo(falha instanceof Error && falha.message ? falha.message : 'Não consegui gerar o arquivo. Tente novamente.');
    } finally {
      setExportandoTudo(null);
    }
  }

  const descricaoPeriodo =
    tipoOrigem === 'conta'
      ? periodo === 'mes'
        ? `Movimentações de ${formatarMesReferencia(mes)}`
        : 'Todo o histórico da conta'
      : periodo === 'mes'
        ? `Itens da fatura que vence em ${formatarMesReferencia(mes)}`
        : 'Todas as faturas do cartão, uma depois da outra, com o total de cada uma';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ScreenHeader title="Exportar extrato" subtitle="CSV para abrir no Excel ou enviar" />

        <Card style={{ marginBottom: 20 }}>
          <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16 }}>
            Tudo o que foi lançado
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 12 }}>
            Entradas, saídas, transferências, cartão, contas fixas e cofrinhos de todos os meses, com as contas que o app fez
            em cada mês (Livre para gastar, compromissos, saldo das contas). Serve para mandar para conferência quando um
            número parecer errado. O arquivo tem os seus dados financeiros: envie só para quem vai conferir.
          </Text>
          {erroTudo && (
            <Text className="font-body" style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>
              {erroTudo}
            </Text>
          )}
          <Button
            titulo="Exportar tudo para análise"
            onPress={() => void exportarTudo('analise')}
            carregando={exportandoTudo === 'analise'}
            disabled={exportandoTudo !== null}
          />
          <View style={{ height: 8 }} />
          <Button
            titulo="Planilha do Cofre (contas e cartões, tudo)"
            variante="secundaria"
            onPress={() => void exportarTudo('planilha')}
            carregando={exportandoTudo === 'planilha'}
            disabled={exportandoTudo !== null}
          />
        </Card>

        <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16, marginBottom: 12 }}>
          Extrato de uma conta ou fatura
        </Text>

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

            <ChipSelect<Periodo>
              label="Período"
              opcoes={[
                { valor: 'mes', rotulo: tipoOrigem === 'conta' ? 'Um mês' : 'Uma fatura' },
                { valor: 'tudo', rotulo: 'Tudo' },
              ]}
              valor={periodo}
              onSelecionar={setPeriodo}
            />

            {periodo === 'mes' && (
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
