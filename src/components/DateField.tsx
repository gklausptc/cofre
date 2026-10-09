import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { isValid, parse } from 'date-fns';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type DateFieldProps = {
  label: string;
  /** data em ISO ('YYYY-MM-DD') ou null quando o texto digitado ainda é inválido/incompleto */
  valor: string | null;
  onChange: (iso: string | null) => void;
};

function isoParaTexto(iso: string | null): string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function aplicarMascara(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Campo de data digitável no formato dd/mm/aaaa. */
export function DateField({ label, valor, onChange }: DateFieldProps) {
  const { colors } = useAppTheme();
  const [texto, setTexto] = useState(isoParaTexto(valor));

  function handleChange(novo: string) {
    const mascarado = aplicarMascara(novo);
    setTexto(mascarado);
    if (mascarado.length < 10) {
      onChange(null);
      return;
    }
    const data = parse(mascarado, 'dd/MM/yyyy', new Date());
    const ano = data.getFullYear();
    onChange(isValid(data) && ano >= 2000 && ano <= 2100 ? `${mascarado.slice(6)}-${mascarado.slice(3, 5)}-${mascarado.slice(0, 2)}` : null);
  }

  const incompleto = texto.length > 0 && valor === null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={texto}
        onChangeText={handleChange}
        keyboardType="numeric"
        placeholder="dd/mm/aaaa"
        placeholderTextColor={colors.textMuted}
        maxLength={10}
        style={{
          backgroundColor: colors.surface,
          borderColor: incompleto && texto.length === 10 ? colors.danger : colors.border,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.text,
          fontSize: 15,
          fontFamily: 'Manrope_400Regular',
        }}
      />
      {incompleto && texto.length === 10 && (
        <Text className="font-body" style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>
          Data inválida.
        </Text>
      )}
    </View>
  );
}
