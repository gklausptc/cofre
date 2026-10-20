import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { EmptyState } from '@/components/EmptyState';
import { RespostaDaPergunta } from '@/components/importacao/RespostaDaPergunta';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { dadosDaPergunta, usePerguntasStore } from '@/store/perguntasStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { useImportacoesStore } from '@/store/importacoesStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';
import { CORES_DE_CATEGORIA, NAO_IDENTIFICADO } from '@/domain/dados/categoriasPadrao';
import type { RespostaPergunta } from '@/domain/usecases/importacao/responderPergunta';
import type { DadosDaPergunta } from '@/domain/types/perguntas';
import type { PerguntaPendente } from '@/domain/types/entities';

type Filtro = 'todas' | 'conta' | 'cartao';
type LinhaMostrada = { chave: string; data: string; valor: number; descricao: string; origem: string };

function exemploDa(dados: DadosDaPergunta): string | null {
  if (dados.tipo === 'categoria' || dados.tipo === 'pix_pessoa') return dados.exemplo;
  if (dados.tipo === 'duplicidade') return dados.linha.descricao;
  if (dados.tipo === 'parcelamento') return dados.descricao;
  return null;
}

/** Onde as linhas da pergunta estão: só na conta (PIX, débito), só no cartão, ou nos dois. */
function origemDa(dados: DadosDaPergunta): 'conta' | 'cartao' | 'ambos' {
  const noCartao = dados.linhas.filter((l) => l.onde === 'gasto').length;
  if (noCartao === 0) return 'conta';
  return noCartao === dados.linhas.length ? 'cartao' : 'ambos';
}

/** Que tipo de lançamento de conta é, pelo texto do banco. */
function jeitoDaConta(descricao: string): string {
  const texto = semAcentos(descricao);
  if (/COMPRA (COM |NO )?(CARTAO|DEBITO)|\bDEBITO\b/.test(texto)) return 'compra no débito';
  if (/\bPIX\b/.test(texto)) return 'PIX';
  if (/TRANSF|\bTED\b|\bDOC\b/.test(texto)) return 'transferência';
  if (/BOLETO|PAGAMENTO|PAGTO/.test(texto)) return 'pagamento';
  if (/SAQUE/.test(texto)) return 'saque';
  return 'na conta';
}

/** A IA pergunta: um card por dúvida da importação, com cada lançamento (data, valor, de onde veio). */
export default function RevisaoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { perguntas, carregar, responder, reavaliar } = usePerguntasStore();
  const { categorias, carregar: carregarCategorias, criar: criarCategoria } = useCategoriasStore();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { importacoes, carregar: carregarImportacoes } = useImportacoesStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();

  // puladas nesta visita vão para o fim da fila; respondidas contam no progresso
  const [puladas, setPuladas] = useState<number[]>([]);
  const [respondidas, setRespondidas] = useState(0);
  const [resposta, setResposta] = useState<RespostaPergunta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [aviso, setAviso] = useState<string | null>(null);
  const [revendo, setRevendo] = useState(false);
  const revisando = useRef(false);

  const reavaliarAgora = useCallback(
    async (depoisDeResponder: boolean) => {
      if (revisando.current) return;
      revisando.current = true;
      setRevendo(true);
      try {
        const { resolvidas, juntadas } = await reavaliar();
        if (resolvidas > 0) {
          setRespondidas((n) => n + resolvidas);
          setAviso(
            depoisDeResponder
              ? `Mais ${resolvidas} ${resolvidas === 1 ? 'parecida resolvida' : 'parecidas resolvidas'} com o que você ensinou.`
              : `${resolvidas} ${resolvidas === 1 ? 'pergunta resolvida sozinha' : 'perguntas resolvidas sozinhas'} com o que o app já sabe.`
          );
          await Promise.all([carregarMovimentacoes(), carregarGastos()]);
        } else if (juntadas > 0 && !depoisDeResponder) {
          setAviso(`${juntadas} ${juntadas === 1 ? 'pergunta repetida juntada' : 'perguntas repetidas juntadas'} (mesma loja, outro número).`);
        }
      } finally {
        revisando.current = false;
        setRevendo(false);
      }
    },
    [reavaliar, carregarMovimentacoes, carregarGastos]
  );

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarCategorias();
      carregarContas();
      carregarCartoes();
      carregarMembros();
      carregarImportacoes();
      carregarMovimentacoes();
      carregarGastos();
      void reavaliarAgora(false);
    }, [
      carregar,
      carregarCategorias,
      carregarContas,
      carregarCartoes,
      carregarMembros,
      carregarImportacoes,
      carregarMovimentacoes,
      carregarGastos,
      reavaliarAgora,
    ])
  );

  const comOrigem = useMemo(() => perguntas.map((p) => ({ pergunta: p, origem: origemDa(dadosDaPergunta(p)) })), [perguntas]);
  const contagem = useMemo(
    () => ({
      todas: comOrigem.length,
      conta: comOrigem.filter((p) => p.origem !== 'cartao').length,
      cartao: comOrigem.filter((p) => p.origem !== 'conta').length,
    }),
    [comOrigem]
  );

  const fila = useMemo(() => {
    const visiveis = comOrigem
      .filter(({ origem }) => filtro === 'todas' || (filtro === 'conta' ? origem !== 'cartao' : origem !== 'conta'))
      .map(({ pergunta }) => pergunta);
    const naoPuladas = visiveis.filter((p) => !puladas.includes(p.id));
    const depois = puladas.map((id) => visiveis.find((p) => p.id === id)).filter((p): p is PerguntaPendente => p !== undefined);
    return [...naoPuladas, ...depois];
  }, [comOrigem, filtro, puladas]);

  const atual = fila[0] ?? null;
  const dados = atual ? dadosDaPergunta(atual) : null;
  const total = respondidas + fila.length;
  const contaDasLinhas = atual?.importacaoId != null ? (importacoes.find((i) => i.id === atual.importacaoId)?.contaBancariaId ?? null) : null;
  const aoResponder = useCallback((r: RespostaPergunta | null) => setResposta(r), []);

  // os lançamentos de verdade por trás da pergunta, com data, valor e de onde vieram
  const linhas = useMemo((): LinhaMostrada[] => {
    if (!dados) return [];
    const resultado: LinhaMostrada[] = [];
    for (const l of dados.linhas) {
      if (l.onde === 'movimentacao') {
        const m = movimentacoes.find((x) => x.importacaoId === l.importacaoId && x.idExterno === l.idExterno);
        if (!m) continue;
        const conta = contas.find((c) => c.id === m.contaBancariaId)?.nomeConta ?? 'Conta';
        resultado.push({
          chave: `m${m.id}`,
          data: m.data,
          valor: m.tipo === 'entrada' ? m.valor : -m.valor,
          descricao: m.descricao ?? '',
          origem: `${jeitoDaConta(m.descricao ?? '')} · ${conta}`,
        });
      } else {
        const g = gastos.find((x) => x.importacaoId === l.importacaoId && x.idExterno === l.idExterno);
        if (!g) continue;
        const cartao = cartoes.find((c) => c.id === g.cartaoId)?.nome;
        const origem = g.formaPagamento === 'cartao' ? `cartão de crédito${cartao ? ` · ${cartao}` : ''}` : g.formaPagamento;
        resultado.push({ chave: `g${g.id}`, data: g.data, valor: -g.valor, descricao: g.descricao ?? '', origem });
      }
    }
    return resultado.sort((a, b) => b.data.localeCompare(a.data));
  }, [dados, movimentacoes, gastos, contas, cartoes]);

  const pistaExtra = useMemo(() => {
    if (!dados || dados.tipo !== 'categoria' || dados.natureza !== 'receita') return null;
    const texto = semAcentos(dados.exemplo);
    if (/COMPRA|ESTORNO|DEVOL|CANCEL/.test(texto)) return 'Parece dinheiro de volta de uma compra (estorno): use "Reembolsos e estornos".';
    if (/TRANSF|PIX/.test(texto)) return 'Se veio de outra conta sua, escolha "Transferência minha".';
    return null;
  }, [dados]);

  function pular() {
    if (!atual) return;
    setResposta(null);
    setPuladas((lista) => [...lista.filter((id) => id !== atual.id), atual.id]);
  }

  async function salvar(pergunta: PerguntaPendente, r: RespostaPergunta) {
    setSalvando(true);
    setErro(null);
    try {
      await responder(pergunta, r);
      setRespondidas((n) => n + 1);
      setPuladas((lista) => lista.filter((id) => id !== pergunta.id));
      setResposta(null);
      setAviso(null);
      // "sempre fazer assim" criou regra ou contato: resolve as parecidas que estão na fila
      if ('sempre' in r && r.sempre) await reavaliarAgora(true);
    } catch {
      setErro('Não consegui salvar a resposta. Nada foi alterado; tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  async function naoSei() {
    if (!atual || !dados || (dados.tipo !== 'categoria' && dados.tipo !== 'pix_pessoa')) return;
    const natureza = dados.natureza;
    let categoria = categorias.find((c) => c.tipo === natureza && c.nome === NAO_IDENTIFICADO);
    if (!categoria) {
      categoria = await criarCategoria({ nome: NAO_IDENTIFICADO, tipo: natureza, icone: 'help-circle', cor: CORES_DE_CATEGORIA[8], isPadrao: true });
    }
    await salvar(atual, { tipo: 'categoria', categoriaId: categoria.id, sempre: false });
  }

  const somaDasLinhas = linhas.reduce((s, l) => s + Math.abs(l.valor), 0);
  const podeNaoSei = dados?.tipo === 'categoria' || dados?.tipo === 'pix_pessoa';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Revisão" subtitle="O que a importação não soube resolver sozinha" />

        {aviso && (
          <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
            <Card style={{ borderColor: colors.success }}>
              <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
                {aviso}
              </Text>
            </Card>
          </View>
        )}

        {contagem.conta > 0 && contagem.cartao > 0 && (
          <View style={{ paddingHorizontal: 20 }}>
            <ChipSelect<Filtro>
              label="Mostrar"
              opcoes={[
                { valor: 'todas', rotulo: `Todas (${contagem.todas})` },
                { valor: 'conta', rotulo: `Conta: PIX e débito (${contagem.conta})` },
                { valor: 'cartao', rotulo: `Cartão de crédito (${contagem.cartao})` },
              ]}
              valor={filtro}
              onSelecionar={(f) => {
                setFiltro(f);
                setResposta(null);
              }}
            />
          </View>
        )}

        {!atual || !dados ? (
          <View style={{ gap: 12 }}>
            <EmptyState
              icon="check-circle"
              titulo={revendo ? 'Conferindo as perguntas…' : respondidas > 0 ? 'Tudo respondido' : 'Nada para revisar'}
              descricao={
                revendo
                  ? 'O app está vendo o que já consegue responder sozinho.'
                  : respondidas > 0
                    ? `${respondidas} ${respondidas === 1 ? 'resposta salva' : 'respostas salvas'}. As próximas importações já usam o que você ensinou.`
                    : filtro !== 'todas'
                      ? 'Nada neste filtro.'
                      : 'Quando uma importação tiver dúvidas, elas aparecem aqui.'
              }
            />
            <View style={{ paddingHorizontal: 20 }}>
              <Button titulo="Voltar ao início" onPress={() => router.replace('/dashboard')} />
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: total, now: respondidas }}
              style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, marginBottom: 6, overflow: 'hidden' }}
            >
              <View style={{ width: `${total === 0 ? 0 : (respondidas / total) * 100}%`, height: 6, backgroundColor: colors.brand }} />
            </View>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
              {fila.length} {fila.length === 1 ? 'pergunta' : 'perguntas'} na fila
            </Text>

            <Card key={atual.id}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 17 }}>
                {atual.titulo}
              </Text>
              {exemploDa(dados) && (
                <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, marginTop: 8 }}>
                  {exemploDa(dados)}
                </Text>
              )}
              {linhas.length > 0 && (
                <View style={{ marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                  {linhas.slice(0, 6).map((l, i) => (
                    <View
                      key={l.chave}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 12 }}>
                          {formatarData(l.data)} · {l.origem}
                        </Text>
                        {l.descricao !== exemploDa(dados) && (
                          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                            {l.descricao}
                          </Text>
                        )}
                      </View>
                      <Text
                        className="font-heading-medium"
                        style={{ color: l.valor < 0 ? colors.danger : colors.success, fontSize: 13, fontVariant: ['tabular-nums'] }}
                      >
                        {formatarMoeda(l.valor)}
                      </Text>
                    </View>
                  ))}
                  {linhas.length > 1 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        backgroundColor: colors.surface,
                      }}
                    >
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
                        {linhas.length > 6 ? `+${linhas.length - 6} · ` : ''}
                        {linhas.length} lançamentos no total
                      </Text>
                      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                        {formatarMoeda(somaDasLinhas)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              <Text className="font-body" style={{ color: colors.warning, fontSize: 12, marginTop: 8, marginBottom: pistaExtra ? 2 : 16 }}>
                {atual.pista}
              </Text>
              {pistaExtra && (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
                  {pistaExtra}
                </Text>
              )}
              <RespostaDaPergunta
                key={atual.id}
                dados={dados}
                categorias={categorias}
                contas={contas}
                membros={membros}
                contaDasLinhas={contaDasLinhas}
                onResposta={aoResponder}
              />
              {erro && (
                <Text className="font-body" style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>
                  {erro}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button titulo="Pular" variante="secundaria" onPress={pular} disabled={salvando} />
                </View>
                {podeNaoSei && (
                  <View style={{ flex: 1 }}>
                    <Button titulo="Não sei" variante="secundaria" onPress={naoSei} disabled={salvando} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Button titulo="Confirmar" onPress={() => resposta && salvar(atual, resposta)} disabled={!resposta} carregando={salvando} />
                </View>
              </View>
              {podeNaoSei && (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
                  Não sei: vai para Não identificado, sai da fila e dá para mudar depois no Extrato.
                </Text>
              )}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
