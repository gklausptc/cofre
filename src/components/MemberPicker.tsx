import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import type { MembroFamilia } from '@/domain/types/entities';

type MemberPickerProps = {
  membros: MembroFamilia[];
  membroId: number | null;
  onSelecionar: (id: number | null) => void;
};

/** Só renderiza algo se houver membros cadastrados (uso familiar é opcional — seção 5 do CLAUDE.md). */
export function MemberPicker({ membros, membroId, onSelecionar }: MemberPickerProps) {
  const { colors } = useAppTheme();
  if (membros.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        Membro (opcional)
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {membros.map((membro) => {
          const ativo = membro.id === membroId;
          return (
            <Pressable
              key={membro.id}
              onPress={() => onSelecionar(ativo ? null : membro.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: ativo ? membro.cor : colors.surface,
                borderWidth: 1,
                borderColor: ativo ? membro.cor : colors.border,
              }}
            >
              <Text className="font-body-medium" style={{ color: ativo ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                {membro.nome}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
