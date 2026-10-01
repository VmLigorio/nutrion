import unittest

import server


class PatientPortalPayloadTests(unittest.TestCase):
    def test_returns_read_only_profile_and_only_this_patients_records(self):
        data = {
            'patients': [
                {'id': 10, 'name': 'Ana', 'healthNotes': 'Alergia relatada', 'bustCm': 92},
                {'id': 20, 'name': 'Bia', 'healthNotes': 'Confidencial de Bia'},
            ],
            'consultations': [
                {'id': 1, 'patientId': 10, 'date': '2026-09-01', 'summary': 'Retorno'},
                {'id': 2, 'patientId': 20, 'date': '2026-09-02', 'summary': 'Outro paciente'},
            ],
            'appointments': [
                {'id': 3, 'patientId': 10, 'status': 'Confirmada'},
                {'id': 4, 'patientId': 10, 'status': 'Cancelada'},
                {'id': 5, 'patientId': 20, 'status': 'Confirmada'},
            ],
            'plans': [
                {'id': 6, 'patientId': 10, 'published': {'title': 'Plano atual'}, 'versions': [{'version': 1, 'publishedAt': '2026-09-03'}], 'draft': {'title': 'Rascunho privado'}},
                {'id': 7, 'patientId': 20, 'published': {'title': 'Plano de outra pessoa'}, 'versions': [{'version': 1, 'publishedAt': '2026-09-03'}]},
                {'id': 8, 'patientId': 10, 'published': None, 'versions': [], 'draft': {'title': 'Plano não publicado'}},
            ],
        }

        payload = server.patient_portal_payload(data, '10', 'Dra. Nutri')

        self.assertEqual(payload['patient'], data['patients'][0])
        self.assertEqual([item['summary'] for item in payload['consultations']], ['Retorno'])
        self.assertEqual([item['id'] for item in payload['appointments']], [3])
        self.assertEqual([item['title'] for item in payload['plans']], ['Plano atual'])
        self.assertNotIn('accessCode', payload)
        self.assertIsNone(server.patient_portal_payload(data, '999', 'Dra. Nutri'))


if __name__ == '__main__':
    unittest.main()
