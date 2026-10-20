import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { TextField } from '@/components/TextField';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { lerArquivoDeExtrato, TIPOS_DE_ARQUIVO_DE_EXTRATO } from '@/core/importacao/lerArquivoDeExtrato';
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
import {
  dividirPorMes,
  ordenarLote,
  planejarLote,
  prepararImportacaoAutomatica,
  type ArquivoDoLote,
  type BaseDaImportacao,
  type DestinoNoLote,
} from '@/domain/usecases/importacao/importacaoEmLote';
import { identificadorDoExtrato } from '@/domain/usecases/importacao/dadosDoArquivo';
import { juntarNomeProprio, lerNomesProprios } from '@/domain/usecases/importacao/nomesProprios';
import { NOMES_DOS_BANCOS } from '@/domain/usecases/importacao/bancos';
import type { BancoId, ExtratoLido } from '@/domain/usecases/importacao/tipos';
import type { DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';

type Item = {
  chave: string;
  nome: string;
  uri: string;
  estado: 'lendo' | 'lido' | 'senha' | 'erro';
  mensagem: string | null;
  extrato: ExtratoLido | null;
};

type Resultado = { nome: string; ok: boolean; importadas: number; transferencias: number; perguntas: number; erro: string | null };

const CORES_DOS_BANCOS: Record<BancoId, string> = {
  bb: '#E6B800',
  santander: '#EC0000',
  bradesco: '#CC092F',
  itau: '#EC7000',
  nubank: '#820AD1',
  c6: '#3A3A3A',
  picpay: '#21C25E',
  infinitepay: '#00A86B',
};

const esperarTela = () => new Promise<void>((resolver) => setTimeout(resolver, 0));

function descreverArquivo(extrato: ExtratoLido): string {
  const banco = extrato.banco ? NOMES_DOS_BANCOS[extrato.banco] : 'Banco não identificado';
  const quantos = `${extrato.transacoes.length} ${extrato.transacoes.length === 1 ? 'lançamento' : 'lançamentos'}`;
  if (extrato.origem === 'cartao') {
    return `${banco} · fatura${extrato.vencimentoFatura ? ` que vence ${formatarData(extrato.vencimentoFatura)}` : ''} · ${quantos}`;
  }
  const tipo = extrato.conta?.tipo === 'poupanca' ? 'poupança' : 'conta';
  const periodo = extrato.periodo ? ` · ${formatarData(extrato.periodo.inicio)} a ${formatarData(extrato.periodo.fim)}` : '';
  return `${banco} · ${tipo}${periodo} · ${quantos}`;
}

const chaveDoDestino = (d: DestinoNoLote): string =>
  d.tipo === 'conta' ? `conta:${d.contaBancariaId}` : d.tipo === 'cartao' ? `cartao:${d.cartaoId}` : d.tipo === 'pular' ? 'pular' : `${d.tipo}:${d.grupo}`;

function destinoDaChave(chave: string): DestinoNoLote {
  if (chave === 'pular') return { tipo: 'pular' };
  const [tipo, ...resto] = chave.split(':');
  const valor = resto.join(':');
  if (tipo === 'conta') return { tipo: 'conta', contaBancariaId: Number(valor) };
  if (tipo === 'cartao') return { tipo: 'cartao', cartaoId: Number(valor) };
  if (tipo === 'nova_conta') return { tipo: 'nova_conta', grupo: valor };
  return { tipo: 'novo_cartao', grupo: valor };
}

/**
 * Importação de vários extratos e faturas de uma vez (o ano todo): lê os arquivos, cria as
 * contas e os cartões que faltam e importa tudo na ordem certa, sem prévia — o que precisar de
 * você vai para a Revisão.
 */
export default function ImportarLoteScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ arquivos?: string }>();
  const { contas, carregar: carregarContas, criar: criarConta, atualizar: atualizarConta } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes, criar: criarCartao } = useCartoesStore();
  const { importar } = useImportacoesStore();
  const { atualizar: atualizarPreferencias } = usePreferenciasStore();

  const [itens, setItens] = useState<Item[]>([]);
  const [senha, setSenha] = useState('');
  const [escolhas, setEscolhas] = useState<Record<string, DestinoNoLote>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [fase, setFase] = useState<'escolher' | 'importando' | 'pronto'>('escolher');
  const [progresso, setProgresso] = useState<{ feitos: number; total: number; atual: string }>({ feitos: 0, total: 0, atual: '' });
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const recebidos = useRef(false);

  const recarregarTudo = useCallback(async () => {
    await Promise.all([
      useContasBancariasStore.getState().carregar(),
      useCartoesStore.getState().carregar(),
      useMovimentacoesStore.getState().carregar(),
      useGastosRapidosStore.getState().carregar(),
      useImportacoesStore.getState().carregar(),
      useCategoriasStore.getState().carregar(),
      useContasFixasStore.getState().carregar(),
      useParcelasStore.getState().carregar(),
      useComprasParceladasStore.getState().carregar(),
      useFaturasStore.getState().carregar(),
      useRegrasStore.getState().carregar(),
      usePreferenciasStore.getState().carregar(),
    ]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarContas();
      carregarCartoes();
      usePreferenciasStore.getState().carregar();
    }, [carregarContas, carregarCartoes])
  );

  const lerArquivos = useCallback(async (lista: { uri: string; nome: string }[], senhaDosPdfs: string) => {
    setItens((atuais) => {
      const novos = lista
        .filter((a) => !atuais.some((i) => i.chave === a.uri))
        .map((a): Item => ({ chave: a.uri, nome: a.nome, uri: a.uri, estado: 'lendo', mensagem: null, extrato: null }));
      return [...atuais.map((i) => (lista.some((a) => a.uri === i.chave) ? { ...i, estado: 'lendo' as const } : i)), ...novos];
    });
    for (const arquivo of lista) {
      await esperarTela();
      let atualizacao: Partial<Item>;
      try {
        const lido = await lerArquivoDeExtrato(arquivo.uri, arquivo.nome, senhaDosPdfs);
        if (lido.ok) atualizacao = { estado: 'lido', extrato: lido.extrato, mensagem: null };
        else if (lido.motivo === 'precisa_senha' || lido.motivo === 'senha_errada') atualizacao = { estado: 'senha', mensagem: lido.mensagem };
        else if (lido.motivo === 'precisa_mapear') {
          atualizacao = { estado: 'erro', mensagem: 'CSV num formato que o app não conhece: importe este sozinho para dizer qual coluna é qual.' };
        } else atualizacao = { estado: 'erro', mensagem: lido.mensagem };
      } catch {
        atualizacao = { estado: 'erro', mensagem: 'Não consegui abrir esse arquivo.' };
      }
      setItens((atuais) => atuais.map((i) => (i.chave === arquivo.uri ? { ...i, ...atualizacao } : i)));
    }
  }, []);

  // arquivos escolhidos na tela anterior
  useEffect(() => {
    if (recebidos.current || !params.arquivos) return;
    recebidos.current = true;
    try {
      const lista = JSON.parse(params.arquivos) as { uri: string; nome: string }[];
      // fora do corpo do efeito: a leitura atualiza a lista aos poucos
      if (Array.isArray(lista)) setTimeout(() => void lerArquivos(lista, ''), 0);
    } catch {
      // parâmetro inválido: o usuário escolhe de novo
    }
  }, [params.arquivos, lerArquivos]);

  async function escolherArquivos() {
    setErro(null);
    try {
      const resultado = await DocumentPicker.getDocumentAsync({ type: TIPOS_DE_ARQUIVO_DE_EXTRATO, copyToCacheDirectory: true, multiple: true });
      if (resultado.canceled || resultado.assets.length === 0) return;
      await lerArquivos(resultado.assets.map((a) => ({ uri: a.uri, nome: a.name })), senha);
    } catch {
      setErro('Não consegui abrir os arquivos.');
    }
  }

  const lidos = useMemo(
    () => itens.filter((i): i is Item & { extrato: ExtratoLido } => i.estado === 'lido' && i.extrato !== null).map((i) => ({ chave: i.chave, nome: i.nome, extrato: i.extrato })),
    [itens]
  );
  const plano = useMemo(() => planejarLote(lidos, contas, cartoes), [lidos, contas, cartoes]);
  // "tudo novo": para oferecer "criar conta/cartão" mesmo quando o app sugeriu um que já existe
  const tudoNovo = useMemo(() => planejarLote(lidos, [], []), [lidos]);
  const destinoDe = useCallback(
    (chave: string): DestinoNoLote => escolhas[chave] ?? plano.destinos[chave] ?? { tipo: 'pular' },
    [escolhas, plano]
  );
  const contasACriar = useMemo(
    () => tudoNovo.contasNovas.filter((n) => lidos.some((a) => { const d = destinoDe(a.chave); return d.tipo === 'nova_conta' && d.grupo === n.grupo; })),
    [tudoNovo, lidos, destinoDe]
  );
  const cartoesACriar = useMemo(
    () => tudoNovo.cartoesNovos.filter((n) => lidos.some((a) => { const d = destinoDe(a.chave); return d.tipo === 'novo_cartao' && d.grupo === n.grupo; })),
    [tudoNovo, lidos, destinoDe]
  );
  const paraImportar = lidos.filter((a) => destinoDe(a.chave).tipo !== 'pular');
  const precisamDeSenha = itens.filter((i) => i.estado === 'senha');

  function opcoesDoArquivo(arquivo: ArquivoDoLote): { valor: string; rotulo: string }[] {
    const novo = tudoNovo.destinos[arquivo.chave];
    if (arquivo.extrato.origem === 'cartao') {
      const grupo = novo?.tipo === 'novo_cartao' ? novo.grupo : null;
      const nome = tudoNovo.cartoesNovos.find((c) => c.grupo === grupo)?.nome ?? 'cartão';
      return [
        ...cartoes.filter((c) => c.ativo !== false).map((c) => ({ valor: `cartao:${c.id}`, rotulo: c.nome })),
        ...(grupo ? [{ valor: `novo_cartao:${grupo}`, rotulo: `Criar ${nome}` }] : []),
        { valor: 'pular', rotulo: 'Não importar' },
      ];
    }
    const grupo = novo?.tipo === 'nova_conta' ? novo.grupo : null;
    const nome = tudoNovo.contasNovas.find((c) => c.grupo === grupo)?.nomeConta ?? 'conta';
    return [
      ...contas.filter((c) => c.ativo !== false).map((c) => ({ valor: `conta:${c.id}`, rotulo: c.nomeConta })),
      ...(grupo ? [{ valor: `nova_conta:${grupo}`, rotulo: `Criar ${nome}` }] : []),
      { valor: 'pular', rotulo: 'Não importar' },
    ];
  }

  function rotuloDoDestino(d: DestinoNoLote): string {
    if (d.tipo === 'pular') return 'Não importar';
    if (d.tipo === 'conta') return contas.find((c) => c.id === d.contaBancariaId)?.nomeConta ?? 'Conta';
    if (d.tipo === 'cartao') return cartoes.find((c) => c.id === d.cartaoId)?.nome ?? 'Cartão';
    if (d.tipo === 'nova_conta') return `Nova: ${tudoNovo.contasNovas.find((c) => c.grupo === d.grupo)?.nomeConta ?? 'conta'}`;
    return `Novo: ${tudoNovo.cartoesNovos.find((c) => c.grupo === d.grupo)?.nome ?? 'cartão'}`;
  }

  async function importarTudo() {
    if (paraImportar.length === 0) return;
    setErro(null);
    setFase('importando');
    const finais: Resultado[] = [];
    try {
      // 1. contas e cartões novos
      const idDaContaNova = new Map<string, number>();
      for (const nova of contasACriar) {
        const banco = lidos.find((a) => { const d = destinoDe(a.chave); return d.tipo === 'nova_conta' && d.grupo === nova.grupo; })?.extrato.banco ?? null;
        const criada = await criarConta({
          banco: nova.banco,
          nomeConta: nova.nomeConta,
          saldoInicial: nova.saldoInicial,
          cor: banco ? CORES_DOS_BANCOS[banco] : colors.brand,
          icone: 'dollar-sign',
          identificadorExtrato: nova.identificadorExtrato,
        });
        idDaContaNova.set(nova.grupo, criada.id);
      }
      const idDoCartaoNovo = new Map<string, number>();
      for (const novo of cartoesACriar) {
        const criado = await criarCartao({
          nome: novo.nome,
          limite: novo.limite,
          diaFechamento: novo.diaFechamento,
          diaVencimento: novo.diaVencimento,
          cor: colors.brand,
        });
        idDoCartaoNovo.set(novo.grupo, criado.id);
      }

      // 2. o seu nome nos extratos (PIX para você mesmo é transferência)
      const preferencias = usePreferenciasStore.getState().preferencias;
      const salvos = lerNomesProprios(preferencias?.nomesProprios ?? null);
      const nomes = lidos.reduce((lista, a) => juntarNomeProprio(lista, a.extrato.titular ?? null), salvos);
      if (nomes.length !== salvos.length) await atualizarPreferencias({ nomesProprios: JSON.stringify(nomes) });

      // 3. cada arquivo (extrato de vários meses vira um pedaço por mês), na ordem certa
      const resolver = (d: DestinoNoLote): DestinoImportacao | null => {
        if (d.tipo === 'conta') return { tipo: 'conta', contaBancariaId: d.contaBancariaId };
        if (d.tipo === 'cartao') return { tipo: 'cartao', cartaoId: d.cartaoId };
        if (d.tipo === 'nova_conta') {
          const id = idDaContaNova.get(d.grupo);
          return id !== undefined ? { tipo: 'conta', contaBancariaId: id } : null;
        }
        if (d.tipo === 'novo_cartao') {
          const id = idDoCartaoNovo.get(d.grupo);
          return id !== undefined ? { tipo: 'cartao', cartaoId: id } : null;
        }
        return null;
      };
      const pedacos = ordenarLote(paraImportar.flatMap(dividirPorMes));
      // pedaço de um extrato dividido por mês: "uri#2026-10" (a uri pode ter "#" no nome)
      const destinoDoPedaco = (chave: string) => destinoDe(chave.replace(/#\d{4}-\d{2}$/, ''));
      setProgresso({ feitos: 0, total: pedacos.length, atual: '' });
      for (const [indice, pedaco] of pedacos.entries()) {
        setProgresso({ feitos: indice, total: pedacos.length, atual: pedaco.nome });
        await esperarTela();
        const destino = resolver(destinoDoPedaco(pedaco.chave));
        if (!destino) continue;
        try {
          await recarregarTudo();
          const base: BaseDaImportacao = {
            categorias: useCategoriasStore.getState().categorias,
            regras: useRegrasStore.getState().regras,
            contatos: useRegrasStore.getState().contatos,
            contas: useContasBancariasStore.getState().contas,
            cartoes: useCartoesStore.getState().cartoes,
            contasFixas: useContasFixasStore.getState().contas,
            parcelas: useParcelasStore.getState().parcelas,
            compras: useComprasParceladasStore.getState().compras,
            gastos: useGastosRapidosStore.getState().gastos,
            faturas: useFaturasStore.getState().faturas,
            movimentacoes: useMovimentacoesStore.getState().movimentacoes,
            importacoes: useImportacoesStore.getState().importacoes,
            nomesProprios: nomes,
          };
          // a conta que já existia passa a ser reconhecida pelo número nos próximos arquivos
          const identificador = identificadorDoExtrato(pedaco.extrato);
          const conta = destino.tipo === 'conta' ? base.contas.find((c) => c.id === destino.contaBancariaId) : undefined;
          if (identificador && conta && !conta.identificadorExtrato) {
            await atualizarConta(conta.id, { identificadorExtrato: identificador });
          }
          const { registro, resumo } = prepararImportacaoAutomatica({ arquivo: pedaco.nome, extrato: pedaco.extrato, destino, base, agora: new Date() });
          await importar(registro);
          finais.push({
            nome: pedaco.nome,
            ok: true,
            importadas: registro.importacao.importadas,
            transferencias: resumo.transferencias,
            perguntas: registro.perguntas.length,
            erro: null,
          });
        } catch {
          finais.push({ nome: pedaco.nome, ok: false, importadas: 0, transferencias: 0, perguntas: 0, erro: 'Não consegui importar (nada deste arquivo foi gravado).' });
        }
      }
      await recarregarTudo();
    } catch {
      setErro('A importação parou no meio. O que já foi importado ficou salvo; os outros arquivos podem ser importados de novo.');
    }
    setResultados(finais);
    setFase('pronto');
  }

  const anoDoRelatorio = useMemo(() => {
    const anos = lidos.map((a) => (a.extrato.periodo?.fim ?? a.extrato.vencimentoFatura ?? '').slice(0, 4)).filter((a) => a !== '');
    anos.sort();
    return anos.length > 0 ? anos[anos.length - 1] : String(new Date().getFullYear());
  }, [lidos]);

  if (fase === 'importando') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <View style={{ padding: 20 }}>
          <ScreenHeader title="Importando" subtitle={`${progresso.feitos} de ${progresso.total}`} />
          <Card>
            <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }} numberOfLines={2}>
              {progresso.atual || 'Preparando…'}
            </Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, marginTop: 12, overflow: 'hidden' }}>
              <View
                style={{
                  height: 8,
                  width: `${progresso.total > 0 ? Math.round((progresso.feitos / progresso.total) * 100) : 0}%`,
                  backgroundColor: colors.brand,
                }}
              />
            </View>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>
              Não feche o app até terminar.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (fase === 'pronto') {
    const somar = (f: (r: Resultado) => number) => resultados.reduce((s, r) => s + f(r), 0);
    const falhas = resultados.filter((r) => !r.ok);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          <ScreenHeader title="Tudo importado" subtitle={`${resultados.length - falhas.length} de ${resultados.length} arquivos`} />
          {erro && (
            <Text className="font-body" style={{ color: colors.danger, fontSize: 13 }}>
              {erro}
            </Text>
          )}
          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16 }}>
              {somar((r) => r.importadas)} lançamentos importados
            </Text>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
              {somar((r) => r.transferencias)} movimentações entre contas suas reconhecidas · {somar((r) => r.perguntas)} dúvidas na Revisão
            </Text>
          </Card>
          {resultados.map((r, i) => (
            <View key={`${r.nome}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name={r.ok ? 'check-circle' : 'alert-circle'} size={16} color={r.ok ? colors.success : colors.danger} />
              <Text className="font-body" style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                {r.nome}
              </Text>
              <Text className="font-body" style={{ color: r.ok ? colors.textMuted : colors.danger, fontSize: 12 }}>
                {r.ok ? `${r.importadas}` : 'falhou'}
              </Text>
            </View>
          ))}
          <Button titulo={`Ver o relatório de ${anoDoRelatorio}`} onPress={() => router.replace({ pathname: '/relatorios/anual', params: { ano: anoDoRelatorio } })} />
          {somar((r) => r.perguntas) > 0 && <Button titulo="Responder as dúvidas" variante="secundaria" onPress={() => router.replace('/revisao')} />}
          <Button titulo="Ver as importações" variante="secundaria" onPress={() => router.replace('/importar-extrato/historico')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ScreenHeader title="Importar vários" subtitle="Extratos e faturas do ano todo, de uma vez" />
        {erro && (
          <Text className="font-body" style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>
            {erro}
          </Text>
        )}

        {itens.length === 0 && (
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
            Escolha todos os arquivos de uma vez (CSV, OFX ou PDF; conta corrente, poupança e faturas). O app reconhece o
            banco e a conta de cada um, cria as contas e os cartões que faltam e importa tudo na ordem certa.
          </Text>
        )}
        <Button titulo={itens.length === 0 ? 'Escolher arquivos' : 'Adicionar mais arquivos'} variante={itens.length === 0 ? 'primaria' : 'secundaria'} onPress={escolherArquivos} />

        {precisamDeSenha.length > 0 && (
          <Card style={{ marginTop: 16, borderColor: colors.warning }}>
            <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, marginBottom: 8 }}>
              {precisamDeSenha.length === 1 ? '1 PDF tem senha' : `${precisamDeSenha.length} PDFs têm senha`}
            </Text>
            <TextField
              label="Senha dos PDFs"
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Ex.: os primeiros dígitos do CPF"
            />
            <Button
              titulo="Abrir com essa senha"
              disabled={senha === ''}
              onPress={() => lerArquivos(precisamDeSenha.map((i) => ({ uri: i.uri, nome: i.nome })), senha)}
            />
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
              A senha só é usada para abrir os arquivos aqui no aparelho e não é guardada.
            </Text>
          </Card>
        )}

        {(contasACriar.length > 0 || cartoesACriar.length > 0) && (
          <Card style={{ marginTop: 16 }}>
            <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, marginBottom: 6 }}>
              Vai criar
            </Text>
            {contasACriar.map((c) => (
              <Text key={c.grupo} className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                • {c.nomeConta} — começa com {formatarMoeda(c.saldoInicial)}
                {c.saldoInicial !== 0 ? ' (saldo anterior do extrato mais antigo)' : ''}
              </Text>
            ))}
            {cartoesACriar.map((c) => (
              <Text key={c.grupo} className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                • Cartão {c.nome} — fecha dia {c.diaFechamento}, vence dia {c.diaVencimento}
                {c.limite > 0 ? `, limite ${formatarMoeda(c.limite)}` : ' (limite: ajuste depois no cartão)'}
              </Text>
            ))}
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
              Dá para mudar nome, saldo inicial e limite depois, na tela da conta ou do cartão.
            </Text>
          </Card>
        )}

        <View style={{ marginTop: 16, gap: 8 }}>
          {itens.map((item) => {
            const arquivo = lidos.find((a) => a.chave === item.chave);
            const destino = arquivo ? destinoDe(arquivo.chave) : null;
            return (
              <Card key={item.chave} style={{ opacity: destino?.tipo === 'pular' ? 0.55 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather
                    name={item.estado === 'lido' ? 'file-text' : item.estado === 'senha' ? 'lock' : item.estado === 'erro' ? 'alert-circle' : 'loader'}
                    size={16}
                    color={item.estado === 'erro' ? colors.danger : item.estado === 'senha' ? colors.warning : colors.brand}
                  />
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {item.nome}
                  </Text>
                </View>
                <Text className="font-body" style={{ color: item.estado === 'erro' ? colors.danger : colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  {item.estado === 'lendo' ? 'Lendo…' : arquivo ? descreverArquivo(arquivo.extrato) : (item.mensagem ?? '')}
                </Text>
                {arquivo && destino && (
                  <>
                    <Pressable
                      onPress={() => setAberto(aberto === item.chave ? null : item.chave)}
                      accessibilityRole="button"
                      accessibilityLabel={`Destino: ${rotuloDoDestino(destino)}. Trocar`}
                      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, minHeight: 32 }}
                    >
                      <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
                        → {rotuloDoDestino(destino)}
                      </Text>
                      <Feather name={aberto === item.chave ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
                    </Pressable>
                    {aberto === item.chave && (
                      <View style={{ marginTop: 8 }}>
                        <ChipSelect
                          label={arquivo.extrato.origem === 'cartao' ? 'Importar para o cartão' : 'Importar para a conta'}
                          opcoes={opcoesDoArquivo(arquivo)}
                          valor={chaveDoDestino(destino)}
                          onSelecionar={(valor) => setEscolhas((atual) => ({ ...atual, [arquivo.chave]: destinoDaChave(valor) }))}
                        />
                      </View>
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </View>

        {paraImportar.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
              Entra tudo sem prévia: o que o app não souber categorizar vai para a Revisão. Cada arquivo pode ser
              desfeito depois em Importações anteriores.
            </Text>
            <Button
              titulo={`Importar ${paraImportar.length} ${paraImportar.length === 1 ? 'arquivo' : 'arquivos'}`}
              disabled={itens.some((i) => i.estado === 'lendo')}
              onPress={importarTudo}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
