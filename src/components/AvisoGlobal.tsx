import React, { useCallback } from 'react';
import { Snackbar } from '@/components/Snackbar';
import { useAvisoStore } from '@/store/avisoStore';

/** Snackbar global (montado uma vez no layout raiz). */
export function AvisoGlobal() {
  const aviso = useAvisoStore((s) => s.aviso);
  const fechar = useAvisoStore((s) => s.fechar);
  const aoFechar = useCallback(() => fechar(false), [fechar]);
  const desfazer = aviso?.desfazer;
  return (
    <Snackbar
      mensagem={aviso?.mensagem ?? null}
      acao={
        desfazer
          ? {
              rotulo: 'Desfazer',
              onPress: () => {
                desfazer();
                fechar(true);
              },
            }
          : undefined
      }
      onFechar={aoFechar}
    />
  );
}
