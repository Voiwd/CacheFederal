# Cachê Federal

Consulta de dados públicos sobre representantes, membros do STF e despesas do exercício do cargo. A interface distingue remuneração da pessoa, referências legais do cargo, despesas vinculadas ao cargo e gastos da gestão. Um orçamento público não representa o patrimônio ou o custo pessoal do governante.

## Desenvolvimento

Requer Node.js com suporte a `fetch`, `Request`, `Response` e `DecompressionStream` (Node 22 ou posterior recomendado).

```sh
npm ci
npm run dev
```

O servidor Vite atende a interface e as rotas locais de consulta. Execute os comandos a partir da raiz do repositório.

```sh
node --test scripts/*.test.mjs
npm run build
```

O build gera a interface em `dist/` e um Worker em `dist/server/index.js`. As consultas do servidor exigem acesso HTTPS às fontes oficiais. Hospedar apenas os arquivos estáticos não disponibiliza as rotas de consulta. A configuração do projeto de hospedagem fica em `.openai/hosting.json`; nenhuma publicação é executada pelo build.

## Dados da Câmara

A busca de deputados usa preferencialmente o cadastro oficial coletado em `public/deputados.json`, com origem e data de atualização. Se o arquivo estiver indisponível ou inválido, consulta a [API da Câmara](https://dadosabertos.camara.leg.br/). A composição pode mudar depois da coleta. As despesas da CEAP usam arquivos oficiais anuais, com snapshots compactados em `.data/`. O manifesto registra origem, data da coleta e SHA-256 do arquivo anual.

Para atualizar os snapshots de 2025 e 2026:

```sh
python scripts/refresh-ceap.py
```

Depois da atualização, execute os testes e gere novamente o build. O script exige rede e regrava os snapshots e o manifesto. Os valores são um retrato da data de coleta, sujeitos a atualizações e estornos posteriores.

A apuração de remuneração e gabinete consulta páginas oficiais da Câmara. Alterações no HTML podem interromper a extração. Ausência de dados ou falha de consulta não equivale a gasto zero.

## Cobertura da expansão

| Área | Implementado | Limites |
| --- | --- | --- |
| Senado | Busca de senadores em exercício e reembolsos CEAPS por ano | A lista atual não reconstitui mandatos anteriores; remuneração e demais custos de gabinete ainda não integrados |
| Presidência e governadores | Busca nominal dos eleitos em 2022, com período de mandato e fonte do TSE | Registro histórico eleitoral; não confirma ocupação atual, afastamentos ou substituições |
| Prefeitos | Busca nominal de eleitos em 2024 e correspondência territorial do IBGE | Cobertura parcial de municípios; não abrange automaticamente eleições suplementares ou sucessões |
| Ministros | Busca nominal do diretório do Planalto, com órgão identificado pelo SIORG | Retrato da data de coleta; não reconstitui a ocupação em anos anteriores |
| STF | Composição nominal e retratos da fonte institucional, com referência remuneratória legal | Não representa contracheques ou benefícios individuais; composição datada |
| Presidência histórica | Perfil de Jair Bolsonaro com mandato encerrado e referências do respectivo período | Não recebe a referência presidencial atual ao consultar um ano posterior ao mandato |

A busca principal consulta todos os cargos por nome, com filtros de cargo, partido e UF. Os perfis usam o mesmo painel, extrato e simulador, preservando as diferenças entre as fontes. Consultas ao PNCP exibem a primeira página disponível, filtrada pelo Executivo e pela administração consultada. O simulador pode usar o subtotal dos contratos de valor conhecido dessa amostra, explicitamente identificado como valor contratado; não representa total anual, pagamentos efetuados ou custo pessoal. A existência de um perfil não garante registros financeiros no período selecionado. Sem dados, o valor permanece indisponível; um zero publicado permanece zero.

Os snapshots nominais são gerados por `python scripts/refresh-political-profiles.py` em `worker/political-profiles.js`, com data, origem e ressalvas temporais. Presidente e governadores correspondem à eleição de 2022; prefeitos à de 2024. Há municípios ainda sem correspondência territorial, registrados em `unmatchedMunicipalities` no snapshot. A lista atual do Senado e o diretório de ministros não identificam automaticamente quem ocupava o cargo em um ano passado. Bens eleitorais do TSE, finanças fiscais do Siconfi, folhas de pagamento do Executivo, viagens e importação dos cartões presidenciais permanecem fora da integração automática. A interface informa essas lacunas e aponta as fontes disponíveis.

As rotas locais são `GET /api/expansion/search` (filtros `role`, `name`, `state`, `city`), `GET /api/expansion/costs` e `GET /api/expansion/references` (ambas recebem `profile` serializado em JSON e `year`). O endpoint de referências usa o cadastro canônico e as tabelas legais locais para responder sem depender das consultas financeiras externas. Os perfis de consulta são resolvidos novamente nos cadastros oficiais; nome, URL e UF fornecidos pelo cliente não podem redefinir a identidade consultada. Respostas inválidas usam HTTP 400; indisponibilidade de fonte pode usar HTTP 502 ou aparecer como indisponibilidade do componente, sem valor monetário.

`worker/additional-profiles.js` reúne perfis institucionais complementares e enriquecimentos de fotos; `worker/parliament-directory.js` preserva o cadastro parlamentar; `worker/reference-costs.js` mantém os cronogramas legais e sua metodologia. Retratos locais ficam em `public/portraits/`, com origem e crédito no perfil. Há fontes da Câmara, Senado e STF; o retrato de Lula conserva o crédito da Presidência e sua origem fotográfica no Flickr. Esses retratos são arquivos de cadastro, sem garantia de atualização contínua.

As fontes consultadas nesta versão são públicas e não exigem chave no frontend. O backend mantém cache em memória de 15 minutos para reduzir requisições. Nenhuma credencial deve ser incluída no código do cliente.

## Critérios de interpretação

O painel oferece bases separadas para o simulador: valores pessoais publicados, referência legal do cargo e contratos da amostra da gestão. A escolha altera o orçamento e os gráficos; os valores dessas bases não são somados. Quando não há remuneração publicada e existe uma referência legal confirmada, a referência aparece como base inicial, com indicação de estimativa. Reembolsos reais, como CEAPS, permanecem disponíveis em sua própria base.

Referências remuneratórias usam o cronograma legal do ano e uma estimativa de 12 meses, conforme a metodologia da fonte. Não representam o contracheque do titular, pagamento recebido, ocupação durante todo o ano ou benefícios efetivamente utilizados. Limites de auxílio sem gasto confirmado não entram no orçamento. Referências e registros publicados são identificados separadamente no extrato e têm origem consultável. As referências podem aparecer antes da conclusão das consultas financeiras; se uma fonte financeira falhar, a referência disponível continua visível.

- Remuneração: pagamentos identificados como remuneração ou benefícios da pessoa, no período informado.
- Referência legal: estimativa a partir da remuneração prevista para o cargo; não é um pagamento individual.
- Despesas do cargo: reembolsos e outros registros vinculados ao exercício do cargo, com fonte e cobertura identificadas.
- Gastos da gestão: despesas de órgãos, governos e prefeituras. Não integram um total pessoal do governante.
- Patrimônio: bens declarados em eleições pertencem a uma categoria distinta; não são despesas públicas.

Comparações devem respeitar período e cobertura equivalentes. Totais parciais não devem ser tratados como custos completos. Contratos publicados, valores empenhados e despesas pagas são medidas diferentes e não devem ser somados indistintamente.
