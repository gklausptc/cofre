import React from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type TextFieldProps = TextInputProps & {
  label: string;
};

export function TextField({ label, style, ...rest }: TextFieldProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        className="font-body-medium"
        style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}
      >
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: colors.text,
            fontSize: 15,
            fontFamily: 'Manrope_400Regular',
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}
