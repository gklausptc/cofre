import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { DateField } from '@/components/DateField';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ChipSelect } from '@/components/ChipSelect';
import { MemberPicker } from '@/components/MemberPicker';
import { SwitchRow } from '@/components/SwitchRow';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { hojeIso } from '@/core/utils/date';

type TipoMovimentacao = 'entrada' | 'saida' | 'transferencia';

const OPCOES_PAGO_COM: { valor: 'conta' | 'cartao'; rotulo: string }[] = [
  { valor: 'conta', rotulo: 'Conta' },
  { valor: 'cartao', rotulo: 'Cartão de crédito' },
];

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

export default function NovaMovimentacaoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { criar } = useMovimentacoesStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const criarGasto = useGastosRapidosStore((s) => s.criar);
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();

  // a folha do (+) já abre com o tipo escolhido (?tipo=entrada|saida|transferencia)
  const { tipo: tipoInicial } = useLocalSearchParams<{ tipo?: string }>();
  const [tipo, setTipo] = useState<TipoMovimentacao>(
    tipoInicial === 'entrada' || tipoInicial === 'transferencia' ? tipoInicial : 'saida'
  );
  const [contaId, setContaId] = useState<number | null>(null);
  const [contaDestinoId, setContaDestinoId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [valor, setValor] = useState(0);
  const [data, setData] = useState<string | null>(hojeIso());
  const [descricao, setDescricao] = useState('');
  const [membroId, setMembroId] = useState<number | null>(null);
  const [reservarProximoMes, setReservarProximoMes] = useState(false);
  const [recorrente, setRecorrente] = useState(false);
  const [pagoCom, setPagoCom] = useState<'conta' | 'cartao'>('conta');
  const [cartaoId, setCartaoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarCartoes();
    carregarContas();
    carregarCategorias();
    carregarMembros();
  }, [carregarContas, carregarCategorias, carregarMembros, carregarCartoes]);

  const contaSelecionada = contaId ?? contas[0]?.id ?? null;
  const cartaoSelecionado = cartaoId ?? cartoes[0]?.id ?? null;
  const noCartao = tipo === 'saida' && pagoCom === 'cartao';

  if (contas.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <EmptyState
          icon="dollar-sign"
          titulo="Cadastre uma conta primeiro"
          descricao="Você precisa de pelo menos uma conta bancária para registrar movimentações."
        />
      </SafeAreaView>
    );
  }

  const valido =
    (noCartao ? cartaoSelecionado !== null : contaSelecionada !== null) &&
    valor > 0 &&
    data !== null &&
    (tipo !== 'transferencia' || (contaDestinoId !== null && contaDestinoId !== contaSelecionada));

  async function handleSalvar() {
    if (!valido || contaSelecionada === null) return;
    setSalvando(true);
    try {
      if (noCartao) {
        // Compra no crédito não sai da conta agora: vira gasto no cartão (compõe a fatura)
        await criarGasto({
          valor,
          categoriaId,
          descricao: descricao.trim() || null,
          data: data ?? hojeIso(),
          formaPagamento: 'cartao',
          contaBancariaId: null,
          cartaoId: cartaoSelecionado,
          membroId,
        });
        router.back();
        return;
      }
      await criar({
        contaBancariaId: contaSelecionada,
        tipo,
        valor,
        data: data ?? hojeIso(),
        descricao: descricao.trim() || null,
        categoriaId: tipo === 'transferencia' ? null : categoriaId,
        contaDestinoId: tipo === 'transferencia' ? contaDestinoId : null,
        origem: 'manual',
        membroId,
        reservarProximoMes: tipo === 'entrada' ? reservarProximoMes : false,
        recorrente: tipo === 'entrada' ? recorrente : false,
        recorrenteOrigemId: null,
      });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
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

        {tipo === 'saida' && (
          <ChipSelect label="Pago com" opcoes={OPCOES_PAGO_COM} valor={pagoCom} onSelecionar={setPagoCom} />
        )}

        {noCartao ? (
          <>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Cartão
            </Text>
            {cartoes.length === 0 ? (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
                Cadastre um cartão na aba Cartões para lançar gastos nele.
              </Text>
            ) : (
              <AccountChips
                contas={cartoes.map((c) => ({ id: c.id, nomeConta: c.nome, cor: c.cor }))}
                selecionada={cartaoSelecionado}
                aoSelecionar={setCartaoId}
              />
            )}
          </>
        ) : (
          <>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              {tipo === 'transferencia' ? 'Conta de origem' : 'Conta'}
            </Text>
            <AccountChips contas={contas} selecionada={contaSelecionada} aoSelecionar={setContaId} />
          </>
        )}

        {tipo === 'transferencia' ? (
          <>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Conta de destino
            </Text>
            <AccountChips
              contas={contas}
              selecionada={contaDestinoId}
              aoSelecionar={setContaDestinoId}
              excluir={contaSelecionada}
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
            <SwitchRow
              titulo="Repetir todo mês"
              descricao="Lança automaticamente o mesmo valor todo mês (ex.: salário) — não precisa recadastrar."
              valor={recorrente}
              onAlterar={setRecorrente}
            />
            <SwitchRow
              titulo="Reservar para o mês que vem"
              descricao="Não entra no resumo deste mês — soma no resumo do mês seguinte. Use para um salário recebido no fim do mês que já é destinado a cobrir o próximo."
              valor={reservarProximoMes}
              onAlterar={setReservarProximoMes}
            />
          </>
        )}

        <View style={{ marginTop: 8 }}>
          <Button titulo="Salvar movimentação" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
