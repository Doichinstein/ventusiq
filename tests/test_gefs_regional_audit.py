"""Counterfactual checks for the independent retained regional audit."""
import copy
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parent.parent
AUDIT = runpy.run_path(str(ROOT/'scripts/verify-gefs-regional-evaluation.py'))
EVIDENCE = ROOT/'docs/evidence'


class RegionalAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = AUDIT['read'](EVIDENCE/'gefs-regional-plan-2026-10-30.json')
        cls.capture = AUDIT['read'](EVIDENCE/'gefs-regional-capture-2026-10-30.json')
        cls.evaluation = AUDIT['read'](EVIDENCE/'gefs-regional-outcomes-2026-11-01.json.gz')

    def test_retained_results(self):
        self.assertEqual(AUDIT['audit'](self.plan,self.capture,self.evaluation)['counts'],
                         {'matched':76,'pending':66,'observation_missing':2})

    def test_missing_case_not_hidden(self):
        changed=copy.deepcopy(self.evaluation)
        changed['report']['rows'].pop()
        with self.assertRaisesRegex(ValueError,'denominator'):
            AUDIT['audit'](self.plan,self.capture,changed)

    def test_changed_observation_not_accepted(self):
        changed=copy.deepcopy(self.evaluation)
        changed['report']['rows'][0]['observed_f']+=1
        with self.assertRaisesRegex(ValueError,'Arithmetic'):
            AUDIT['audit'](self.plan,self.capture,changed)

    def test_false_coverage_not_accepted(self):
        changed=copy.deepcopy(self.evaluation)
        changed['report']['overall']['inclusion_fraction']=.8
        with self.assertRaisesRegex(ValueError,'Arithmetic'):
            AUDIT['audit'](self.plan,self.capture,changed)


if __name__=='__main__':
    unittest.main()
