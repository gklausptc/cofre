import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { detalheDoErro, lerTextoDoArquivo } from '@/core/importacao/lerArquivoDeExtrato';
import { CORES_DE_CATEGORIA } from '@/domain/dados/categoriasPadrao';
import {
  lerPlanilhaDoCofre,
  montarRegistroDaPlanilha,
  planejarPlanilha,
  type ErroDaPlanilha,
  type LinhaDaPlanilha,
} from '@/domain/usecases/importacao/planilhaDoCofre';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useImportacoesStore } from '@/store/importacoesStore';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';

/**
 * Importa a planilha do Cofre Klaus inteira: cria as contas, os cartões e as categorias que
 * faltam e grava tudo numa importação só (dá para desfazer em Importações), sem perguntas.
 */
export default function ImportarPlanilhaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; nome?: string }>();
  const { contas, carregar: carregarContas, criar: criarConta, atualizar: atualizarConta } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes, criar: criarCartao } = useCartoesStore();
  const { categorias, carregar: carregarCategorias, criar: criarCategoria } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { carregar: carregarGastos } = useGastosRapidosStore();
  const { importar } = useImportacoesStore();
  const { carregarTudo } = useDadosFinanceiros();

  const [linhas, setLinhas] = useState<LinhaDaPlanilha[] | null>(null);
  const [erros, setErros] = useState<ErroDaPlanilha[]>([]);
  const [falha, setFalha] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [feito, setFeito] = useState<{ importadas: number; jaImportadas: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([carregarContas(), carregarCartoes(), carregarCategorias(), carregarMembros(), carregarMovimentacoes(), carregarGastos()]);
    }, [carregarContas, carregarCartoes, carregarCategorias, carregarMembros, carregarMovimentacoes, carregarGastos])
  );

  useEffect(() => {
    if (!params.uri) return;
    lerTextoDoArquivo(params.uri)
      .then((texto) => {
        const lido = lerPlanilhaDoCofre(texto);
        setLinhas(lido.linhas);
        setErros(lido.erros);
      })
      .catch((erro: unknown) => setFalha(`Não consegui abrir a planilha. Detalhe técnico: ${detalheDoErro(erro)}`));
  }, [params.uri]);

  const plano = useMemo(
    () => (linhas ? planejarPlanilha(linhas, { contas, cartoes: cartoes.filter((c) => c.ativo !== false), categorias, membros }) : null),
    [linhas, contas, cartoes, categorias, membros]
  );

  async function importarTudo() {
    if (!linhas || !plano) return;
    setImportando(true);
    setFalha(null);
    try {
      for (const nova of plano.contasNovas) {
        await criarConta({ banco: nova.banco || nova.nome, nomeConta: nova.nome, saldoInicial: nova.saldoInicial, cor: colors.brand, icone: 'dollar-sign' });
      }
      for (const saldo of plano.saldosIniciais) await atualizarConta(saldo.contaId, { saldoInicial: saldo.saldoInicial });
      for (const novo of plano.cartoesNovos) {
        await criarCartao({ nome: novo.nome, limite: novo.limite, diaFechamento: novo.diaFechamento, diaVencimento: novo.diaVencimento, cor: colors.brand });
      }
      for (const [i, nova] of plano.categoriasNovas.entries()) {
        await criarCategoria({ nome: nova.nome, tipo: nova.tipo, cor: CORES_DE_CATEGORIA[i % CORES_DE_CATEGORIA.length], icone: 'tag', isPadrao: false });
      }
      await Promise.all([carregarContas(), carregarCartoes(), carregarCategorias(), carregarMovimentacoes(), carregarGastos()]);
      const idsExternos = new Set(
        [...useMovimentacoesStore.getState().movimentacoes, ...useGastosRapidosStore.getState().gastos]
          .map((l) => l.idExterno)
          .filter((id): id is string => typeof id === 'string' && id.startsWith('cofre:'))
      );
      const registro = montarRegistroDaPlanilha(
        linhas,
        {
          contas: useContasBancariasStore.getState().contas,
          cartoes: useCartoesStore.getState().cartoes.filter((c) => c.ativo !== false),
          categorias: useCategoriasStore.getState().categorias,
          membros,
          idsExternos,
        },
        { arquivo: params.nome ?? 'planilha.csv', criadaEm: new Date().toISOString() }
      );
      if (registro.importacao.importadas > 0) await importar(registro);
      carregarTudo();
      setFeito({ importadas: registro.importacao.importadas, jaImportadas: registro.jaImportadas });
    } catch (erro) {
      setFalha(`Não consegui importar. Nada foi gravado dos lançamentos. Detalhe técnico: ${detalheDoErro(erro)}`);
    } finally {
      setImportando(false);
    }
  }

  const linha = (rotulo: string, valor: string) => (
    <View key={rotulo} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
        {rotulo}
      </Text>
      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
        {valor}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Planilha do Cofre" subtitle={params.nome ?? undefined} />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {falha && (
            <Text className="font-body" style={{ color: colors.danger, fontSize: 13 }}>
              {falha}
            </Text>
          )}
          {!linhas && !falha && (
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
              Lendo a planilha…
            </Text>
          )}

          {feito ? (
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 18 }}>
                Pronto
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>
                {feito.importadas} lançamentos importados
                {feito.jaImportadas > 0 ? `; ${feito.jaImportadas} já estavam no app e ficaram como estavam` : ''}. Se algo
                ficou errado, dá para desfazer em Mais → Importações anteriores.
              </Text>
              <View style={{ height: 12 }} />
              <Button titulo="Ver o Início" onPress={() => router.replace('/(tabs)/dashboard')} />
              <View style={{ height: 8 }} />
              <Button titulo="Ver o relatório do ano" variante="secundaria" onPress={() => router.replace('/relatorios/anual')} />
            </Card>
          ) : (
            plano && (
              <>
                <Card>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16 }}>
                    {plano.lancamentos} lançamentos
                  </Text>
                  {plano.periodo && (
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 8 }}>
                      De {formatarData(plano.periodo.inicio)} a {formatarData(plano.periodo.fim)}
                    </Text>
                  )}
                  {linha('Entradas', formatarMoeda(plano.totais.entradas))}
                  {linha('Saídas das contas', formatarMoeda(plano.totais.saidas))}
                  {linha('Compras no cartão', formatarMoeda(plano.totais.comprasNoCartao))}
                  {linha('Faturas pagas', formatarMoeda(plano.totais.pagamentosDeFatura))}
                  {linha('Transferências entre as contas', formatarMoeda(plano.totais.transferencias))}
                </Card>

                {(plano.contasNovas.length > 0 || plano.cartoesNovos.length > 0 || plano.categoriasNovas.length > 0 || plano.saldosIniciais.length > 0) && (
                  <Card>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 6 }}>
                      Vai criar
                    </Text>
                    {plano.contasNovas.map((c) => linha(`Conta ${c.nome}`, `saldo inicial ${formatarMoeda(c.saldoInicial)}`))}
                    {plano.saldosIniciais.map((s) => linha(`Conta ${s.nome} (já existe)`, `saldo inicial passa a ${formatarMoeda(s.saldoInicial)}`))}
                    {plano.cartoesNovos.map((c) => linha(`Cartão ${c.nome}`, `fecha ${c.diaFechamento} · vence ${c.diaVencimento}`))}
                    {plano.categoriasNovas.length > 0 && (
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
                        Categorias: {plano.categoriasNovas.map((c) => c.nome).join(', ')}
                      </Text>
                    )}
                  </Card>
                )}

                {(plano.avisos.length > 0 || erros.length > 0) && (
                  <Card>
                    <Text className="font-heading-medium" style={{ color: colors.warning, fontSize: 15, marginBottom: 6 }}>
                      Atenção
                    </Text>
                    {plano.avisos.map((aviso) => (
                      <Text key={aviso} className="font-body" style={{ color: colors.text, fontSize: 13, marginBottom: 4 }}>
                        {aviso}
                      </Text>
                    ))}
                    {erros.slice(0, 20).map((e) => (
                      <Text key={e.numero} className="font-body" style={{ color: colors.text, fontSize: 13, marginBottom: 4 }}>
                        Linha {e.numero}: {e.motivo} (fica de fora)
                      </Text>
                    ))}
                    {erros.length > 20 && (
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                        e mais {erros.length - 20} linhas com problema
                      </Text>
                    )}
                  </Card>
                )}

                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                  Tudo entra como está na planilha, sem perguntas. Lançamentos que já vieram desta planilha antes não entram de
                  novo. Para começar do zero, use antes Configurações → Limpar todos os dados.
                </Text>
                <Button titulo="Importar tudo" onPress={() => void importarTudo()} carregando={importando} disabled={plano.lancamentos === 0} />
              </>
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
