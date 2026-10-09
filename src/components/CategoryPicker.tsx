import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import type { Categoria } from '@/domain/types/entities';

type CategoryPickerProps = {
  categorias: Categoria[];
  tipo?: 'receita' | 'despesa';
  categoriaId: number | null;
  onSelecionar: (id: number) => void;
};

export function CategoryPicker({ categorias, tipo, categoriaId, onSelecionar }: CategoryPickerProps) {
  const { colors } = useAppTheme();
  const lista = tipo ? categorias.filter((c) => c.tipo === tipo) : categorias;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        Categoria
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {lista.map((categoria) => {
            const selecionada = categoria.id === categoriaId;
            return (
              <Pressable
                key={categoria.id}
                onPress={() => onSelecionar(categoria.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 999,
                  backgroundColor: selecionada ? categoria.cor : colors.surface,
                  borderWidth: 1,
                  borderColor: selecionada ? categoria.cor : colors.border,
                }}
              >
                <Text
                  className="font-body-medium"
                  style={{ color: selecionada ? '#FFFFFF' : colors.text, fontSize: 13 }}
                >
                  {categoria.nome}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
