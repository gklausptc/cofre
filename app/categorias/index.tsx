import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { TextField } from '@/components/TextField';
import { CategoryPicker } from '@/components/CategoryPicker';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useAvisoStore } from '@/store/avisoStore';
import { CORES_DE_CATEGORIA } from '@/domain/dados/categoriasPadrao';
import type { Categoria } from '@/domain/types/entities';

type Tipo = 'despesa' | 'receita';

function Cores({ cor, onEscolher }: { cor: string; onEscolher: (cor: string) => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
      {CORES_DE_CATEGORIA.map((opcao) => (
        <Pressable
          key={opcao}
          onPress={() => onEscolher(opcao)}
          accessibilityRole="button"
          accessibilityLabel={`Cor ${opcao}`}
          accessibilityState={{ selected: opcao === cor }}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: opcao,
            borderWidth: opcao === cor ? 3 : 0,
            borderColor: colors.text,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {opcao === cor && <Feather name="check" size={14} color="#FFFFFF" />}
        </Pressable>
      ))}
    </View>
  );
}

function EditorDaCategoria({ categoria, usos, categorias, onFechar }: { categoria: Categoria; usos: number; categorias: Categoria[]; onFechar: () => void }) {
  const { colors } = useAppTheme();
  const { atualizar, juntar } = useCategoriasStore();
  const mostrarAviso = useAvisoStore((s) => s.mostrar);
  const [nome, setNome] = useState(categoria.nome);
  const [cor, setCor] = useState(categoria.cor);
  const [destino, setDestino] = useState<number | null>(null);
  const outras = categorias.filter((c) => c.id !== categoria.id);
  const nomeDoDestino = outras.find((c) => c.id === destino)?.nome ?? '';

  async function salvar() {
    if (nome.trim() === '') return;
    await atualizar(categoria.id, { nome: nome.trim(), cor });
    onFechar();
  }

  function confirmarJuntar() {
    if (destino === null) return;
    Alert.alert(
      `Juntar ${categoria.nome} em ${nomeDoDestino}?`,
      `${usos > 0 ? `Os ${usos} lançamentos` : 'Tudo o que era'} de ${categoria.nome} (e as regras e contas fixas) passa para ${nomeDoDestino}, e ${categoria.nome} deixa de existir. Não dá para desfazer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Juntar',
          style: 'destructive',
          onPress: async () => {
            await juntar(categoria.id, destino);
            mostrarAviso({ mensagem: `${categoria.nome} agora faz parte de ${nomeDoDestino}.` });
            onFechar();
          },
        },
      ]
    );
  }

  return (
    <View style={{ marginTop: 12 }}>
      <TextField label="Nome" value={nome} onChangeText={setNome} />
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        Cor
      </Text>
      <Cores cor={cor} onEscolher={setCor} />
      <Button titulo="Salvar" onPress={salvar} disabled={nome.trim() === ''} />
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} />
      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, marginBottom: 4 }}>
        Juntar com outra categoria
      </Text>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        Para apagar uma categoria sem perder os lançamentos: tudo dela passa para a escolhida.
      </Text>
      <CategoryPicker categorias={outras} tipo={categoria.tipo} categoriaId={destino} onSelecionar={setDestino} permitirCriar={false} />
      <Button titulo={destino === null ? 'Escolha a categoria' : `Juntar em ${nomeDoDestino}`} variante="perigo" disabled={destino === null} onPress={confirmarJuntar} />
    </View>
  );
}

/** Categorias: criar as suas, mudar nome e cor, e juntar duas (o jeito de apagar sem perder lançamentos). */
export default function CategoriasScreen() {
  const { colors } = useAppTheme();
  const { categorias, carregar, criar } = useCategoriasStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const [tipo, setTipo] = useState<Tipo>('despesa');
  const [aberta, setAberta] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES_DE_CATEGORIA[0]);

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarMovimentacoes();
      carregarGastos();
    }, [carregar, carregarMovimentacoes, carregarGastos])
  );

  const usos = useMemo(() => {
    const contagem = new Map<number, number>();
    for (const m of movimentacoes) if (m.categoriaId !== null) contagem.set(m.categoriaId, (contagem.get(m.categoriaId) ?? 0) + 1);
    for (const g of gastos) if (g.categoriaId !== null) contagem.set(g.categoriaId, (contagem.get(g.categoriaId) ?? 0) + 1);
    return contagem;
  }, [movimentacoes, gastos]);

  const doTipo = useMemo(
    () => categorias.filter((c) => c.tipo === tipo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [categorias, tipo]
  );
  const jaExiste = doTipo.some((c) => c.nome.toLocaleLowerCase('pt-BR') === nome.trim().toLocaleLowerCase('pt-BR'));

  async function adicionar() {
    if (nome.trim() === '' || jaExiste) return;
    await criar({ nome: nome.trim(), tipo, cor, icone: 'tag', isPadrao: false });
    setNome('');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Categorias" subtitle="As suas e as que o app já traz" />
        <ChipSelect<Tipo>
          label="Mostrar"
          opcoes={[
            { valor: 'despesa', rotulo: 'Gastos' },
            { valor: 'receita', rotulo: 'Entradas' },
          ]}
          valor={tipo}
          onSelecionar={(t) => {
            setTipo(t);
            setAberta(null);
          }}
        />

        <Card>
          <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
            Nova categoria de {tipo === 'despesa' ? 'gasto' : 'entrada'}
          </Text>
          <TextField label="Nome" value={nome} onChangeText={setNome} placeholder={tipo === 'despesa' ? 'Ex.: Pet, Presentes, Carro' : 'Ex.: Aluguel recebido'} />
          <Cores cor={cor} onEscolher={setCor} />
          {jaExiste && (
            <Text className="font-body" style={{ color: colors.warning, fontSize: 12, marginBottom: 8 }}>
              Já existe uma categoria com esse nome.
            </Text>
          )}
          <Button titulo="Criar categoria" onPress={adicionar} disabled={nome.trim() === '' || jaExiste} />
        </Card>

        {doTipo.map((categoria) => (
          <Card key={categoria.id}>
            <Pressable
              onPress={() => setAberta(aberta === categoria.id ? null : categoria.id)}
              accessibilityRole="button"
              accessibilityLabel={`${categoria.nome}. Editar`}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}
            >
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: categoria.cor, marginRight: 10 }} />
              <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                {categoria.nome}
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginRight: 8 }}>
                {usos.get(categoria.id) ?? 0} lanç.
              </Text>
              <Feather name={aberta === categoria.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>
            {aberta === categoria.id && (
              <EditorDaCategoria
                categoria={categoria}
                usos={usos.get(categoria.id) ?? 0}
                categorias={categorias}
                onFechar={() => setAberta(null)}
              />
            )}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
