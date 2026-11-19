# Cachê Federal

<p align="center">
  <img src="public/icon-brasil.png" alt="Ícone do Cachê Federal" width="112" />
</p>

<p align="center">
  <strong>Descubra quanto custa o exercício de cargos públicos — com dados e fontes à vista.</strong><br />
  Consulte despesas parlamentares e informações de representantes, do Executivo federal e do STF.
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licença MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-145a42.svg"></a>
  <a href="https://github.com/Voiwd/CacheFederal"><img alt="Estrelas no GitHub" src="https://img.shields.io/github/stars/Voiwd/CacheFederal?style=social"></a>
  <img alt="Idioma português do Brasil" src="https://img.shields.io/badge/idioma-pt--BR-009739.svg">
  <img alt="React" src="https://img.shields.io/badge/React-UI-149eca.svg?logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-build-646cff.svg?logo=vite&logoColor=white">
  <img alt="Dados públicos" src="https://img.shields.io/badge/dados-p%C3%BAblicos-ffdf00.svg?labelColor=145a42">
</p>

[**🌐 Abrir o Cachê Federal**](https://cache-federal.voiwd.chatgpt.site)

## Veja como funciona

![Captura da página inicial do Cachê Federal](docs/screenshot-home.png)

### O que você pode fazer

- **Encontrar uma figura pública** por nome e explorar os perfis disponíveis.
- **Consultar valores por período**, com salário de referência, remunerações e despesas publicadas apresentados em categorias distintas.
- **Conferir de onde vêm os números** e quais dados estão disponíveis em cada perfil.
- **Comparar valores** com itens e despesas do dia a dia usando o simulador ilustrativo.
- **Explorar o ranking** e abrir um perfil para ver sua composição e fontes.

O site reúne informações públicas da Câmara, do Senado, do Executivo federal e do STF. A cobertura muda conforme a pessoa, o cargo e o ano consultado. Os valores são retratos das fontes disponíveis: remuneração de referência não é contracheque, e gastos da gestão não são despesas pessoais.

## Executar localmente

Requer Node.js 22 ou posterior. Na raiz do projeto, instale as dependências e inicie o servidor:

```sh
npm ci
npm run dev
```

As consultas financeiras precisam do servidor do projeto; servir somente os arquivos estáticos não habilita essas consultas. Veja as notas técnicas e fontes na documentação abaixo.

---

<details>
<summary>Documentação técnica, fontes e metodologia</summary>

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

O painel inicia com salário tabelado + gastos individuais publicados. Se houver folha individual conciliada, ela substitui o salário da tabela. O seletor permite consultar isoladamente a tabela ou os registros publicados. Contratos institucionais não entram na conta pessoal nem aparecem como opção na interface.

Referências remuneratórias usam o cronograma legal do ano e uma estimativa de 12 meses, conforme a metodologia da fonte. Não representam o contracheque do titular, pagamento recebido, ocupação durante todo o ano ou benefícios efetivamente utilizados. Limites de auxílio sem gasto confirmado não entram no orçamento. Referências e registros publicados são identificados separadamente no extrato e têm origem consultável. As referências podem aparecer antes da conclusão das consultas financeiras; se uma fonte financeira falhar, a referência disponível continua visível.

- Remuneração: pagamentos identificados como remuneração ou benefícios da pessoa, no período informado.
- Referência legal: estimativa a partir da remuneração prevista para o cargo; não é um pagamento individual.
- Despesas do cargo: reembolsos e outros registros vinculados ao exercício do cargo, com fonte e cobertura identificadas.
- Gastos da gestão: despesas de órgãos, governos e prefeituras. Não integram um total pessoal do governante.
- Patrimônio: bens declarados em eleições pertencem a uma categoria distinta; não são despesas públicas.

Comparações devem respeitar período e cobertura equivalentes. Totais parciais não devem ser tratados como custos completos. Contratos publicados, valores empenhados e despesas pagas são medidas diferentes e não devem ser somados indistintamente.

### Composição do total e fotos

A opção inicial soma salário-base do cargo, auxílios e gastos extras publicados. A folha publicada substitui o salário tabelado para impedir duplicidade. Limites condicionais de benefícios não são somados. Contratos da gestão não entram na conta pessoal. Valores ausentes permanecem indisponíveis; o total pode ser parcial. As regras e fontes do perfil e os preços do simulador ficam no botão “Dados públicos”.

`python scripts/refresh-profile-photos.py` associa fotos do TSE pelo identificador exato da candidatura. Fotos de governadores são armazenadas localmente; prefeitos usam os endereços documentados pelo TSE. Ministros com correspondência única de nome completo no cadastro eleitoral recebem a foto da candidatura, com crédito e origem. As fotos são preservadas pela atualização do diretório.

### Fontes conciliadas e escopo da busca

A busca pública exclui prefeitos e governadores, inclusive nas sugestões e na rota de pesquisa. Os arquivos históricos desses cargos são mantidos apenas para não destruir o material de origem.

Senado: a API `senadores/{codigo}/recursos-utilizados?ano=2025` acrescenta despesas fora da cota somente quando identidade, ano, UF, categorias e ambos os totais conferem. O total da cota também precisa ser idêntico à soma, em centavos, dos lançamentos CEAPS. Falhas rejeitam o bloco inteiro, sem preencher lacunas com zero. Contagens de pessoal e uso de imóvel não recebem valor fictício.

STF: `python scripts/refresh-stf-payroll.py` consulta a exportação oficial mensal e gera `worker/stf-payroll.js`. A importação de 2025 exige 12 meses de remuneração e equipe por lotação exata. Soma todas as parcelas publicadas, usa valores brutos em centavos, exclui o ministro da equipe e rejeita valores ausentes, linhas idênticas duplicadas e lotações ambíguas. O arquivo contém somente agregados; nomes e matrículas de funcionários não são persistidos. Oito perfis passaram; Edson Fachin e Gilmar Mendes não recebem totais parciais dessa fonte. A conta abrange a folha publicada pelo STF, sem despesas comuns do Tribunal. A folha substitui a tabela salarial.

Senado e STF oferecem 2025 no seletor enquanto essa é a cobertura validada, evitando misturar salário anual com gastos de um ano em andamento. Presidente e ministros usam os exercícios conciliados de SIAPE e SCDP descritos abaixo. As amostras de contratos federais foram retiradas dessas consultas.

Validação adicional do importador: `python scripts/test_stf_payroll.py`.

### Executivo federal: folha e viagens

`python scripts/refresh-federal-costs.py --year 2025` importa os 12 ZIPs mensais SIAPE e o ZIP anual SCDP do Portal da Transparência. Não precisa de chave da API: os arquivos oficiais contêm os registros em lote. Gera `worker/federal-costs.js`, preservando os anos já importados. Os ZIPs e os registros intermediários ficam em `.data/federal/`, fora do Git; o site recebe somente os valores conciliados e as referências públicas, sem CPF ou matrícula. O seletor prioriza os anos validados de cada perfil.

A identidade é conferida por nome completo, identificador SIAPE, cargo e mês. A remuneração só substitui a tabela se os 12 meses fecharem: salário bruto + abate-teto + 13º + férias + outros pagamentos, com reconciliação contra o líquido e os descontos publicados. Os auxílios/indenizações são conferidos contra a soma das parcelas e acrescentados uma vez. Folhas com múltiplos vínculos ou valores divergentes são rejeitadas integralmente; permanece a tabela quando o exercício anual do cargo foi confirmado.

Viagens: o arquivo anual é lido por inteiro. Beneficiário por nome e CPF mascarado, confrontado com o cadastro do mês; cargo de presidente ou função ministerial CNE-0001; um registro por processo. Soma diárias, passagens e outros gastos, subtraindo devoluções. Passagens, trechos e pagamentos do mesmo ZIP não são somados de novo. Não há conversão de viagens ausentes em zero. Perfis sem confirmação do cargo nos 12 meses não recebem a conta anual nem salário anual inventado de ministro.

O custo de cartões das unidades da Presidência não é pessoalmente atribuível nos arquivos agregados e fica fora do total, com fonte e explicação em Dados públicos. SCDP não representa todas as viagens presidenciais, voos da FAB ou comitivas. Folha SIAPE não cobre remunerações de origem externas ao sistema. O total representa as fontes integradas, não o custo completo da Presidência ou de um ministério. A coleta é um snapshot verificável, não atualização automática contínua.

Testes: `python scripts/test_federal_costs.py` e `npm test`.

Cobertura federal importada nesta versão: Lula/2025, Bolsonaro/2022, Temer/2018 e Dilma/2015, além de 13 ministros com exercício anual confirmado em 2025. Os arquivos históricos que bloquearam a coleta automática foram obtidos pelo formulário oficial no navegador e depois conciliados com os demais meses. Nenhum subtotal anual foi publicado. Anos anteriores a essa cobertura não recebem valores copiados de outros exercícios. Nos três ex-presidentes, não houve viagens individuais identificadas no SCDP; a ausência fica explícita, sem criar uma despesa de valor zero. O total de Temer respeita o abate-teto publicado na folha; aposentadorias e outros vínculos não são somados ao cargo presidencial.

O importador reutiliza os arquivos locais para permitir retomada. Use `--refresh` para baixar novamente fontes que possam ter recebido ajustes; mudanças no conjunto de nomes invalidam o cache de seleção. Sem os 12 meses ou com falha de leitura, o ano publicado anteriormente é preservado.

</details>
