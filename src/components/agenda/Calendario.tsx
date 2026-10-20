import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { getDaysInMonth, parseISO } from 'date-fns';
import { useAppTheme } from '@/core/theme/ThemeProvider';

export type MarcaDoDia = 'pago' | 'previsto' | 'atrasado' | 'entrada';

type Props = {
  /** 'YYYY-MM' */
  mes: string;
  hoje: string;
  selecionado: string | null;
  /** Marcas de cada dia ('YYYY-MM-DD' → status dos itens). */
  marcas: Map<string, MarcaDoDia[]>;
  onSelecionar: (dia: string) => void;
};

const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Calendário do mês com pontos por dia: pago, pendente, atrasado e entrada. */
export function Calendario({ mes, hoje, selecionado, marcas, onSelecionar }: Props) {
  const { colors } = useAppTheme();
  const primeiro = parseISO(`${mes}-01`);
  const vazios = primeiro.getDay();
  const dias = getDaysInMonth(primeiro);
  const celulas: (number | null)[] = [...Array.from({ length: vazios }, () => null), ...Array.from({ length: dias }, (_, i) => i + 1)];
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas = Array.from({ length: celulas.length / 7 }, (_, i) => celulas.slice(i * 7, i * 7 + 7));
  const cor: Record<MarcaDoDia, string> = {
    pago: colors.success,
    previsto: colors.warning,
    atrasado: colors.danger,
    entrada: colors.brand,
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {DIAS_DA_SEMANA.map((d, i) => (
          <Text key={i} className="font-body-medium" style={{ flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 11 }}>
            {d}
          </Text>
        ))}
      </View>
      {semanas.map((semana, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          {semana.map((dia, j) => {
            if (dia === null) return <View key={j} style={{ flex: 1, height: 48 }} />;
            const iso = `${mes}-${String(dia).padStart(2, '0')}`;
            const doDia = marcas.get(iso) ?? [];
            const ehHoje = iso === hoje;
            const ativo = iso === selecionado;
            const pontos = [...new Set(doDia)].slice(0, 3);
            return (
              <Pressable
                key={j}
                onPress={() => onSelecionar(iso)}
                accessibilityRole="button"
                accessibilityLabel={`Dia ${dia}${doDia.length > 0 ? `, ${doDia.length} ${doDia.length === 1 ? 'item' : 'itens'}` : ''}`}
                accessibilityState={{ selected: ativo }}
                style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: ativo ? colors.brand : 'transparent',
                    borderWidth: ehHoje && !ativo ? 1 : 0,
                    borderColor: colors.brand,
                  }}
                >
                  <Text
                    className={ativo || ehHoje ? 'font-heading-medium' : 'font-body'}
                    style={{ color: ativo ? '#FFFFFF' : colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}
                  >
                    {dia}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 3, height: 5, marginTop: 1 }}>
                  {pontos.map((m) => (
                    <View key={m} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: cor[m] }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {(
          [
            ['pago', 'Pago'],
            ['previsto', 'Pendente'],
            ['atrasado', 'Atrasado'],
            ['entrada', 'Entrada'],
          ] as const
        ).map(([marca, rotulo]) => (
          <View key={marca} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cor[marca] }} />
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
              {rotulo}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
