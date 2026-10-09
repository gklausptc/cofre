import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ChipSelect } from '@/components/ChipSelect';
import { MemberPicker } from '@/components/MemberPicker';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import type { ContaFixa } from '@/domain/types/entities';
import { useCartoesStore } from '@/store/cartoesStore';
import { addMonths, format, parseISO } from 'date-fns';
import { hojeIso } from '@/core/utils/date';

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

export default function NovaContaFixaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const criar = useContasFixasStore((s) => s.criar);
  const { contas: contasBancarias, carregar: carregarContas } = useContasBancariasStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();

  const [nome, setNome] = useState('');
  const [valor, setValor] = useState(0);
  const [diaVencimento, setDiaVencimento] = useState('5');
  const [formaPagamento, setFormaPagamento] = useState<ContaFixa['formaPagamento']>('debito');
  const [recorrencia, setRecorrencia] = useState<ContaFixa['recorrencia']>('mensal');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [contaBancariaId, setContaBancariaId] = useState<number | null>(null);
  const [membroId, setMembroId] = useState<number | null>(null);
  const [cartaoId, setCartaoId] = useState<number | null>(null);
  const [numParcelas, setNumParcelas] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarContas();
    carregarCategorias();
    carregarMembros();
    carregarCartoes();
  }, [carregarContas, carregarCategorias, carregarMembros, carregarCartoes]);

  const diaNumero = parseInt(diaVencimento, 10);
  const valido =
    nome.trim().length > 0 &&
    valor > 0 &&
    diaNumero >= 1 &&
    diaNumero <= 31 &&
    (formaPagamento !== 'cartao' || cartoes.length > 0);

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      const dataInicio = hojeIso();
      await criar({
        nome: nome.trim(),
        categoriaId,
        valor,
        diaVencimento: diaNumero,
        formaPagamento,
        contaBancariaId: formaPagamento !== 'cartao' ? contaBancariaId : null,
        cartaoId: formaPagamento === 'cartao' ? (cartaoId ?? cartoes[0]?.id ?? null) : null,
        recorrencia,
        dataInicio,
        dataFim: calcularDataFim(dataInicio, numParcelas, recorrencia),
        membroId,
      });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TextField label="Nome" placeholder="Ex.: Aluguel" value={nome} onChangeText={setNome} />
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
              {contasBancarias.map((conta) => {
                const ativo = conta.id === contaBancariaId;
                return (
                  <Text
                    key={conta.id}
                    onPress={() => setContaBancariaId(conta.id)}
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
                    {conta.nomeConta}
                  </Text>
                );
              })}
            </View>
          </View>
        )}

        <MemberPicker membros={membros} membroId={membroId} onSelecionar={setMembroId} />

        <View style={{ marginTop: 8 }}>
          <Button titulo="Salvar conta fixa" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
