# Pesquisa de concorrentes (outubro/2026)

Resumo da pesquisa feita para a versão 2.0. Fontes: App Store BR, centrais de ajuda,
Reclame Aqui (pelos trechos da busca), imprensa especializada e reviews de 2025–2026.
Serve de referência para decisões de produto (ver `.claude/agents/conselheiro-produto.md`).

## Mercado

- O Guiabolso (PicPay) e a Olivia (Nubank) foram encerrados em 2022 e viraram recursos dos
  bancos. O Mobills é do Santander (Toro); o Kinvo, do BTG.
- Open Finance é grande, mas 45% não confiam no saldo de outras contas e as parcelas
  futuras do cartão só chegam quando a fatura fecha. **Diferencial possível de um app
  offline: números que batem, privacidade e digitação mínima.**
- Retenção em 30 dias de apps de finanças fica perto de 7%: o inimigo é o abandono.

## O que os concorrentes fazem bem

| App | O que vale copiar |
|---|---|
| Copilot Money | "Free to Spend" com linha de ritmo ideal × real; fila "To Review" depois de importar; corrigir categoria oferece criar regra |
| PocketGuard / Simplifi | Um número só: renda − contas − metas, dividido pelos dias que faltam |
| Monarch | Orçamento Fixas / Flex / Não mensais; "meu, dele, nosso" por membro; revisão mensal guiada |
| YNAB | Pagamento do cartão já reservado ao gastar; analisa 90 dias para sugerir metas |
| Organizze | Parcelado = valor total + número de parcelas, sobra na 1ª; data da compra define a fatura; ocultar valores |
| Minhas Finanças (app) | Casa o lançamento manual com o importado para não duplicar |
| Monefy | Gasto rápido com o valor primeiro, em poucos toques |
| Mobills | "Meu desempenho": mês atual × anteriores |

## Ranking das ideias para o Cofre (offline e familiar)

1. "Livre para gastar" com valor por dia e ritmo (ideal × real).
2. Fatura por competência, parcelas futuras, limite comprometido e melhor dia de compra.
3. Agenda com pago/pendente e "falta pagar R$ X".
4. Saldo projetado dia a dia, com alerta "vai ficar negativo dia 23".
5. Fila "A revisar" depois de importar, com regras que aprendem.
6. Conciliação previsto × realizado (conta fixa lançada não duplica com o extrato).
7. Visão por membro ("meu, dele, nosso").
8. Orçamento Fixas / Flex / Não mensais (IPVA, IPTU, matrícula, seguro).
9. Metas com aporte sugerido, data projetada e rendimento líquido.
10. Fechamento do mês guiado e retrospectiva anual.
11. Gasto rápido com valor primeiro (menos de 10 s).
12. Detecção de assinaturas e cobranças recorrentes no extrato.
13. Onboarding que aprende com 60–90 dias de extrato.
14. Backup visível e desfazer por lote de importação.
15. Ocultar valores com um toque e bloqueio do app.

## Os 10 erros que os usuários mais odeiam

1. Saldo que não bate com o banco.
2. Importação que duplica, some ou apaga lançamentos.
3. Paywall que tira recurso que era grátis.
4. Renovação automática sem aviso.
5. Suporte que não responde.
6. Categorização errada em silêncio.
7. Excesso de notificações previsíveis.
8. Método rígido e curva de aprendizado.
9. Trabalho manual demais.
10. Cartão tratado como conta comum (fatura e parcelas erradas).

## Recomendações aplicadas

- **Início:** chips de membro; "Livre para gastar até dd/mm · ≈ R$ X/dia" com barra de ritmo
  (toque abre a conta: receita − fixas − parcelas − aportes − já gasto; tom de alerta se o
  saldo projetado ficar negativo); próximos 7 dias com "Paguei"; cartões com "fecha dia X";
  "A revisar (n)"; saldo e guardado com olho para ocultar. Nada de gráfico pesado.
- **Importação:** prévia antes de gravar; fila agrupada por estabelecimento ("IFOOD ×14 →
  Alimentação? Aplicar a todos"); mostrar de onde veio a sugestão; corrigir cria regra
  editável; transferência própria e pagamento de fatura nunca viram despesa; "PARC 03/10"
  liga à compra parcelada; desfazer a importação inteira.
- **Agenda:** "Pago R$ Y · Falta R$ X"; calendário com pontos (pago, pendente, atrasado);
  fatura como um item só; receitas previstas; "menor saldo previsto".
- **Metas:** rendimento líquido (IR regressivo, IOF nos 30 primeiros dias, poupança isenta);
  aporte sugerido; data no ritmo atual só com histórico; reserva em "meses cobertos";
  celebração aos 25/50/75/100%.
- **Notificações:** por evento; agrupar vencimentos do mesmo dia ("3 contas vencem amanhã ·
  R$ 412,30"); nada entre 21h e 8h; resumo semanal opcional e desligado por padrão; tom
  factual, sem exclamação; janela móvel por causa do limite de 64 no iOS.
- **Relatórios:** barras horizontais por categoria × média de 3 meses; receita × despesa de
  6–12 meses; "comprometido nos próximos 12 meses" (fixas + parcelas); recortes por membro,
  cartão e conta; sem pizza com mais de 5 fatias; tocar na barra abre os lançamentos.
- **Onboarding (3 passos, sem conta):** conta principal e saldo; renda e fixas comuns em
  chips (ou importar extrato); cartões (opcional). Cai no Início com o número calculado.

## Nome e logo

- **Nome escolhido: Cofre Klaus.** Mantém a marca e o conceito de cofre, e "Klaus" deixa o
  nome distintivo e de família. "Klaus" sozinho colide com o software da Zendesk, o filme da
  Netflix e uma memecoin. "Kofre" fica como marca curta do ícone.
- **Antes de publicar em loja:** conferir no INPI (classes 9, 36 e 42) e no registro.br.
- **Logo:** quadrado arredondado na cor da marca com um "K" claro formado pela porta do
  cofre (a haste é a dobradiça) e um único ponto de acento (o botão do segredo). No máximo
  2 cores mais o acento, sem gradiente, sem texto, sem traço fino; glifo em ~60% da área;
  legível em 29 px. PNG 1024×1024 (o Icon Composer só roda no macOS).
- **Expo Go:** muda só o nome exibido. `slug`, `scheme`, projeto EAS, `cofre.db` e as chaves
  do SecureStore continuam iguais (CLAUDE.md §14). O ícone só aparece na tela do iPhone num
  build próprio; no Expo Go ele aparece dentro do próprio Expo Go.
