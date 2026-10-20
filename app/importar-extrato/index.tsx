import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { Button } from '@/components/Button';
import { MonthSelector } from '@/components/MonthSelector';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useImportacoesStore } from '@/store/importacoesStore';
import { decodificarLatin1, removerBOM, temCaracteresInvalidos } from '@/core/utils/importParsers';
import { lerCsvComMapeamento, lerExtrato, type TabelaCsv } from '@/domain/usecases/importacao/lerExtrato';
import {
  analisarImportacao,
  dataNaFatura,
  existentesDoDestino,
  montarRegistroDeImportacao,
  sugerirDestino,
  sugerirMesDaFatura,
} from '@/domain/usecases/importacao/analisarImportacao';
import { COMO_EXPORTAR } from '@/domain/dados/comoExportar';
import { normalizarDescricao } from '@/domain/usecases/importacao/normalizarDescricao';
import { NOMES_DOS_BANCOS } from '@/domain/usecases/importacao/bancos';
import type { BancoId, ExtratoLido, OrigemExtrato } from '@/domain/usecases/importacao/tipos';
import type { DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarMesReferencia, mesAnterior, mesSeguinte } from '@/core/utils/date';

type Etapa = 'arquivo' | 'mapear' | 'destino' | 'preview';

const TIPOS_ACEITOS = [
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'application/x-ofx',
  'application/vnd.ms-excel',
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

function GuiaDosBancos() {
  const { colors } = useAppTheme();
  const [aberto, setAberto] = useState(false);
  return (
    <Card style={{ marginTop: 16 }}>
      <Pressable onPress={() => setAberto((a) => !a)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        <Feather name="help-circle" size={18} color={colors.brand} style={{ marginRight: 8 }} />
        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, flex: 1 }}>
          Como exportar do meu banco
        </Text>
        <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {aberto &&
        COMO_EXPORTAR.map((item) => (
          <View key={item.banco} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
              {NOMES_DOS_BANCOS[item.banco]}
            </Text>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              Conta: {item.conta}
            </Text>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              Cartão: {item.cartao}
            </Text>
          </View>
        ))}
    </Card>
  );
}

function Voltar({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
        ‹ Voltar
      </Text>
    </Pressable>
  );
}

export default function ImportarExtratoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const importar = useImportacoesStore((s) => s.importar);

  useFocusEffect(
    useCallback(() => {
      carregarContas();
      carregarCartoes();
      carregarMovimentacoes();
      carregarGastos();
    }, [carregarContas, carregarCartoes, carregarMovimentacoes, carregarGastos])
  );

  const [etapa, setEtapa] = useState<Etapa>('arquivo');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState('');

  // CSV que o app não reconheceu: o usuário diz qual coluna é qual
  const [tabela, setTabela] = useState<{ tabela: TabelaCsv; banco: BancoId | null; origem: OrigemExtrato | null } | null>(null);
  const [colData, setColData] = useState<string | null>(null);
  const [colDescricao, setColDescricao] = useState<string | null>(null);
  const [colValor, setColValor] = useState<string | null>(null);

  const [extrato, setExtrato] = useState<ExtratoLido | null>(null);
  const [tipoDestino, setTipoDestino] = useState<OrigemExtrato>('conta');
  const [contaId, setContaId] = useState<number | null>(null);
  const [cartaoId, setCartaoId] = useState<number | null>(null);
  // fatura que vence neste mês ('YYYY-MM'): tudo do arquivo entra nela
  const [mesFatura, setMesFatura] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const cartoesAtivos = useMemo(() => cartoes.filter((c) => c.ativo !== false), [cartoes]);

  const destino = useMemo<DestinoImportacao | null>(() => {
    if (tipoDestino === 'conta') return contaId !== null ? { tipo: 'conta', contaBancariaId: contaId } : null;
    return cartaoId !== null ? { tipo: 'cartao', cartaoId } : null;
  }, [tipoDestino, contaId, cartaoId]);

  const cartaoEscolhido = useMemo(
    () => (tipoDestino === 'cartao' ? (cartoesAtivos.find((c) => c.id === cartaoId) ?? null) : null),
    [tipoDestino, cartoesAtivos, cartaoId]
  );
  const fatura = cartaoEscolhido && mesFatura ? { mes: mesFatura, cartao: cartaoEscolhido } : null;

  function escolherCartao(id: number | null, lido: ExtratoLido | null = extrato) {
    setCartaoId(id);
    const cartao = cartoesAtivos.find((c) => c.id === id);
    setMesFatura(cartao && lido ? sugerirMesDaFatura(lido, cartao) : null);
  }

  const analise = useMemo(
    () => (extrato && destino ? analisarImportacao(extrato, destino, existentesDoDestino(destino, movimentacoes, gastos)) : null),
    [extrato, destino, movimentacoes, gastos]
  );

  function irParaDestino(lido: ExtratoLido) {
    const sugestao = sugerirDestino(lido, contas, cartoesAtivos);
    setExtrato(lido);
    setTipoDestino(sugestao.tipo);
    setContaId(sugestao.tipo === 'conta' ? sugestao.id : null);
    escolherCartao(sugestao.tipo === 'cartao' ? sugestao.id : null, lido);
    setEtapa('destino');
  }

  async function handleEscolherArquivo() {
    setErro(null);
    let conteudo: string;
    let nome = '';
    try {
      const resultado = await DocumentPicker.getDocumentAsync({ type: TIPOS_ACEITOS, copyToCacheDirectory: true });
      if (resultado.canceled || resultado.assets.length === 0) return;
      const asset = resultado.assets[0];
      nome = asset.name;
      conteudo = await lerArquivoComoTexto(asset.uri);
    } catch {
      setErro('Não consegui abrir esse arquivo.');
      return;
    }
    setNomeArquivo(nome);

    const leitura = lerExtrato(conteudo, nome);
    if (leitura.ok) {
      irParaDestino(leitura.extrato);
      return;
    }
    if (leitura.motivo === 'precisa_mapear') {
      setTabela({ tabela: leitura.tabela, banco: leitura.banco, origem: leitura.origem });
      setColData(null);
      setColDescricao(null);
      setColValor(null);
      setEtapa('mapear');
      return;
    }
    setErro(leitura.mensagem);
  }

  function handleConfirmarMapeamento() {
    if (!tabela || colData === null || colDescricao === null || colValor === null) return;
    const lido = lerCsvComMapeamento(
      tabela.tabela,
      { data: Number(colData), descricao: [Number(colDescricao)], valor: Number(colValor) },
      tabela.banco,
      tabela.origem
    );
    if (lido.transacoes.length === 0) {
      setErro('Nenhuma linha válida encontrada com essas colunas. Confira o mapeamento.');
      return;
    }
    setErro(null);
    irParaDestino(lido);
  }

  function handleVerPrevia() {
    if (!analise) return;
    setMarcadas(new Set(analise.itens.filter((i) => i.incluirPorPadrao).map((i) => i.transacao.idExterno)));
    setEtapa('preview');
  }

  function alternar(idExterno: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(idExterno)) nova.delete(idExterno);
      else nova.add(idExterno);
      return nova;
    });
  }

  const selecionadas = useMemo(
    () => (analise ? analise.itens.filter((i) => i.podeIncluir && marcadas.has(i.transacao.idExterno)).map((i) => i.transacao) : []),
    [analise, marcadas]
  );

  async function handleImportar() {
    if (!extrato || !destino || selecionadas.length === 0) return;
    setSalvando(true);
    try {
      await importar(montarRegistroDeImportacao({ arquivo: nomeArquivo, extrato, destino, selecionadas, agora: new Date(), fatura }));
      await Promise.all([carregarMovimentacoes(), carregarGastos()]);
      Alert.alert(
        'Extrato importado',
        `${selecionadas.length} ${selecionadas.length === 1 ? 'lançamento importado' : 'lançamentos importados'}.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch {
      setErro('Não consegui importar. Nada foi gravado; tente de novo.');
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
  const opcoesColunas = tabela?.tabela.cabecalho.map((h, i) => ({ valor: String(i), rotulo: h || `Coluna ${i + 1}` })) ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ScreenHeader title="Importar extrato" subtitle="CSV ou OFX do seu banco ou cartão" />

        {erro && (
          <Text className="font-body" style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>
            {erro}
          </Text>
        )}

        {etapa === 'arquivo' && (
          <>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
              Selecione o arquivo .csv ou .ofx exportado do app ou internet banking (extrato da conta ou fatura do
              cartão). O Cofre reconhece o banco e o tipo de arquivo sozinho. PDF não é suportado.
            </Text>
            <Button titulo="Selecionar arquivo" onPress={handleEscolherArquivo} />
            <GuiaDosBancos />
          </>
        )}

        {etapa === 'mapear' && tabela && (
          <>
            <Voltar onPress={() => setEtapa('arquivo')} />
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
              Não reconheci o formato deste arquivo. Diga qual coluna corresponde a cada campo.
            </Text>
            <ChipSelect label="Coluna da data" opcoes={opcoesColunas} valor={colData ?? ''} onSelecionar={setColData} />
            <ChipSelect label="Coluna da descrição" opcoes={opcoesColunas} valor={colDescricao ?? ''} onSelecionar={setColDescricao} />
            <ChipSelect label="Coluna do valor" opcoes={opcoesColunas} valor={colValor ?? ''} onSelecionar={setColValor} />
            <Button
              titulo="Continuar"
              onPress={handleConfirmarMapeamento}
              disabled={colData === null || colDescricao === null || colValor === null}
            />
          </>
        )}

        {etapa === 'destino' && extrato && (
          <>
            <Voltar onPress={() => setEtapa('arquivo')} />
            <Card style={{ marginBottom: 16 }}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>
                {nomeArquivo}
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                {extrato.banco ? NOMES_DOS_BANCOS[extrato.banco] : 'Banco não identificado'} ·{' '}
                {extrato.origem === 'cartao' ? 'fatura de cartão' : extrato.origem === 'conta' ? 'extrato de conta' : 'tipo não identificado'}{' '}
                · {extrato.transacoes.length} {extrato.transacoes.length === 1 ? 'lançamento' : 'lançamentos'}
                {extrato.periodo ? ` de ${formatarData(extrato.periodo.inicio)} a ${formatarData(extrato.periodo.fim)}` : ''}
              </Text>
            </Card>

            <ChipSelect<OrigemExtrato>
              label="Importar para"
              opcoes={[
                { valor: 'conta', rotulo: 'Conta bancária' },
                { valor: 'cartao', rotulo: 'Cartão de crédito' },
              ]}
              valor={tipoDestino}
              onSelecionar={(tipo) => {
                setTipoDestino(tipo);
                const sugestao = sugerirDestino({ banco: extrato.banco, origem: tipo }, contas, cartoesAtivos);
                if (tipo === 'conta') setContaId(sugestao.id);
                else escolherCartao(sugestao.id);
              }}
            />
            {opcoesDestino.length === 0 ? (
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
                  valor={tipoDestino === 'conta' ? (contaId !== null ? String(contaId) : '') : cartaoId !== null ? String(cartaoId) : ''}
                  onSelecionar={(v) => (tipoDestino === 'conta' ? setContaId(Number(v)) : escolherCartao(Number(v)))}
                />
                {tipoDestino === 'cartao' && mesFatura && (
                  <View style={{ marginBottom: 12 }}>
                    <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
                      Fatura que vence em
                    </Text>
                    <MonthSelector
                      mesReferencia={mesFatura}
                      onAnterior={() => setMesFatura(mesAnterior(mesFatura))}
                      onProximo={() => setMesFatura(mesSeguinte(mesFatura))}
                    />
                  </View>
                )}
                {tipoDestino === 'cartao' && (
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
                    Cada compra da fatura vira um gasto no cartão, dentro da fatura acima. Pagamentos e estornos
                    (valores negativos) não são importados.
                  </Text>
                )}
                <Button titulo="Ver o que vai entrar" onPress={handleVerPrevia} disabled={!destino} />
              </>
            )}
          </>
        )}

        {etapa === 'preview' && analise && (
          <>
            <Voltar onPress={() => setEtapa('destino')} />
            <Card style={{ marginBottom: 16 }}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                {selecionadas.length} de {analise.resumo.total} serão importados
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                {[
                  `${analise.resumo.novas} ${analise.resumo.novas === 1 ? 'novo' : 'novos'}`,
                  analise.resumo.jaImportadas > 0 ? `${analise.resumo.jaImportadas} já importados antes` : null,
                  analise.resumo.duplicatas + analise.resumo.duvidas > 0
                    ? `${analise.resumo.duplicatas + analise.resumo.duvidas} parecem já lançados à mão`
                    : null,
                  analise.resumo.pagamentosOuEstornos > 0
                    ? `${analise.resumo.pagamentosOuEstornos} ${analise.resumo.pagamentosOuEstornos === 1 ? 'pagamento ou estorno' : 'pagamentos ou estornos'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {fatura && (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  Tudo entra na fatura que vence em {formatarMesReferencia(fatura.mes)}.
                </Text>
              )}
            </Card>

            <View style={{ gap: 8, marginBottom: 20 }}>
              {analise.itens.map((item) => {
                const t = item.transacao;
                const marcada = item.podeIncluir && marcadas.has(t.idExterno);
                const parcela = t.parcela ?? normalizarDescricao(t.descricao).parcela;
                const antiga = fatura ? dataNaFatura(t.data, fatura.mes, fatura.cartao).ajustada : false;
                const aviso =
                  item.situacao.tipo === 'ja_importada'
                    ? 'já importado antes'
                    : item.pagamentoOuEstorno
                      ? 'pagamento ou estorno'
                      : item.situacao.tipo === 'duplicata'
                        ? 'igual a um lançamento que você já fez'
                        : item.situacao.tipo === 'duvida'
                          ? 'pode ser um lançamento que você já fez'
                          : null;
                return (
                  <Pressable key={t.idExterno} onPress={() => alternar(t.idExterno)} disabled={!item.podeIncluir}>
                    <Card style={{ flexDirection: 'row', alignItems: 'center', opacity: marcada ? 1 : 0.5 }}>
                      <Feather
                        name={marcada ? 'check-square' : 'square'}
                        size={18}
                        color={item.podeIncluir ? colors.brand : colors.textMuted}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                          {t.descricao}
                        </Text>
                        <Text className="font-body" style={{ color: aviso && item.podeIncluir ? colors.warning : colors.textMuted, fontSize: 11 }}>
                          {antiga ? `compra em ${formatarData(t.data)}` : formatarData(t.data)}
                          {parcela ? ` · parcela ${parcela.numero}/${parcela.total}` : ''}
                          {aviso ? ` · ${aviso}` : ''}
                        </Text>
                      </View>
                      <Text
                        className="font-heading-medium"
                        style={{
                          color: tipoDestino === 'cartao' ? (t.valor < 0 ? colors.textMuted : colors.text) : t.valor < 0 ? colors.danger : colors.success,
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
              titulo={`Importar ${selecionadas.length} ${selecionadas.length === 1 ? 'lançamento' : 'lançamentos'}`}
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
