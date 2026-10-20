import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { CategoryPicker } from '@/components/CategoryPicker';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useRegrasStore } from '@/store/regrasStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import type { Categoria, ContatoPix, RegraCategorizacao } from '@/domain/types/entities';

const CORRESPONDENCIAS: { valor: RegraCategorizacao['tipoCorrespondencia']; rotulo: string }[] = [
  { valor: 'contem', rotulo: 'Contém' },
  { valor: 'comeca_com', rotulo: 'Começa com' },
  { valor: 'exato', rotulo: 'Igual a' },
];

const ACOES: { valor: RegraCategorizacao['acao']; rotulo: string }[] = [
  { valor: 'categorizar', rotulo: 'Categorizar' },
  { valor: 'transferencia_propria', rotulo: 'Transferência minha' },
  { valor: 'emprestimo', rotulo: 'Empréstimo' },
  { valor: 'ignorar', rotulo: 'Não importar' },
];

const TIPOS_DE_CONTATO: { valor: ContatoPix['tipo']; rotulo: string }[] = [
  { valor: 'pessoa', rotulo: 'Pessoa' },
  { valor: 'familia', rotulo: 'Família' },
  { valor: 'servico', rotulo: 'Serviço' },
  { valor: 'emprestimo', rotulo: 'Empréstimo' },
  { valor: 'propria', rotulo: 'Conta minha' },
];

function descreverRegra(regra: RegraCategorizacao, categorias: Categoria[]): string {
  if (regra.acao === 'categorizar') {
    return categorias.find((c) => c.id === regra.categoriaId)?.nome ?? 'Categoria apagada';
  }
  return ACOES.find((a) => a.valor === regra.acao)?.rotulo ?? regra.acao;
}

function confirmarExclusao(titulo: string, onConfirmar: () => void) {
  Alert.alert(titulo, 'As próximas importações deixam de usar isso. O que já foi importado não muda.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: onConfirmar },
  ]);
}

function CartaoDaRegra({ regra, categorias }: { regra: RegraCategorizacao; categorias: Categoria[] }) {
  const { colors } = useAppTheme();
  const { atualizarRegra, excluirRegra } = useRegrasStore();
  const [aberta, setAberta] = useState(false);
  const tipoDaCategoria = regra.natureza === 'receita' ? 'receita' : regra.natureza === 'despesa' ? 'despesa' : undefined;

  return (
    <Card>
      <Pressable onPress={() => setAberta((a) => !a)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
            {CORRESPONDENCIAS.find((c) => c.valor === regra.tipoCorrespondencia)?.rotulo} “{regra.padrao}”
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
            → {descreverRegra(regra, categorias)} · usada {regra.vezesUsada} {regra.vezesUsada === 1 ? 'vez' : 'vezes'}
          </Text>
        </View>
        <Feather name={aberta ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {aberta && (
        <View style={{ marginTop: 12 }}>
          <ChipSelect
            label="Quando a descrição"
            opcoes={CORRESPONDENCIAS}
            valor={regra.tipoCorrespondencia}
            onSelecionar={(tipoCorrespondencia) => atualizarRegra(regra.id, { tipoCorrespondencia })}
          />
          <ChipSelect label="O que fazer" opcoes={ACOES} valor={regra.acao} onSelecionar={(acao) => atualizarRegra(regra.id, { acao })} />
          {regra.acao === 'categorizar' && (
            <CategoryPicker
              categorias={categorias}
              tipo={tipoDaCategoria}
              categoriaId={regra.categoriaId}
              onSelecionar={(categoriaId) => atualizarRegra(regra.id, { categoriaId })}
            />
          )}
          <Button
            titulo="Excluir regra"
            variante="secundaria"
            onPress={() => confirmarExclusao('Excluir esta regra?', () => excluirRegra(regra.id))}
          />
        </View>
      )}
    </Card>
  );
}

function CartaoDoContato({ contato, categorias }: { contato: ContatoPix; categorias: Categoria[] }) {
  const { colors } = useAppTheme();
  const { atualizarContato, excluirContato } = useRegrasStore();
  const [aberto, setAberto] = useState(false);
  const categoria = categorias.find((c) => c.id === contato.categoriaId);
  const tipo = TIPOS_DE_CONTATO.find((t) => t.valor === contato.tipo)?.rotulo ?? contato.tipo;

  return (
    <Card>
      <Pressable onPress={() => setAberto((a) => !a)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
            {contato.apelido}
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
            {contato.nomeNormalizado} · {tipo}
            {categoria ? ` · ${categoria.nome}` : ''}
          </Text>
        </View>
        <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {aberto && (
        <View style={{ marginTop: 12 }}>
          <ChipSelect label="Quem é" opcoes={TIPOS_DE_CONTATO} valor={contato.tipo} onSelecionar={(t) => atualizarContato(contato.id, { tipo: t })} />
          {contato.tipo !== 'propria' && contato.tipo !== 'emprestimo' && (
            <CategoryPicker
              categorias={categorias}
              categoriaId={contato.categoriaId}
              onSelecionar={(categoriaId) => atualizarContato(contato.id, { categoriaId })}
            />
          )}
          <Button
            titulo="Excluir contato"
            variante="secundaria"
            onPress={() => confirmarExclusao('Excluir este contato?', () => excluirContato(contato.id))}
          />
        </View>
      )}
    </Card>
  );
}

export default function RegrasAprendidasScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { regras, contatos, carregar } = useRegrasStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarCategorias();
    }, [carregar, carregarCategorias])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Regras aprendidas" subtitle="O que o Cofre faz sozinho ao importar extratos" />

        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {regras.length === 0 && contatos.length === 0 ? (
            <>
              <EmptyState
                icon="zap"
                titulo="Nenhuma regra ainda"
                descricao="Ao importar um extrato e escolher a categoria de uma linha, o Cofre guarda a regra e faz igual nas próximas vezes."
              />
              <Button titulo="Importar extrato" onPress={() => router.push('/importar-extrato')} />
            </>
          ) : (
            <>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginTop: 4 }}>
                Regras ({regras.length})
              </Text>
              {regras.length === 0 ? (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                  Nenhuma regra de descrição.
                </Text>
              ) : (
                regras.map((regra) => <CartaoDaRegra key={regra.id} regra={regra} categorias={categorias} />)
              )}

              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginTop: 12 }}>
                Contatos PIX ({contatos.length})
              </Text>
              {contatos.length === 0 ? (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                  Quando você disser quem é alguém que recebe ou manda PIX, ele aparece aqui.
                </Text>
              ) : (
                contatos.map((contato) => <CartaoDoContato key={contato.id} contato={contato} categorias={categorias} />)
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
