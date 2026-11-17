# Cachê Federal

Consulta de dados públicos sobre representantes e despesas do exercício do cargo. A interface distingue remuneração da pessoa, despesas vinculadas ao cargo e gastos da gestão. Um orçamento público não representa o patrimônio ou o custo pessoal do governante.

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

As consultas de representantes usam a [API da Câmara](https://dadosabertos.camara.leg.br/). As despesas da CEAP usam arquivos oficiais anuais, com snapshots compactados em `.data/`. O manifesto registra origem, data da coleta e SHA-256 do arquivo anual.

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
| Presidência e ministérios | Diretório institucional atual do SIORG e consulta de contratos do PNCP | Busca pelo órgão, sem cadastro de titulares ou folha individual; contratos têm cobertura parcial |
| Estados e municípios | Busca territorial do IBGE e consulta de contratos do PNCP | Busca pelo território, sem cadastro nominal de governadores e prefeitos; remuneração e despesas pessoais ainda não integradas |

As listas territoriais exibem até 100 resultados; refine a UF e o nome para encontrar o município desejado. Consultas ao PNCP exibem a primeira página disponível e não calculam total consolidado. Os valores dos contratos não são pagamentos efetuados e não entram em um total pessoal. A existência de um território no IBGE não garante registros no PNCP no período selecionado.

O diretório atual do SIORG e a lista atual do Senado não identificam automaticamente quem ocupava o cargo em um ano passado. Bens eleitorais do TSE, finanças fiscais do Siconfi, folhas de pagamento de estados e municípios, viagens e importação dos cartões presidenciais permanecem fora da integração automática. A interface informa essas lacunas e aponta as fontes disponíveis.

As rotas locais são `GET /api/expansion/search` (filtros `role`, `name`, `state`, `city`) e `GET /api/expansion/costs` (`profile` serializado em JSON e `year`). Os perfis de consulta de custos são resolvidos novamente nas fontes oficiais; nome, URL e UF fornecidos pelo cliente não podem redefinir a identidade consultada. Respostas inválidas usam HTTP 400; indisponibilidade de fonte pode usar HTTP 502 ou aparecer como indisponibilidade do componente, sem valor monetário.

As fontes consultadas nesta versão são públicas e não exigem chave no frontend. O backend mantém cache em memória de 15 minutos para reduzir requisições. Nenhuma credencial deve ser incluída no código do cliente.

## Critérios de interpretação

- Remuneração: pagamentos identificados como remuneração ou benefícios da pessoa, no período informado.
- Despesas do cargo: reembolsos e outros registros vinculados ao exercício do cargo, com fonte e cobertura identificadas.
- Gastos da gestão: despesas de órgãos, governos e prefeituras. Não integram um total pessoal do governante.
- Patrimônio: bens declarados em eleições pertencem a uma categoria distinta; não são despesas públicas.

Comparações devem respeitar período e cobertura equivalentes. Totais parciais não devem ser tratados como custos completos. Contratos publicados, valores empenhados e despesas pagas são medidas diferentes e não devem ser somados indistintamente.
