import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { DateField } from '@/components/DateField';
import { CategoryPicker } from '@/components/CategoryPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { SwitchRow } from '@/components/SwitchRow';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';

type TipoMovimentacao = 'entrada' | 'saida' | 'transferencia';

const OPCOES_TIPO: { valor: TipoMovimentacao; rotulo: string }[] = [
  { valor: 'entrada', rotulo: 'Entrada' },
  { valor: 'saida', rotulo: 'Saída' },
  { valor: 'transferencia', rotulo: 'Transferência' },
];

function AccountChips({
  contas,
  selecionada,
  aoSelecionar,
  excluir,
}: {
  contas: { id: number; nomeConta: string; cor: string }[];
  selecionada: number | null;
  aoSelecionar: (id: number) => void;
  excluir?: number | null;
}) {
  const { colors } = useAppTheme();
  const lista = contas.filter((c) => c.id !== excluir);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {lista.map((conta) => {
        const ativa = conta.id === selecionada;
        return (
          <Pressable
            key={conta.id}
            onPress={() => aoSelecionar(conta.id)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: ativa ? conta.cor : colors.surface,
              borderWidth: 1,
              borderColor: ativa ? conta.cor : colors.border,
            }}
          >
            <Text className="font-body-medium" style={{ color: ativa ? '#FFFFFF' : colors.text, fontSize: 13 }}>
              {conta.nomeConta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function EditarMovimentacaoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const movimentacaoId = Number(id);

  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { movimentacoes, carregar: carregarMovimentacoes, atualizar, remover } = useMovimentacoesStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();

  const movimentacao = movimentacoes.find((m) => m.id === movimentacaoId);

  const [tipo, setTipo] = useState<TipoMovimentacao>('saida');
  const [contaId, setContaId] = useState<number | null>(null);
  const [contaDestinoId, setContaDestinoId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [valor, setValor] = useState(0);
  const [data, setData] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [membroId, setMembroId] = useState<number | null>(null);
  const [reservarProximoMes, setReservarProximoMes] = useState(false);
  const [recorrente, setRecorrente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregadoParaId, setCarregadoParaId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregarContas();
      carregarCategorias();
      carregarMembros();
      carregarMovimentacoes();
    }, [carregarContas, carregarCategorias, carregarMembros, carregarMovimentacoes])
  );

  // Inicializa os campos do formulário a partir do registro carregado (assíncrono) —
  // atualização de estado durante a renderização, conforme o padrão recomendado pelo
  // React para sincronizar estado local com uma prop/dado externo que ainda não chegou.
  if (movimentacao && carregadoParaId !== movimentacaoId) {
    setCarregadoParaId(movimentacaoId);
    setTipo(movimentacao.tipo as TipoMovimentacao);
    setContaId(movimentacao.contaBancariaId);
    setContaDestinoId(movimentacao.contaDestinoId);
    setCategoriaId(movimentacao.categoriaId);
    setValor(movimentacao.valor);
    setData(movimentacao.data);
    setDescricao(movimentacao.descricao ?? '');
    setMembroId(movimentacao.membroId);
    setReservarProximoMes(Boolean(movimentacao.reservarProximoMes));
    setRecorrente(Boolean(movimentacao.recorrente));
  }

  if (!movimentacao) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Movimentação não encontrada.</Text>
      </SafeAreaView>
    );
  }

  const ehModelo = movimentacao.recorrenteOrigemId === null;

  const valido =
    contaId !== null &&
    valor > 0 &&
    data !== null &&
    (tipo !== 'transferencia' || (contaDestinoId !== null && contaDestinoId !== contaId));

  const dataOriginal = movimentacao.data;

  async function handleSalvar() {
    if (!valido || contaId === null) return;
    setSalvando(true);
    try {
      await atualizar(movimentacaoId, {
        contaBancariaId: contaId,
        tipo,
        valor,
        data: data ?? dataOriginal,
        descricao: descricao.trim() || null,
        categoriaId: tipo === 'transferencia' ? null : categoriaId,
        contaDestinoId: tipo === 'transferencia' ? contaDestinoId : null,
        membroId,
        reservarProximoMes: tipo === 'entrada' ? reservarProximoMes : false,
        recorrente: tipo === 'entrada' && ehModelo ? recorrente : false,
      });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  function handleRemover() {
    Alert.alert('Remover movimentação', 'Essa ação não pode ser desfeita. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await remover(movimentacaoId);
          router.back();
        },
      },
    ]);
  }

  // saída criada ao pagar uma fatura ou conta fixa (ver ehPagamentoDeCompromisso)
  const avisoPagamento =
    movimentacao.origem === 'fatura'
      ? 'Esta saída foi lançada ao pagar a fatura do cartão. Alterar ou remover aqui muda só o saldo da conta: a fatura continua paga.'
      : movimentacao.origem === 'conta_fixa'
        ? 'Esta saída foi lançada ao marcar a conta fixa como paga. Alterar ou remover aqui muda só o saldo da conta: a conta fixa continua paga.'
        : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {avisoPagamento && (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
              {avisoPagamento}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {OPCOES_TIPO.map((opcao) => {
            const ativo = opcao.valor === tipo;
            return (
              <Pressable
                key={opcao.valor}
                onPress={() => setTipo(opcao.valor)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: ativo ? colors.brand : colors.surface,
                  borderWidth: 1,
                  borderColor: ativo ? colors.brand : colors.border,
                }}
              >
                <Text
                  className="font-body-medium"
                  style={{ color: ativo ? '#FFFFFF' : colors.text, fontSize: 12 }}
                >
                  {opcao.rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <CurrencyInput label="Valor" valor={valor} onChangeValor={setValor} />
        <DateField label="Data" valor={data} onChange={setData} />

        <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
          {tipo === 'transferencia' ? 'Conta de origem' : 'Conta'}
        </Text>
        <AccountChips contas={contas} selecionada={contaId} aoSelecionar={setContaId} />

        {tipo === 'transferencia' ? (
          <>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Conta de destino
            </Text>
            <AccountChips
              contas={contas}
              selecionada={contaDestinoId}
              aoSelecionar={setContaDestinoId}
              excluir={contaId}
            />
          </>
        ) : (
          <CategoryPicker
            categorias={categorias}
            tipo={tipo === 'entrada' ? 'receita' : 'despesa'}
            categoriaId={categoriaId}
            onSelecionar={setCategoriaId}
          />
        )}

        <TextField
          label="Descrição (opcional)"
          placeholder="Ex.: Supermercado"
          value={descricao}
          onChangeText={setDescricao}
        />

        <MemberPicker membros={membros} membroId={membroId} onSelecionar={setMembroId} />

        {tipo === 'entrada' && (
          <>
            {ehModelo ? (
              <SwitchRow
                titulo="Repetir todo mês"
                descricao="Lança automaticamente o mesmo valor todo mês (ex.: salário) — não precisa recadastrar."
                valor={recorrente}
                onAlterar={setRecorrente}
              />
            ) : (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: -8, marginBottom: 16 }}>
                Gerada automaticamente por uma entrada recorrente — edite o lançamento original pra mudar a
                repetição.
              </Text>
            )}
            <SwitchRow
              titulo="Reservar para o mês que vem"
              descricao="Não entra no resumo deste mês — soma no resumo do mês seguinte."
              valor={reservarProximoMes}
              onAlterar={setReservarProximoMes}
            />
          </>
        )}

        <View style={{ gap: 12, marginTop: 8 }}>
          <Button titulo="Salvar alterações" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
          <Button titulo="Remover movimentação" variante="perigo" onPress={handleRemover} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
