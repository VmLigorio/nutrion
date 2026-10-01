import unittest

import server


class ProfessionalProfileValidationTests(unittest.TestCase):
    def valid_profile(self):
        profile = server.empty_professional_profile('Dra. Ana Silva')
        profile.update({
            'phone': '(11) 99999-1234',
            'crnNumber': '12345',
            'crnState': 'SP',
            'crnStatus': 'regular',
            'courseName': 'Bacharelado em Nutrição',
            'institution': 'Universidade Exemplo',
            'courseStart': '2018-02-01',
            'courseEnd': '2022-12-15',
            'specialization': 'Nutrição clínica',
            'serviceModes': ['presencial', 'online'],
            'city': 'São Paulo',
            'state': 'SP',
        })
        return profile

    def test_accepts_complete_professional_profile(self):
        profile = server.validate_professional_profile(self.valid_profile())
        self.assertEqual(profile['fullName'], 'Dra. Ana Silva')
        self.assertEqual(profile['serviceModes'], ['presencial', 'online'])

    def test_requires_crn_number_and_state_when_marked_regular(self):
        profile = self.valid_profile()
        profile['crnNumber'] = ''
        with self.assertRaisesRegex(ValueError, 'número e a UF'):
            server.validate_professional_profile(profile)

    def test_rejects_course_end_before_start(self):
        profile = self.valid_profile()
        profile['courseEnd'] = '2017-12-15'
        with self.assertRaisesRegex(ValueError, 'anterior ao início'):
            server.validate_professional_profile(profile)

    def test_rejects_invalid_state_and_service_mode(self):
        profile = self.valid_profile()
        profile['state'] = 'XX'
        with self.assertRaisesRegex(ValueError, 'UF válida'):
            server.validate_professional_profile(profile)
        profile = self.valid_profile()
        profile['serviceModes'] = ['delivery']
        with self.assertRaisesRegex(ValueError, 'forma de atendimento'):
            server.validate_professional_profile(profile)


if __name__ == '__main__':
    unittest.main()
