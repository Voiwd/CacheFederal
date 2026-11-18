import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('federal', Path(__file__).with_name('refresh-federal-costs.py'))
federal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(federal)


class FederalCostsTests(unittest.TestCase):
    def payroll(self):
        row = {k: '0,00' for k in ['REMUNERAÇÃO BÁSICA BRUTA (R$)', 'ABATE-TETO (R$)',
            'GRATIFICAÇÃO NATALINA (R$)', 'ABATE-TETO DA GRATIFICAÇÃO NATALINA (R$)',
            'FÉRIAS (R$)', 'OUTRAS REMUNERAÇÕES EVENTUAIS (R$)', 'IRRF (R$)', 'PSS/RPGS (R$)',
            'DEMAIS DEDUÇÕES (R$)', 'PENSÃO MILITAR (R$)', 'FUNDO DE SAÚDE (R$)',
            'TAXA DE OCUPAÇÃO IMÓVEL FUNCIONAL (R$)', 'REMUNERAÇÃO APÓS DEDUÇÕES OBRIGATÓRIAS (R$)',
            'TOTAL DE VERBAS INDENIZATÓRIAS (R$)(*)', 'VERBAS INDENIZATÓRIAS CIVIL (R$)']}
        row.update({'REMUNERAÇÃO BÁSICA BRUTA (R$)': '1000,00', 'ABATE-TETO (R$)': '-50,00',
                    'IRRF (R$)': '-100,00', 'REMUNERAÇÃO APÓS DEDUÇÕES OBRIGATÓRIAS (R$)': '850,00',
                    'TOTAL DE VERBAS INDENIZATÓRIAS (R$)(*)': '20,00', 'VERBAS INDENIZATÓRIAS CIVIL (R$)': '20,00'})
        return row

    def test_gross_keeps_taxes_and_does_not_duplicate_allowances(self):
        self.assertEqual(federal.reconcile_payroll(self.payroll()), (95000, 2000))

    def test_mismatching_net_or_allowances_rejected(self):
        for key in ['REMUNERAÇÃO APÓS DEDUÇÕES OBRIGATÓRIAS (R$)', 'TOTAL DE VERBAS INDENIZATÓRIAS (R$)(*)']:
            row = self.payroll(); row[key] = '1,00'
            with self.assertRaises(ValueError): federal.reconcile_payroll(row)

    def test_missing_or_foreign_currency_rejected(self):
        row = self.payroll(); row['IRRF (R$)'] = ''
        with self.assertRaises(ValueError): federal.reconcile_payroll(row)
        row = self.payroll(); row['FÉRIAS (U$)'] = '1,00'
        with self.assertRaises(ValueError): federal.reconcile_payroll(row)

    def travel(self):
        return {'Período - Data de início': '02/01/2025', 'Função': 'CNE-0001', 'Cargo': '',
            'Nome': 'Pessoa Teste', 'CPF viajante': '***.123.456-**', 'Identificador do processo de viagem': '000123',
            'Valor diárias': '100,00', 'Valor passagens': '200,00', 'Valor outros gastos': '10,00',
            'Valor devolução': '50,00', 'Número da Proposta (PCDP)': '1/25', 'Destinos': 'Brasília/DF', 'Situação': 'Realizada'}

    def parse(self, rows):
        return federal.reconcile_travel(rows, {'role': 'minister', 'fullName': 'Pessoa Teste'}, 2025, {1: {'CPF': '***.123.456-**'}})

    def test_refund_subtracted_once(self):
        self.assertEqual(self.parse([self.travel()])[0]['value'], 260)

    def test_duplicate_and_identity_mismatch_rejected(self):
        with self.assertRaises(ValueError): self.parse([self.travel(), self.travel()])
        row = self.travel(); row['CPF viajante'] = '***.000.000-**'
        with self.assertRaises(ValueError): self.parse([row])

    def test_other_role_not_attributed(self):
        row = self.travel(); row['Função'] = 'CCX-0118'
        self.assertEqual(self.parse([row]), [])


if __name__ == '__main__': unittest.main()
