# Importação de extratos: formatos por banco

Levantamento de outubro de 2026, feito com arquivos reais publicados por usuários (GitHub),
páginas de ajuda dos bancos e respostas no Reclame Aqui. Os layouts estão em
`src/domain/usecases/importacao/layouts.ts` e os testes, com a mesma estrutura dos arquivos
reais, em `src/domain/usecases/importacao/__tests__/formatosDosBancos.test.ts`.

## O que cada banco exporta

| Banco | Conta | Cartão |
|---|---|---|
| Banco do Brasil | CSV, OFX, TXT (app e site) | TXT de largura fixa, OFX |
| Santander | **Só PDF** desde 2026 | **Só PDF** |
| Bradesco | CSV (`;`), OFX (site) | TXT/OFX no site; PDF no app |
| Itaú | OFX, TXT (site) | CSV (desde set/2025); sem OFX |
| Nubank | CSV, OFX (por e-mail) | CSV, OFX (fatura fechada) |
| C6 Bank | CSV e OFX no Web Banking; app só PDF | CSV pelo app |
| PicPay | CSV (por e-mail) | **Só PDF** |
| InfinitePay | CSV, OFX (formato não confirmado) | não encontrado |

## Regras que valem para todos

- **Codificação:** UTF-8, com ou sem BOM; se falhar, Windows-1252 (`decodificarLatin1`).
- **Decimal:** ponto ou vírgula, inclusive no `<TRNAMT>` do OFX. O PicPay usa o sinal de menos tipográfico (U+2212).
- **Saldo e totais aparecem no meio dos lançamentos** ("Saldo Anterior", "Saldo do dia", "S A L D O", "COD. LANC. 0", "Total"), às vezes até no OFX com valor zero. Tudo isso é descartado.
- **O sinal muda de arquivo para arquivo.** No app, a conta tem saída negativa e o cartão tem compra positiva. Na fatura em OFX a compra vem negativa e é invertida na leitura.
- **O FITID do OFX não é chave.** Repete no BB e nas parcelas do Nubank, e muda a cada download no Itaú, Bradesco e C6. O id de cada linha é data + valor + descrição normalizada + ordem entre linhas iguais. A exceção é o UUID da conta Nubank, o mesmo no CSV ("Identificador") e no OFX.
- **Parcelas antigas vêm com a data da compra original** (C6, Itaú, Ourocard). Na importação de fatura, tudo entra na fatura escolhida, e as compras antigas ganham a data de fechamento dela, com "(compra em dd/mm/aaaa)" na descrição.

## Particularidades

- **BB, conta (CSV):** `"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"`, com vírgula como separador e Latin-1. A coluna "Tipo Lançamento" (Entrada/Saída) decide o sinal. Também existe o layout antigo (até 2024), com "Dependencia Origem" e "Data do Balancete".
- **BB, fatura Ourocard (TXT):** largura fixa. As linhas começam com `DD.MM.AAAA`, colado à descrição, e o vencimento está no cabeçalho.
- **Bradesco, conta:** linha de agência antes do cabeçalho, colunas Crédito/Débito sem sinal, e um bloco "Últimos Lançamentos" que repete lançamentos (descartados).
- **Bradesco, fatura:** datas `dd/mm` sem ano. O ano vem da linha "Data: dd/mm/aaaa" do topo.
- **Itaú, fatura (CSV):** `data,lançamento,valor`, com data ISO, ponto decimal e parcela colada no texto.
- **Itaú, conta (TXT):** sem cabeçalho, no formato `data;histórico;valor`.
- **Nubank, conta:** `Data,Valor,Identificador,Descrição`.
- **Nubank, fatura:** `date,title,amount`. Desde meados de 2026 alguns arquivos trazem `"75,61"` e `"- 3.891,91"`.
- **C6, conta (CSV):** 8 linhas de título antes do cabeçalho, com Entrada e Saída em colunas.
- **C6, fatura:** `;` como separador, coluna Parcela ("Única" ou "9/10"), e o vencimento vem no nome do arquivo (`Fatura_AAAA-MM-DD.csv`).
- **PicPay, conta:** `data,hora,tipo,"origem / destino",valor,"forma de pagamento"`, com valores como `"−R$ 7,50"`. O formato foi confirmado por uma fonte só.

## O que falta confirmar com arquivos reais

- Layout do CSV do InfinitePay e da fatura do InfinitePay.
- Segunda fonte para o CSV do PicPay.
- OFX de cartão do BB e do Bradesco.
