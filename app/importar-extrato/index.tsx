import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
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
import { useCategoriasStore } from '@/store/categoriasStore';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useFaturasStore } from '@/store/faturasStore';
import { useRegrasStore } from '@/store/regrasStore';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { TextField } from '@/components/TextField';
import { abrirSeletorDeArquivos } from '@/core/arquivos/seletorDeArquivos';
import { detalheDoErro, lerArquivoDeExtrato, TIPOS_DE_ARQUIVO_DE_EXTRATO } from '@/core/importacao/lerArquivoDeExtrato';
import { lerCsvComMapeamento, type TabelaCsv } from '@/domain/usecases/importacao/lerExtrato';
import {
  analisarImportacao,
  dataNaFatura,
  linhaDoItem,
  montarRegistroDeImportacao,
  naturezaDaLinha,
  sugerirDestino,
  sugerirMesDaFatura,
  type ItemDaAnalise,
} from '@/domain/usecases/importacao/analisarImportacao';
import { textoParaRegra } from '@/domain/usecases/importacao/categorizar';
import { existentesParaImportar, montarInteligencia, type BaseDaImportacao } from '@/domain/usecases/importacao/importacaoEmLote';
import { juntarNomeProprio, lerNomesProprios } from '@/domain/usecases/importacao/nomesProprios';
import { identificadorDoExtrato } from '@/domain/usecases/importacao/dadosDoArquivo';
import { lerTextoColado } from '@/domain/usecases/importacao/lerTextoColado';
import { montarFilaDePerguntas } from '@/domain/usecases/importacao/montarFilaDePerguntas';
import type { DadosRegraCategorizacao } from '@/domain/repositories/importacoesRepository';
import { LinhaDaPrevia } from '@/components/importacao/LinhaDaPrevia';
import { COMO_EXPORTAR } from '@/domain/dados/comoExportar';
import { NOMES_DOS_BANCOS } from '@/domain/usecases/importacao/bancos';
import type { BancoId, ExtratoLido, OrigemExtrato } from '@/domain/usecases/importacao/tipos';
import type { DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';
import { formatarData, formatarMesReferencia, hojeIso, mesAnterior, mesSeguinte } from '@/core/utils/date';

type Etapa = 'arquivo' | 'colar' | 'senha' | 'mapear' | 'destino' | 'preview';

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
  const { contas, carregar: carregarContas, atualizar: atualizarConta } = useContasBancariasStore();
  const { preferencias, carregar: carregarPreferencias, atualizar: atualizarPreferencias } = usePreferenciasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { importar, importacoes, carregar: carregarImportacoes } = useImportacoesStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { contas: contasFixas, carregar: carregarContasFixas } = useContasFixasStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { faturas, carregar: carregarFaturas } = useFaturasStore();
  const { regras, contatos, carregar: carregarRegras } = useRegrasStore();

  useFocusEffect(
    useCallback(() => {
      carregarContas();
      carregarCartoes();
      carregarMovimentacoes();
      carregarGastos();
      carregarCategorias();
      carregarContasFixas();
      carregarParcelas();
      carregarCompras();
      carregarFaturas();
      carregarRegras();
      carregarImportacoes();
      carregarPreferencias();
    }, [
      carregarContas,
      carregarCartoes,
      carregarMovimentacoes,
      carregarGastos,
      carregarCategorias,
      carregarContasFixas,
      carregarParcelas,
      carregarCompras,
      carregarFaturas,
      carregarRegras,
      carregarImportacoes,
      carregarPreferencias,
    ])
  );

  const [etapa, setEtapa] = useState<Etapa>('arquivo');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState('');
  // PDF com senha: o arquivo espera a senha
  const [pendente, setPendente] = useState<{ uri: string; nome: string } | null>(null);
  const [senha, setSenha] = useState('');
  const [abrindo, setAbrindo] = useState(false);
  // prints colados (Texto ao Vivo do iPhone): um bloco por print
  const [blocos, setBlocos] = useState<string[]>([]);
  const [textoColado, setTextoColado] = useState('');
  const [origemColada, setOrigemColada] = useState<OrigemExtrato>('cartao');

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
  // categoria escolhida na prévia, por descrição (vale para todas as linhas iguais)
  const [escolhas, setEscolhas] = useState<Map<string, { categoriaId: number; sempre: boolean }>>(new Map());
  const [aberta, setAberta] = useState<string | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);

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

  // o seu nome nos bancos (e o titular deste arquivo): PIX para você mesmo é transferência
  const nomesSalvos = useMemo(() => lerNomesProprios(preferencias?.nomesProprios ?? null), [preferencias]);
  const nomesProprios = useMemo(() => juntarNomeProprio(nomesSalvos, extrato?.titular ?? null), [nomesSalvos, extrato]);
  const base = useMemo<BaseDaImportacao>(
    () => ({ categorias, regras, contatos, contas, cartoes, contasFixas, parcelas, compras, gastos, faturas, movimentacoes, importacoes, nomesProprios }),
    [categorias, regras, contatos, contas, cartoes, contasFixas, parcelas, compras, gastos, faturas, movimentacoes, importacoes, nomesProprios]
  );
  const inteligencia = useMemo(() => montarInteligencia(base, mesFatura), [base, mesFatura]);
  const categorizar = inteligencia.categorizar;

  const analise = useMemo(() => {
    if (!extrato || !destino) return null;
    return analisarImportacao(extrato, destino, existentesParaImportar(destino, base), inteligencia);
  }, [extrato, destino, base, inteligencia]);

  const chaveDaEscolha = useCallback(
    (item: ItemDaAnalise) => (destino ? `${naturezaDaLinha(item.transacao, destino)}|${textoParaRegra(item.transacao.descricao)}` : ''),
    [destino]
  );
  const categoriaDoItem = useCallback(
    (item: ItemDaAnalise) => escolhas.get(chaveDaEscolha(item))?.categoriaId ?? item.categoriaSugerida,
    [escolhas, chaveDaEscolha]
  );

  function irParaDestino(lido: ExtratoLido) {
    const sugestao = sugerirDestino(lido, contas, cartoesAtivos);
    setExtrato(lido);
    setTipoDestino(sugestao.tipo);
    setContaId(sugestao.tipo === 'conta' ? sugestao.id : null);
    escolherCartao(sugestao.tipo === 'cartao' ? sugestao.id : null, lido);
    setEtapa('destino');
  }

  async function lerArquivo(uri: string, nome: string, senhaDoPdf: string) {
    setNomeArquivo(nome);
    setAbrindo(true);
    let leitura: Awaited<ReturnType<typeof lerArquivoDeExtrato>>;
    try {
      leitura = await lerArquivoDeExtrato(uri, nome, senhaDoPdf);
    } catch (falha) {
      setErro(`Não consegui abrir esse arquivo. Detalhe técnico: ${detalheDoErro(falha)}`);
      return;
    } finally {
      setAbrindo(false);
    }
    if (!leitura.ok && (leitura.motivo === 'precisa_senha' || leitura.motivo === 'senha_errada')) {
      setPendente({ uri, nome });
      setErro(leitura.motivo === 'senha_errada' ? leitura.mensagem : null);
      setEtapa('senha');
      return;
    }
    setPendente(null);
    setSenha('');
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

  async function handleEscolherArquivo() {
    setErro(null);
    try {
      const resultado = await abrirSeletorDeArquivos(TIPOS_DE_ARQUIVO_DE_EXTRATO, true);
      if (resultado.canceled || resultado.assets.length === 0) return;
      if (resultado.assets.length > 1) {
        // vários de uma vez: a importação em lote cria as contas e importa tudo na ordem
        router.push({
          pathname: '/importar-extrato/lote',
          params: { arquivos: JSON.stringify(resultado.assets.map((a) => ({ uri: a.uri, nome: a.name }))) },
        });
        return;
      }
      await lerArquivo(resultado.assets[0].uri, resultado.assets[0].name, '');
    } catch {
      setErro('Não consegui abrir esse arquivo.');
    }
  }

  async function colarDoPrint() {
    setErro(null);
    const copiado = (await Clipboard.getStringAsync()).trim();
    if (copiado === '') {
      setErro('Não há texto copiado. Na Fotos, abra o print, toque no ícone de texto e em "Copiar tudo".');
      return;
    }
    setBlocos((atuais) => (atuais.includes(copiado) ? atuais : [...atuais, copiado]));
  }

  function adicionarTextoDigitado() {
    const limpo = textoColado.trim();
    if (limpo === '') return;
    setBlocos((atuais) => [...atuais, limpo]);
    setTextoColado('');
  }

  function lerPrints() {
    const lido = lerTextoColado(blocos, origemColada, hojeIso());
    if (!lido) {
      setErro('Não encontrei compras com data e valor nesse texto. Confira se copiou o print inteiro.');
      return;
    }
    setErro(null);
    setNomeArquivo(blocos.length === 1 ? 'Texto de um print' : `Texto de ${blocos.length} prints`);
    irParaDestino(lido);
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
    setEscolhas(new Map());
    setAberta(null);
    setSoPendentes(false);
    setEtapa('preview');
  }

  function escolherCategoria(item: ItemDaAnalise, categoriaId: number) {
    setEscolhas((atual) => {
      const nova = new Map(atual);
      nova.set(chaveDaEscolha(item), { categoriaId, sempre: atual.get(chaveDaEscolha(item))?.sempre ?? true });
      return nova;
    });
  }

  function alternarSempre(item: ItemDaAnalise, sempre: boolean) {
    setEscolhas((atual) => {
      const escolha = atual.get(chaveDaEscolha(item));
      if (!escolha) return atual;
      const nova = new Map(atual);
      nova.set(chaveDaEscolha(item), { ...escolha, sempre });
      return nova;
    });
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
    () => (analise ? analise.itens.filter((i) => i.podeIncluir && marcadas.has(i.transacao.idExterno)) : []),
    [analise, marcadas]
  );
  const pendentesAgora = useMemo(
    () => selecionadas.filter((i) => i.precisaDeVoce && (i.situacao.tipo === 'duvida' || categoriaDoItem(i) === null)).length,
    [selecionadas, categoriaDoItem]
  );

  async function handleImportar() {
    if (!extrato || !destino || selecionadas.length === 0) return;
    setSalvando(true);
    try {
      const agora = new Date();
      const regrasNovas: DadosRegraCategorizacao[] = [];
      for (const [chave, escolha] of escolhas) {
        const [natureza, padrao] = chave.split('|');
        if (!escolha.sempre || padrao === '' || (natureza !== 'despesa' && natureza !== 'receita')) continue;
        regrasNovas.push({
          padrao,
          tipoCorrespondencia: 'contem',
          natureza,
          categoriaId: escolha.categoriaId,
          membroId: null,
          acao: 'categorizar',
          contaFixaId: null,
          criadaEm: agora.toISOString(),
          vezesUsada: 0,
        });
      }
      const registro = montarRegistroDeImportacao({
        arquivo: nomeArquivo,
        extrato,
        destino,
        linhas: selecionadas.map((i) => linhaDoItem(i, categoriaDoItem(i))),
        agora,
        fatura,
        regrasNovas,
      });
      const existentes = existentesParaImportar(destino, base);
      registro.perguntas = montarFilaDePerguntas({
        extrato,
        destino,
        itens: analise?.itens ?? [],
        registro,
        cartao: cartaoEscolhido,
        mesDaFatura: tipoDestino === 'cartao' ? mesFatura : null,
        categorizar,
        movimentacoes,
        gastos,
        contasFixas,
        compras,
        parcelas,
        regras,
        descricaoDoExistente: (id) => {
          const existente = existentes.find((e) => e.id === id);
          return existente ? { descricao: existente.descricao, data: existente.data, valor: Math.abs(existente.valor) } : null;
        },
      });
      const importacaoId = await importar(registro);
      if (nomesProprios.length !== nomesSalvos.length) await atualizarPreferencias({ nomesProprios: JSON.stringify(nomesProprios) });
      const identificador = identificadorDoExtrato(extrato);
      const conta = destino.tipo === 'conta' ? contas.find((c) => c.id === destino.contaBancariaId) : undefined;
      if (identificador && conta && !conta.identificadorExtrato) await atualizarConta(conta.id, { identificadorExtrato: identificador });
      await Promise.all([
        carregarMovimentacoes(),
        carregarGastos(),
        carregarParcelas(),
        carregarFaturas(),
        carregarRegras(),
      ]);
      router.replace({ pathname: '/importar-extrato/resultado', params: { id: String(importacaoId) } });
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
        <ScreenHeader title="Importar extrato" subtitle="CSV, OFX, PDF ou prints do seu banco ou cartão" />

        {erro && (
          <Text className="font-body" style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>
            {erro}
          </Text>
        )}

        {etapa === 'arquivo' && (
          <>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
              Selecione o arquivo .csv, .ofx ou .pdf exportado do app ou internet banking (extrato da conta ou fatura
              do cartão). O Cofre reconhece o banco e o tipo de arquivo sozinho. Escolha vários de uma vez para
              importar o ano todo: ele cria as contas e os cartões que faltam.
            </Text>
            <Button titulo="Selecionar arquivos" onPress={handleEscolherArquivo} carregando={abrindo} />
            <View style={{ marginTop: 12 }}>
              <Button titulo="Colar texto de prints (fatura em aberto)" variante="secundaria" onPress={() => setEtapa('colar')} />
            </View>
            <GuiaDosBancos />
            <View style={{ marginTop: 12 }}>
              <Button titulo="Importações anteriores" variante="secundaria" onPress={() => router.push('/importar-extrato/historico')} />
            </View>
          </>
        )}

        {etapa === 'colar' && (
          <>
            <Voltar onPress={() => setEtapa('arquivo')} />
            <Card style={{ marginBottom: 12 }}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14 }}>
                Para a fatura que ainda não fechou
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                1. Tire prints da fatura no app do banco.{'\n'}2. Na Fotos, abra o print, toque no ícone de texto (canto de
                baixo) e em &quot;Copiar tudo&quot;.{'\n'}3. Volte aqui e toque em &quot;Colar do print&quot;. Repita para cada print: o
                que se repetir entre eles entra uma vez só.
              </Text>
            </Card>
            <ChipSelect<OrigemExtrato>
              label="É de"
              opcoes={[
                { valor: 'cartao', rotulo: 'Cartão de crédito' },
                { valor: 'conta', rotulo: 'Conta' },
              ]}
              valor={origemColada}
              onSelecionar={setOrigemColada}
            />
            <Button titulo={blocos.length === 0 ? 'Colar do print' : 'Colar mais um print'} onPress={colarDoPrint} />
            {blocos.map((bloco, i) => (
              <View key={`${i}-${bloco.length}`} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                <Feather name="image" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                <Text className="font-body" style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                  Print {i + 1}: {bloco.split('\n').filter((l) => l.trim() !== '').length} linhas
                </Text>
                <Pressable
                  onPress={() => setBlocos((atuais) => atuais.filter((_, j) => j !== i))}
                  accessibilityRole="button"
                  accessibilityLabel={`Tirar o print ${i + 1}`}
                  hitSlop={10}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}
                >
                  <Feather name="x" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
            <View style={{ marginTop: 16 }}>
              <TextField
                label="Ou cole/digite aqui"
                value={textoColado}
                onChangeText={setTextoColado}
                multiline
                placeholder={'18 OUT\nUBER *TRIP 23,90'}
                style={{ minHeight: 90, textAlignVertical: 'top' }}
              />
              {textoColado.trim() !== '' && <Button titulo="Adicionar este texto" variante="secundaria" onPress={adicionarTextoDigitado} />}
            </View>
            <View style={{ marginTop: 12 }}>
              <Button titulo="Ler os prints" onPress={lerPrints} disabled={blocos.length === 0} />
            </View>
          </>
        )}

        {etapa === 'senha' && pendente && (
          <>
            <Voltar onPress={() => setEtapa('arquivo')} />
            <Card style={{ marginBottom: 12 }}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>
                {pendente.nome}
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                Esse PDF tem senha. O banco costuma usar parte do seu CPF. A senha só é usada para abrir o arquivo aqui
                no aparelho e não é guardada.
              </Text>
            </Card>
            <TextField
              label="Senha do PDF"
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={() => senha !== '' && lerArquivo(pendente.uri, pendente.nome, senha)}
            />
            <Button
              titulo="Abrir"
              disabled={senha === ''}
              carregando={abrindo}
              onPress={() => lerArquivo(pendente.uri, pendente.nome, senha)}
            />
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

        {etapa === 'preview' && analise && destino && (
          <>
            <Voltar onPress={() => setEtapa('destino')} />
            <Card style={{ marginBottom: 12 }}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                {selecionadas.length} de {analise.resumo.total} serão importados
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                {[
                  analise.resumo.categorizadosSozinhos > 0 ? `${analise.resumo.categorizadosSozinhos} categorizados sozinhos` : null,
                  analise.resumo.jaImportadas + analise.resumo.duplicatas + analise.resumo.jaNoApp > 0
                    ? `${analise.resumo.jaImportadas + analise.resumo.duplicatas + analise.resumo.jaNoApp} já existiam`
                    : null,
                  analise.resumo.contasFixas > 0
                    ? `${analise.resumo.contasFixas} ${analise.resumo.contasFixas === 1 ? 'conta fixa reconhecida' : 'contas fixas reconhecidas'}`
                    : null,
                  analise.resumo.pagamentosDeFatura > 0
                    ? `${analise.resumo.pagamentosDeFatura} ${analise.resumo.pagamentosDeFatura === 1 ? 'pagamento de fatura' : 'pagamentos de fatura'}`
                    : null,
                  analise.resumo.transferencias > 0
                    ? `${analise.resumo.transferencias} ${analise.resumo.transferencias === 1 ? 'transferência entre contas suas' : 'transferências entre contas suas'}`
                    : null,
                  analise.resumo.pagamentosOuEstornos > 0
                    ? `${analise.resumo.pagamentosOuEstornos} ${analise.resumo.pagamentosOuEstornos === 1 ? 'pagamento ou estorno' : 'pagamentos ou estornos'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {pendentesAgora > 0 && (
                <Text className="font-body-medium" style={{ color: colors.warning, fontSize: 12, marginTop: 6 }}>
                  {pendentesAgora} {pendentesAgora === 1 ? 'precisa' : 'precisam'} de você: escolha a categoria (ou importe assim e
                  categorize depois).
                </Text>
              )}
              {fatura && (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  Tudo entra na fatura que vence em {formatarMesReferencia(fatura.mes)}.
                </Text>
              )}
            </Card>

            {analise.resumo.precisamDeVoce > 0 && (
              <ChipSelect<'todos' | 'pendentes'>
                label="Mostrar"
                opcoes={[
                  { valor: 'todos', rotulo: `Todos (${analise.resumo.total})` },
                  { valor: 'pendentes', rotulo: `Precisam de você (${analise.resumo.precisamDeVoce})` },
                ]}
                valor={soPendentes ? 'pendentes' : 'todos'}
                onSelecionar={(v) => setSoPendentes(v === 'pendentes')}
              />
            )}

            <View style={{ gap: 8, marginBottom: 20 }}>
              {analise.itens
                .filter((item) => !soPendentes || item.precisaDeVoce)
                .map((item) => (
                  <LinhaDaPrevia
                    key={item.transacao.idExterno}
                    item={item}
                    marcada={item.podeIncluir && marcadas.has(item.transacao.idExterno)}
                    aberta={aberta === item.transacao.idExterno}
                    categorias={categorias}
                    categoriaId={categoriaDoItem(item)}
                    sempre={escolhas.get(chaveDaEscolha(item))?.sempre ?? null}
                    natureza={naturezaDaLinha(item.transacao, destino)}
                    noCartao={tipoDestino === 'cartao'}
                    antiga={fatura ? dataNaFatura(item.transacao.data, fatura.mes, fatura.cartao).ajustada : false}
                    onAlternar={() => alternar(item.transacao.idExterno)}
                    onAbrir={() => setAberta((atual) => (atual === item.transacao.idExterno ? null : item.transacao.idExterno))}
                    onEscolher={(id) => escolherCategoria(item, id)}
                    onSempre={(valor) => alternarSempre(item, valor)}
                  />
                ))}
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
