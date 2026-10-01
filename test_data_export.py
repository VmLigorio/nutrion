import unittest

import server


class DataExportTests(unittest.TestCase):
    def test_export_contains_profile_and_workspace_without_auth_secrets(self):
        workspace = {
            'patients': [{'id': 1, 'name': 'Ana', 'healthNotes': 'Informação privada'}],
            'consultations': [],
            'appointments': [],
            'plans': [],
        }
        payload = server.professional_export_payload(
            'Dra. Nutri', 'nutri@example.test', {'fullName': 'Dra. Nutri'}, workspace
        )

        self.assertEqual(payload['format'], 'nutrion-export-v1')
        self.assertEqual(payload['professional']['email'], 'nutri@example.test')
        self.assertEqual(payload['workspace'], workspace)
        self.assertNotIn('password', payload)
        self.assertNotIn('sessions', payload)
        self.assertNotIn('accessCode', payload)
        self.assertIn('exportedAt', payload)


if __name__ == '__main__':
    unittest.main()
