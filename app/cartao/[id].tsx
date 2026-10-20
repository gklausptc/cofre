import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ColorPicker } from '@/components/ColorPicker';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCartoesStore } from '@/store/cartoesStore';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useFaturasStore } from '@/store/faturasStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { calcularLimiteDisponivel } from '@/domain/usecases/calcularLimiteDisponivel';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia } from '@/core/utils/date';

export default function DetalheCartaoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cartaoId = Number(id);

  const { cartoes, carregar: carregarCartoes, atualizar, remover } = useCartoesStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { faturas, carregar: carregarFaturas } = useFaturasStore();

  const cartao = cartoes.find((c) => c.id === cartaoId);

  const [nome, setNome] = useState('');
  const [limite, setLimite] = useState(0);
  const [diaFechamento, setDiaFechamento] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('');
  const [cor, setCor] = useState('#2A5CE0');
  const [salvando, setSalvando] = useState(false);
  const [carregadoParaId, setCarregadoParaId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregarCartoes();
      carregarCompras();
      carregarParcelas();
      carregarGastos();
      carregarFaturas();
    }, [carregarCartoes, carregarCompras, carregarParcelas, carregarGastos, carregarFaturas])
  );

  if (cartao && carregadoParaId !== cartaoId) {
    setCarregadoParaId(cartaoId);
    setNome(cartao.nome);
    setLimite(cartao.limite);
    setDiaFechamento(String(cartao.diaFechamento));
    setDiaVencimento(String(cartao.diaVencimento));
    setCor(cartao.cor);
  }

  const comprasDoCartao = useMemo(() => compras.filter((c) => c.cartaoId === cartaoId), [compras, cartaoId]);

  const grupos = useMemo(() => {
    const idsCompras = new Set(comprasDoCartao.map((c) => c.id));
    const parcelasDoCartao = parcelas.filter(
      (p) => p.compraParceladaId !== null && idsCompras.has(p.compraParceladaId)
    );
    const porMes = new Map<string, typeof parcelasDoCartao>();
    for (const parcela of parcelasDoCartao) {
      const lista = porMes.get(parcela.mesReferencia) ?? [];
      lista.push(parcela);
      porMes.set(parcela.mesReferencia, lista);
    }
    return Array.from(porMes.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [comprasDoCartao, parcelas]);

  if (!cartao) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Cartão não encontrado.</Text>
      </SafeAreaView>
    );
  }

  const disponivel = calcularLimiteDisponivel(cartao, compras, parcelas, gastos, faturas);

  const fechamento = parseInt(diaFechamento, 10);
  const vencimento = parseInt(diaVencimento, 10);
  const valido =
    nome.trim().length > 0 &&
    limite > 0 &&
    fechamento >= 1 &&
    fechamento <= 31 &&
    vencimento >= 1 &&
    vencimento <= 31;

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await atualizar(cartaoId, {
        nome: nome.trim(),
        limite,
        diaFechamento: fechamento,
        diaVencimento: vencimento,
        cor,
      });
    } finally {
      setSalvando(false);
    }
  }

  function handleRemover() {
    Alert.alert('Remover cartão', 'Essa ação não pode ser desfeita. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await remover(cartaoId);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Card style={{ backgroundColor: cor, borderWidth: 0, marginBottom: 20 }}>
          <Text className="font-body-medium" style={{ color: '#FFFFFF', opacity: 0.85, fontSize: 13 }}>
            {cartao.nome}
          </Text>
          <Text className="font-heading" style={{ color: '#FFFFFF', fontSize: 26, marginTop: 4 }}>
            {formatarMoeda(disponivel)}
          </Text>
          <Text className="font-body" style={{ color: '#FFFFFF', opacity: 0.75, fontSize: 11, marginTop: 2 }}>
            disponível de {formatarMoeda(cartao.limite)} · fecha dia {cartao.diaFechamento}, vence dia{' '}
            {cartao.diaVencimento}
          </Text>
        </Card>

        <Button
          titulo="Nova compra parcelada"
          onPress={() => router.push({ pathname: '/compra-parcelada/novo', params: { cartaoId: String(cartaoId) } })}
        />

        <View style={{ height: 20 }} />

        {comprasDoCartao.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14, marginBottom: 8 }}>
              Compras parceladas
            </Text>
            <View style={{ gap: 8 }}>
              {comprasDoCartao.map((compra) => (
                <Pressable key={compra.id} onPress={() => router.push(`/compra-parcelada/${compra.id}`)}>
                  <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
                        {compra.descricao}
                      </Text>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                        {compra.numParcelas}x · toque para editar
                      </Text>
                    </View>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
                      {formatarMoeda(compra.valorTotal)}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {grupos.length === 0 ? (
          <EmptyState
            icon="calendar"
            titulo="Nenhuma parcela ainda"
            descricao="As compras parceladas nesse cartão aparecem aqui, agrupadas por mês."
          />
        ) : (
          grupos.map(([mes, itens]) => (
            <View key={mes} style={{ marginBottom: 20 }}>
              <Text
                className="font-heading-medium"
                style={{ color: colors.text, fontSize: 14, marginBottom: 8, textTransform: 'capitalize' }}
              >
                {formatarMesReferencia(mes)}
              </Text>
              <View style={{ gap: 8 }}>
                {itens.map((parcela) => (
                  <Card key={parcela.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
                      Parcela {parcela.numero}
                    </Text>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
                      {formatarMoeda(parcela.valor)}
                    </Text>
                  </Card>
                ))}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 8 }} />
        <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 12 }}>
          Editar cartão
        </Text>

        <TextField label="Nome" value={nome} onChangeText={setNome} />
        <CurrencyInput label="Limite" valor={limite} onChangeValor={setLimite} />
        <TextField
          label="Dia de fechamento"
          placeholder="1 a 31"
          keyboardType="numeric"
          value={diaFechamento}
          onChangeText={setDiaFechamento}
        />
        <TextField
          label="Dia de vencimento"
          placeholder="1 a 31"
          keyboardType="numeric"
          value={diaVencimento}
          onChangeText={setDiaVencimento}
        />
        <ColorPicker cor={cor} onSelecionar={setCor} />

        <View style={{ gap: 12, marginTop: 8 }}>
          <Button titulo="Salvar alterações" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
          <Button titulo="Remover cartão" variante="perigo" onPress={handleRemover} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
