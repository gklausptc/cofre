import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ChipSelect } from '@/components/ChipSelect';
import { MemberPicker } from '@/components/MemberPicker';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia } from '@/core/utils/date';
import type { ContaFixa } from '@/domain/types/entities';
import { useCartoesStore } from '@/store/cartoesStore';
import { addMonths, differenceInCalendarMonths, format, parseISO } from 'date-fns';

function calcularDataFim(dataInicio: string, numParcelas: string, recorrencia: ContaFixa['recorrencia']): string | null {
  const total = parseInt(numParcelas, 10);
  if (recorrencia !== 'mensal' || !(total >= 1)) return null;
  return format(addMonths(parseISO(dataInicio), total - 1), 'yyyy-MM-dd');
}

const OPCOES_FORMA_PAGAMENTO: { valor: ContaFixa['formaPagamento']; rotulo: string }[] = [
  { valor: 'debito', rotulo: 'Débito' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'boleto', rotulo: 'Boleto' },
];

const OPCOES_RECORRENCIA: { valor: ContaFixa['recorrencia']; rotulo: string }[] = [
  { valor: 'mensal', rotulo: 'Mensal' },
  { valor: 'quinzenal', rotulo: 'Quinzenal' },
  { valor: 'semanal', rotulo: 'Semanal' },
  { valor: 'anual', rotulo: 'Anual' },
  { valor: 'unica', rotulo: 'Única' },
];

export default function DetalheContaFixaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const contaId = Number(id);

  const { contas, atualizar, remover } = useContasFixasStore();
  const { contas: contasBancarias, carregar: carregarContasBancarias } = useContasBancariasStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { parcelas, carregar: carregarParcelas, marcarPaga } = useParcelasStore();
  const conta = contas.find((c) => c.id === contaId);

  const [nome, setNome] = useState('');
  const [valor, setValor] = useState(0);
  const [diaVencimento, setDiaVencimento] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<ContaFixa['formaPagamento']>('debito');
  const [recorrencia, setRecorrencia] = useState<ContaFixa['recorrencia']>('mensal');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [contaBancariaId, setContaBancariaId] = useState<number | null>(null);
  const [membroId, setMembroId] = useState<number | null>(null);
  const [cartaoId, setCartaoId] = useState<number | null>(null);
  const [numParcelas, setNumParcelas] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [carregadoParaId, setCarregadoParaId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregarContasBancarias();
      carregarCategorias();
      carregarMembros();
      carregarParcelas();
      carregarCartoes();
    }, [carregarContasBancarias, carregarCategorias, carregarMembros, carregarParcelas, carregarCartoes])
  );

  if (conta && carregadoParaId !== contaId) {
    setCarregadoParaId(contaId);
    setNome(conta.nome);
    setValor(conta.valor);
    setDiaVencimento(String(conta.diaVencimento));
    setFormaPagamento(conta.formaPagamento);
    setRecorrencia(conta.recorrencia);
    setCategoriaId(conta.categoriaId);
    setContaBancariaId(conta.contaBancariaId);
    setMembroId(conta.membroId);
    setCartaoId(conta.cartaoId);
    setNumParcelas(
      conta.dataFim
        ? String(differenceInCalendarMonths(parseISO(conta.dataFim), parseISO(conta.dataInicio)) + 1)
        : ''
    );
  }

  if (!conta) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Conta fixa não encontrada.</Text>
      </SafeAreaView>
    );
  }

  const ocorrencias = parcelas
    .filter((p) => p.contaFixaId === contaId)
    .sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia));

  const diaNumero = parseInt(diaVencimento, 10);
  const valido =
    nome.trim().length > 0 &&
    valor > 0 &&
    diaNumero >= 1 &&
    diaNumero <= 31 &&
    (formaPagamento !== 'cartao' || cartoes.length > 0);
  const dataInicioConta = conta.dataInicio;
  const totalParcelas = conta.dataFim
    ? differenceInCalendarMonths(parseISO(conta.dataFim), parseISO(conta.dataInicio)) + 1
    : null;

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await atualizar(contaId, {
        nome: nome.trim(),
        valor,
        diaVencimento: diaNumero,
        formaPagamento,
        recorrencia,
        categoriaId,
        contaBancariaId: formaPagamento !== 'cartao' ? contaBancariaId : null,
        membroId,
        dataFim: calcularDataFim(dataInicioConta, numParcelas, recorrencia),
      });
    } finally {
      setSalvando(false);
    }
  }

  function handleRemover() {
    Alert.alert('Remover conta fixa', 'Essa ação não pode ser desfeita. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await remover(contaId);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginTop: 8, marginBottom: 10 }}>
          Ocorrências geradas
        </Text>
        {ocorrencias.length === 0 ? (
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
            Nenhuma ocorrência gerada ainda — feche e reabra o app para gerar os próximos meses.
          </Text>
        ) : (
          <View style={{ gap: 8, marginBottom: 20 }}>
            {ocorrencias.map((parcela) => (
              <Card key={parcela.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, textTransform: 'capitalize' }}>
                    {formatarMesReferencia(parcela.mesReferencia)}
                  </Text>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                    {formatarMoeda(parcela.valor)}
                    {totalParcelas !== null ? ` · parcela ${parcela.numero} de ${totalParcelas}` : ''}
                  </Text>
                </View>
                {parcela.status === 'paga' ? (
                  <Feather name="check-circle" size={20} color={colors.brand} />
                ) : (
                  <Feather
                    name="circle"
                    size={20}
                    color={colors.textMuted}
                    onPress={() => marcarPaga(parcela.id)}
                  />
                )}
              </Card>
            ))}
          </View>
        )}

        <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 12 }}>
          Editar conta fixa
        </Text>

        <TextField label="Nome" value={nome} onChangeText={setNome} />
        <CurrencyInput label="Valor" valor={valor} onChangeValor={setValor} />
        <TextField
          label="Dia do vencimento"
          placeholder="1 a 31"
          keyboardType="numeric"
          value={diaVencimento}
          onChangeText={setDiaVencimento}
        />
        <ChipSelect
          label="Forma de pagamento"
          opcoes={OPCOES_FORMA_PAGAMENTO}
          valor={formaPagamento}
          onSelecionar={setFormaPagamento}
        />
        <ChipSelect
          label="Recorrência"
          opcoes={OPCOES_RECORRENCIA}
          valor={recorrencia}
          onSelecionar={setRecorrencia}
        />
        {recorrencia === 'mensal' && (
          <TextField
            label="Número de parcelas (opcional)"
            placeholder="Ex.: 48 — deixe vazio se não tem fim"
            keyboardType="numeric"
            value={numParcelas}
            onChangeText={setNumParcelas}
          />
        )}
        <CategoryPicker
          categorias={categorias}
          tipo="despesa"
          categoriaId={categoriaId}
          onSelecionar={setCategoriaId}
        />

        {formaPagamento === 'cartao' && (
          <View style={{ marginBottom: 16 }}>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Cartão
            </Text>
            {cartoes.length === 0 ? (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                Cadastre um cartão na aba Cartões primeiro.
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {cartoes.map((cartao) => {
                  const ativo = cartao.id === cartaoId;
                  return (
                    <Text
                      key={cartao.id}
                      onPress={() => setCartaoId(cartao.id)}
                      className="font-body-medium"
                      style={{
                        color: ativo ? '#FFFFFF' : colors.text,
                        backgroundColor: ativo ? cartao.cor : colors.surface,
                        borderWidth: 1,
                        borderColor: ativo ? cartao.cor : colors.border,
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        fontSize: 13,
                        overflow: 'hidden',
                      }}
                    >
                      {cartao.nome}
                    </Text>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {formaPagamento !== 'cartao' && (
          <View style={{ marginBottom: 16 }}>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Conta bancária
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {contasBancarias.map((cb) => {
                const ativo = cb.id === contaBancariaId;
                return (
                  <Text
                    key={cb.id}
                    onPress={() => setContaBancariaId(cb.id)}
                    className="font-body-medium"
                    style={{
                      color: ativo ? '#FFFFFF' : colors.text,
                      backgroundColor: ativo ? colors.brand : colors.surface,
                      borderWidth: 1,
                      borderColor: ativo ? colors.brand : colors.border,
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      fontSize: 13,
                      overflow: 'hidden',
                    }}
                  >
                    {cb.nomeConta}
                  </Text>
                );
              })}
            </View>
          </View>
        )}

        <MemberPicker membros={membros} membroId={membroId} onSelecionar={setMembroId} />

        <View style={{ gap: 12, marginTop: 8 }}>
          <Button titulo="Salvar alterações" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
          <Button titulo="Remover conta fixa" variante="perigo" onPress={handleRemover} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
