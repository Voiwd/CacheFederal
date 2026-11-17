export const REFERENCE_DATE = '2025-01-01'

export const products = [
  {
    id: 'cafe-pao',
    name: 'Café com pão na chapa',
    price: 14.9,
    emoji: '☕',
    category: 'Sobrevivência',
    description: 'A reunião poderia ter sido um e-mail, mas o café não.',
  },
  {
    id: 'prato-feito',
    name: 'Prato feito',
    price: 35,
    emoji: '🍛',
    category: 'Sobrevivência',
    description: 'Arroz, feijão e uma auditoria informal no preço do quilo.',
  },
  {
    id: 'cesta-basica',
    name: 'Cesta básica',
    price: 852.87,
    emoji: '🧺',
    category: 'Casa',
    description: 'Um mês de mercado. Dependendo do apetite e da inflação.',
  },
  {
    id: 'celular',
    name: 'Celular intermediário',
    price: 1899,
    emoji: '📱',
    category: 'Tecnologia',
    description: 'Para abrir a transparência e fechar antes de fazer as contas.',
  },
  {
    id: 'notebook',
    name: 'Notebook de trabalho',
    price: 4299,
    emoji: '💻',
    category: 'Tecnologia',
    description: 'Roda planilha, videoconferência e uma leve crise existencial.',
  },
  {
    id: 'aluguel',
    name: 'Mês de aluguel',
    price: 1800,
    emoji: '🏠',
    category: 'Casa',
    description: 'Sem condomínio, IPTU e outras surpresas democráticas.',
  },
  {
    id: 'salario-minimo',
    name: 'Salário mínimo de 2025',
    price: 1518,
    emoji: '💼',
    category: 'Realidade',
    description: 'Aqui ele aparece inteiro. Na vida real, chegam os boletos.',
  },
  {
    id: 'moto',
    name: 'Moto urbana 0 km',
    price: 16900,
    emoji: '🏍️',
    category: 'Transporte',
    description: 'Duas rodas, muitas parcelas e nenhum motorista à disposição.',
  },
  {
    id: 'carro',
    name: 'Carro popular 0 km',
    price: 79990,
    emoji: '🚗',
    category: 'Transporte',
    description: 'Popular no nome. No financiamento, uma celebridade.',
  },
  {
    id: 'apartamento',
    name: 'Apartamento compacto',
    price: 350000,
    emoji: '🏙️',
    category: 'Casa',
    description: 'Dois quartos, se o segundo aceitar ser chamado de quarto.',
  },
]

export const comparisonReferences = {
  minimumWage: {
    label: 'salários mínimos',
    value: 1518,
    sourceLabel: 'Decreto nº 12.342/2024',
    sourceUrl: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/decreto/d12342.htm',
    referenceDate: '2025',
  },
  basicBasket: {
    label: 'cestas básicas',
    value: 852.87,
    sourceLabel: 'DIEESE — São Paulo, jan. 2025',
    sourceUrl: 'https://www.dieese.org.br/analisecestabasica/2025/202501cestabasica.pdf',
    referenceDate: 'jan. 2025',
  },
  meal: {
    label: 'pratos feitos',
    value: 35,
    sourceLabel: 'Preço ilustrativo do simulador',
    sourceUrl: null,
    referenceDate: '2025',
  },
  rent: {
    label: 'meses de aluguel',
    value: 1800,
    sourceLabel: 'Preço ilustrativo do simulador',
    sourceUrl: null,
    referenceDate: '2025',
  },
}

export const productDisclaimer =
  'Produtos e preços são referências fictícias para comparação. A compra não existe e os valores não representam patrimônio pessoal.'
