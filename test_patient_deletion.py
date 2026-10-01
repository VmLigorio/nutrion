import unittest

import server


class PatientDeletionTests(unittest.TestCase):
    def test_removes_patient_and_only_that_patients_workspace_records(self):
        data = {
            'patients': [{'id': 1, 'name': 'Ana'}, {'id': 2, 'name': 'Bia'}],
            'consultations': [{'id': 10, 'patientId': 1}, {'id': 20, 'patientId': 2}],
            'appointments': [{'id': 11, 'patientId': 1}, {'id': 21, 'patientId': 2}],
            'plans': [{'id': 12, 'patientId': 1}, {'id': 22, 'patientId': 2}],
        }

        self.assertTrue(server.remove_patient_records(data, '1'))
        self.assertEqual([patient['id'] for patient in data['patients']], [2])
        for group in ('consultations', 'appointments', 'plans'):
            self.assertEqual([item['patientId'] for item in data[group]], [2])
        self.assertFalse(server.remove_patient_records(data, 'missing'))


if __name__ == '__main__':
    unittest.main()
