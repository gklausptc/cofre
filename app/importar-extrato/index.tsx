import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import {
  decodificarLatin1,
  pareceArquivoBinario,
  parseCSV,
  parseDataExtrato,
  parseOFX,
  parseValorEmCentavos,
  removerBOM,
  temCaracteresInvalidos,
} from '@/core/utils/importParsers';
import {
  ehPagamentoOuEstorno,
  prepararImportacaoExtrato,
  type DestinoImportacao,
} from '@/domain/usecases/prepararImportacaoExtrato';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';

type Transacao = { id: string; data: string; descricao: string; valor: number; incluir: boolean };
type Etapa = 'destino' | 'arquivo' | 'mapear' | 'preview';
type TipoDestino = DestinoImportacao['tipo'];

const ERRO_ARQUIVO_NAO_SUPORTADO =
  'Esse arquivo não é CSV nem OFX. PDF não é suportado: exporte o extrato em CSV ou OFX no app do banco.';

const TIPOS_ACEITOS = [
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'application/x-ofx',
  'application/octet-stream',
];

/**
 * Lê o arquivo como texto. Tenta UTF-8 primeiro; se falhar (erro nativo de codificação) ou vier
 * com caracteres de substituição, lê os bytes e decodifica como Latin-1, codificação comum
 * em extratos de bancos brasileiros.
 */
async function lerArquivoComoTexto(uri: string): Promise<string> {
  const arquivo = new File(uri);
  let texto: string | null = null;
  try {
    texto = await arquivo.text();
  } catch {
    texto = null;
  }
  if (texto === null || temCaracteresInvalidos(texto)) {
    const bytes = await arquivo.bytes();
    texto = decodificarLatin1(bytes);
  }
  return removerBOM(texto);
}

export default function ImportarExtratoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { criar: criarMovimentacao } = useMovimentacoesStore();
  const { criar: criarGasto } = useGastosRapidosStore();

  useFocusEffect(
    useCallback(() => {
      carregarContas();
      carregarCartoes();
    }, [carregarContas, carregarCartoes])
  );

  const [etapa, setEtapa] = useState<Etapa>('destino');
  const [tipoDestino, setTipoDestino] = useState<TipoDestino>('conta');
  const [contaId, setContaId] = useState<number | null>(null);
  const [cartaoId, setCartaoId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [csv, setCsv] = useState<{ headers: string[]; linhas: string[][] } | null>(null);
  const [colData, setColData] = useState<string | null>(null);
  const [colDescricao, setColDescricao] = useState<string | null>(null);
  const [colValor, setColValor] = useState<string | null>(null);

  const [transacoes, setTransacoes] = useState<Transacao[]>([]);

  const cartoesAtivos = useMemo(() => cartoes.filter((c) => c.ativo !== false), [cartoes]);

  const destino = useMemo<DestinoImportacao | null>(() => {
    if (tipoDestino === 'conta') return contaId !== null ? { tipo: 'conta', contaBancariaId: contaId } : null;
    return cartaoId !== null ? { tipo: 'cartao', cartaoId } : null;
  }, [tipoDestino, contaId, cartaoId]);

  const bloqueada = useCallback(
    (t: Pick<Transacao, 'valor'>) => (destino ? ehPagamentoOuEstorno(t, destino) : false),
    [destino]
  );

  function definirTransacoes(lista: Omit<Transacao, 'incluir'>[]) {
    setTransacoes(lista.map((t) => ({ ...t, incluir: !bloqueada(t) })));
  }

  async function handleEscolherArquivo() {
    setErro(null);
    let conteudo: string;
    let nomeArquivo = '';
    try {
      const resultado = await DocumentPicker.getDocumentAsync({ type: TIPOS_ACEITOS, copyToCacheDirectory: true });
      if (resultado.canceled || resultado.assets.length === 0) return;
      const asset = resultado.assets[0];
      nomeArquivo = asset.name;
      conteudo = await lerArquivoComoTexto(asset.uri);
    } catch {
      setErro(ERRO_ARQUIVO_NAO_SUPORTADO);
      return;
    }

    if (/\.pdf$/i.test(nomeArquivo) || pareceArquivoBinario(conteudo)) {
      setErro(ERRO_ARQUIVO_NAO_SUPORTADO);
      return;
    }

    const ehOFX = /\.ofx$/i.test(nomeArquivo) || /<OFX>/i.test(conteudo);

    if (ehOFX) {
      const importadas = parseOFX(conteudo);
      if (importadas.length === 0) {
        setErro('Não encontrei transações nesse arquivo OFX.');
        return;
      }
      definirTransacoes(
        importadas.map((t, i) => ({ id: `ofx-${i}`, data: t.data, descricao: t.descricao, valor: t.valor }))
      );
      setEtapa('preview');
      return;
    }

    const resultadoCSV = parseCSV(conteudo);
    if (resultadoCSV.headers.length === 0 || resultadoCSV.linhas.length === 0) {
      setErro(ERRO_ARQUIVO_NAO_SUPORTADO);
      return;
    }
    setCsv(resultadoCSV);
    setColData(null);
    setColDescricao(null);
    setColValor(null);
    setEtapa('mapear');
  }

  function handleConfirmarMapeamento() {
    if (!csv || !colData || !colDescricao || !colValor) return;
    const idxData = csv.headers.indexOf(colData);
    const idxDescricao = csv.headers.indexOf(colDescricao);
    const idxValor = csv.headers.indexOf(colValor);

    const importadas = csv.linhas
      .map((linha, i) => {
        const dataIso = parseDataExtrato(linha[idxData] ?? '');
        const valor = parseValorEmCentavos(linha[idxValor] ?? '');
        if (!dataIso || Number.isNaN(valor)) return null;
        return {
          id: `csv-${i}`,
          data: dataIso,
          descricao: linha[idxDescricao] || 'Importado do extrato',
          valor,
        };
      })
      .filter((t): t is Omit<Transacao, 'incluir'> => t !== null);

    if (importadas.length === 0) {
      setErro('Nenhuma linha válida encontrada com essas colunas. Confira o mapeamento.');
      return;
    }
    setErro(null);
    definirTransacoes(importadas);
    setEtapa('preview');
  }

  function alternarInclusao(id: string) {
    setTransacoes((atual) =>
      atual.map((t) => (t.id === id && !bloqueada(t) ? { ...t, incluir: !t.incluir } : t))
    );
  }

  const selecionadas = useMemo(
    () => transacoes.filter((t) => t.incluir && !bloqueada(t)),
    [transacoes, bloqueada]
  );

  async function handleImportar() {
    if (!destino || selecionadas.length === 0) return;
    setSalvando(true);
    try {
      const preparada = prepararImportacaoExtrato(selecionadas, destino);
      for (const mov of preparada.movimentacoes) {
        await criarMovimentacao(mov);
      }
      for (const gasto of preparada.gastos) {
        await criarGasto(gasto);
      }
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  const opcoesDestino = useMemo(
    () =>
      tipoDestino === 'conta'
        ? contas.map((c) => ({ valor: String(c.id), rotulo: c.nomeConta }))
        : cartoesAtivos.map((c) => ({ valor: String(c.id), rotulo: c.nome })),
    [tipoDestino, contas, cartoesAtivos]
  );

  const semOpcoesDeDestino = opcoesDestino.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ScreenHeader title="Importar extrato" subtitle="CSV ou OFX do seu banco ou cartão" />

        {etapa === 'destino' && (
          <>
            <ChipSelect<TipoDestino>
              label="Importar para"
              opcoes={[
                { valor: 'conta', rotulo: 'Conta bancária' },
                { valor: 'cartao', rotulo: 'Cartão de crédito' },
              ]}
              valor={tipoDestino}
              onSelecionar={setTipoDestino}
            />
            {semOpcoesDeDestino ? (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                {tipoDestino === 'conta'
                  ? 'Cadastre uma conta bancária antes de importar um extrato.'
                  : 'Cadastre um cartão de crédito antes de importar uma fatura.'}
              </Text>
            ) : (
              <>
                <ChipSelect
                  label={tipoDestino === 'conta' ? 'Qual conta?' : 'Qual cartão?'}
                  opcoes={opcoesDestino}
                  valor={
                    tipoDestino === 'conta'
                      ? contaId !== null
                        ? String(contaId)
                        : ''
                      : cartaoId !== null
                        ? String(cartaoId)
                        : ''
                  }
                  onSelecionar={(v) => (tipoDestino === 'conta' ? setContaId(Number(v)) : setCartaoId(Number(v)))}
                />
                {tipoDestino === 'cartao' && (
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
                    Cada linha da fatura vira um gasto no cartão. Pagamentos e estornos (valores negativos) são
                    ignorados.
                  </Text>
                )}
                <Button titulo="Continuar" onPress={() => setEtapa('arquivo')} disabled={!destino} />
              </>
            )}
          </>
        )}

        {etapa === 'arquivo' && (
          <>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
              Selecione o arquivo .csv ou .ofx exportado do internet banking ou do app do cartão. PDF não é
              suportado.
            </Text>
            {erro && (
              <Text className="font-body" style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>
                {erro}
              </Text>
            )}
            <Button titulo="Selecionar arquivo" onPress={handleEscolherArquivo} />
          </>
        )}

        {etapa === 'mapear' && csv && (
          <>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
              Diga qual coluna do arquivo corresponde a cada campo.
            </Text>
            <ChipSelect
              label="Coluna da data"
              opcoes={csv.headers.map((h) => ({ valor: h, rotulo: h }))}
              valor={colData ?? ''}
              onSelecionar={setColData}
            />
            <ChipSelect
              label="Coluna da descrição"
              opcoes={csv.headers.map((h) => ({ valor: h, rotulo: h }))}
              valor={colDescricao ?? ''}
              onSelecionar={setColDescricao}
            />
            <ChipSelect
              label="Coluna do valor"
              opcoes={csv.headers.map((h) => ({ valor: h, rotulo: h }))}
              valor={colValor ?? ''}
              onSelecionar={setColValor}
            />
            {erro && (
              <Text className="font-body" style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>
                {erro}
              </Text>
            )}
            <Button
              titulo="Ver prévia"
              onPress={handleConfirmarMapeamento}
              disabled={!colData || !colDescricao || !colValor}
            />
          </>
        )}

        {etapa === 'preview' && (
          <>
            <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, marginBottom: 12 }}>
              {selecionadas.length} de {transacoes.length} transações serão importadas
            </Text>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {transacoes.map((t) => {
                const desabilitada = bloqueada(t);
                const marcada = t.incluir && !desabilitada;
                return (
                  <Pressable key={t.id} onPress={() => alternarInclusao(t.id)} disabled={desabilitada}>
                    <Card
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        opacity: marcada ? 1 : 0.4,
                      }}
                    >
                      <Feather
                        name={marcada ? 'check-square' : 'square'}
                        size={18}
                        color={desabilitada ? colors.textMuted : colors.brand}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          className="font-body-medium"
                          style={{ color: colors.text, fontSize: 13 }}
                          numberOfLines={1}
                        >
                          {t.descricao}
                        </Text>
                        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                          {formatarData(t.data)}
                          {desabilitada ? ' · pagamento/estorno' : ''}
                        </Text>
                      </View>
                      <Text
                        className="font-heading-medium"
                        style={{
                          color:
                            tipoDestino === 'cartao'
                              ? t.valor < 0
                                ? colors.textMuted
                                : colors.text
                              : t.valor < 0
                                ? colors.danger
                                : colors.success,
                          fontSize: 13,
                        }}
                      >
                        {formatarMoeda(t.valor)}
                      </Text>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
            <Button
              titulo={`Importar ${selecionadas.length} transaç${selecionadas.length === 1 ? 'ão' : 'ões'}`}
              onPress={handleImportar}
              disabled={selecionadas.length === 0}
              carregando={salvando}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
