import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCategoriasStore } from '@/store/categoriasStore';
import { CORES_DE_CATEGORIA, NAO_IDENTIFICADO } from '@/domain/dados/categoriasPadrao';
import type { Categoria } from '@/domain/types/entities';

type CategoryPickerProps = {
  categorias: Categoria[];
  tipo?: 'receita' | 'despesa';
  categoriaId: number | null;
  onSelecionar: (id: number) => void;
  /** Mostra "+ Nova" para criar uma categoria ali mesmo (padrão: sim, quando há `tipo`). */
  permitirCriar?: boolean;
};

const POR_ULTIMO = new Set([NAO_IDENTIFICADO, 'Outros gastos', 'Outras receitas']);

/** Chips de categoria em várias linhas (as genéricas por último) e "+ Nova" para criar na hora. */
export function CategoryPicker({ categorias, tipo, categoriaId, onSelecionar, permitirCriar = true }: CategoryPickerProps) {
  const { colors } = useAppTheme();
  const criar = useCategoriasStore((s) => s.criar);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  const lista = useMemo(() => {
    const doTipo = tipo ? categorias.filter((c) => c.tipo === tipo) : categorias;
    return [...doTipo].sort(
      (a, b) => Number(POR_ULTIMO.has(a.nome)) - Number(POR_ULTIMO.has(b.nome)) || a.nome.localeCompare(b.nome, 'pt-BR')
    );
  }, [categorias, tipo]);

  async function salvarNova() {
    const limpo = nome.trim();
    if (!tipo || limpo === '') return;
    const igual = categorias.find((c) => c.tipo === tipo && c.nome.toLocaleLowerCase('pt-BR') === limpo.toLocaleLowerCase('pt-BR'));
    if (igual) {
      onSelecionar(igual.id);
    } else {
      setSalvando(true);
      try {
        const nova = await criar({
          nome: limpo,
          tipo,
          icone: 'tag',
          cor: CORES_DE_CATEGORIA[categorias.length % CORES_DE_CATEGORIA.length],
          isPadrao: false,
        });
        onSelecionar(nova.id);
      } finally {
        setSalvando(false);
      }
    }
    setNome('');
    setCriando(false);
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        Categoria
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {lista.map((categoria) => {
          const selecionada = categoria.id === categoriaId;
          return (
            <Pressable
              key={categoria.id}
              onPress={() => onSelecionar(categoria.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: selecionada }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: selecionada ? categoria.cor : colors.surface,
                borderWidth: 1,
                borderColor: selecionada ? categoria.cor : colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {!selecionada && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: categoria.cor }} />}
              <Text className="font-body-medium" style={{ color: selecionada ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                {categoria.nome}
              </Text>
            </Pressable>
          );
        })}
        {permitirCriar && tipo && !criando && (
          <Pressable
            onPress={() => setCriando(true)}
            accessibilityRole="button"
            accessibilityLabel="Criar categoria"
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.brand,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Feather name="plus" size={14} color={colors.brand} />
            <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
              Nova
            </Text>
          </Pressable>
        )}
      </View>
      {criando && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <TextInput
            value={nome}
            onChangeText={setNome}
            autoFocus
            placeholder={tipo === 'receita' ? 'Ex.: Aluguel recebido' : 'Ex.: Pet, Presentes, Carro'}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={salvarNova}
            returnKeyType="done"
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.text,
              fontSize: 14,
            }}
          />
          <Pressable
            onPress={salvarNova}
            disabled={nome.trim() === '' || salvando}
            accessibilityRole="button"
            accessibilityLabel="Salvar categoria"
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: colors.brand,
              justifyContent: 'center',
              opacity: nome.trim() === '' ? 0.5 : 1,
            }}
          >
            <Text className="font-body-medium" style={{ color: '#FFFFFF', fontSize: 13 }}>
              Criar
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCriando(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Feather name="x" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
