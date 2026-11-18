import csv,io,runpy,unittest
from pathlib import Path
module=runpy.run_path(str(Path(__file__).with_name('refresh-stf-payroll.py')))
parse_month=module['parse_month']
GROSS=module['GROSS']
HEADERS=['Matrícula','Nome','Cargo Efetivo','Nome da Unidade','Situação Funcional',GROSS]
UNIT='GABINETE MINISTRO ALEXANDRE DE MORAES'
def row(id,name,value,role='',status='EFETIVO',unit=UNIT):return dict(zip(HEADERS,[id,name,role,unit,status,value]))
def content(rows):
 text=io.StringIO();writer=csv.DictWriter(text,fieldnames=HEADERS);writer.writeheader();writer.writerows(rows);return text.getvalue().encode('utf-8')
class PayrollTests(unittest.TestCase):
 def setUp(self):
  self.salary=row('58','ALEXANDRE DE MORAES','100.10','MINISTRO','MINISTRO')
  self.staff=row('100','ASSESSOR TESTE','20.05')
 def test_multiple_published_payments_add_to_cents_without_repeating_minister_in_staff(self):
  extra={**self.salary,GROSS:'10.20'}
  result=parse_month(content([self.salary,extra,self.staff]),2025,11)['stf-alexandre-de-moraes']
  self.assertEqual(result['salary'],11030);self.assertEqual(result['cabinet'],2005);self.assertEqual(result['staffCount'],1)
 def test_identical_duplicate_in_selected_cabinet_rejects_whole_month(self):
  self.assertNotIn('stf-alexandre-de-moraes',parse_month(content([self.salary,self.staff,self.staff]),2025,1))
 def test_missing_staff_amount_is_not_zero(self):
  self.assertNotIn('stf-alexandre-de-moraes',parse_month(content([self.salary,{**self.staff,GROSS:''}]),2025,1))
 def test_presidency_does_not_establish_unique_individual_cabinet(self):
  self.assertNotIn('stf-alexandre-de-moraes',parse_month(content([{**self.salary,'Nome da Unidade':'GABINETE DA PRESIDÊNCIA'},self.staff]),2025,1))
 def test_retired_minister_never_enters_active_payroll(self):
  self.assertNotIn('stf-alexandre-de-moraes',parse_month(content([{**self.salary,'Situação Funcional':'APOSENTADO MINISTRO'},self.staff]),2025,1))
 def test_changed_source_schema_is_rejected(self):
  with self.assertRaises(ValueError):parse_month(b'Nome,Valor\nTeste,123\n',2025,1)
if __name__=='__main__':unittest.main()
