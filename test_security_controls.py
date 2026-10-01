import unittest
from email.message import Message
from unittest.mock import patch

import server


class SecurityControlTests(unittest.TestCase):
    def setUp(self):
        with server.ATTEMPTS_LOCK:
            server.LOGIN_ATTEMPTS.clear()
            server.LOGIN_IP_ATTEMPTS.clear()

    def test_login_attempts_are_limited_per_account_and_per_ip(self):
        for _ in range(server.LOGIN_ACCOUNT_LIMIT):
            self.assertTrue(server.allow_auth_attempt('192.0.2.10', 'ana@example.test', current=1000))
        self.assertFalse(server.allow_auth_attempt('192.0.2.10', 'ana@example.test', current=1000))

        with server.ATTEMPTS_LOCK:
            server.LOGIN_ATTEMPTS.clear()
            server.LOGIN_IP_ATTEMPTS.clear()
        for attempt in range(server.LOGIN_IP_LIMIT):
            self.assertTrue(server.allow_auth_attempt('192.0.2.11', f'conta-{attempt}', current=1000))
        self.assertFalse(server.allow_auth_attempt('192.0.2.11', 'outra-conta', current=1000))

    def test_auth_attempt_tracking_expires_old_entries(self):
        for _ in range(server.LOGIN_ACCOUNT_LIMIT):
            server.allow_auth_attempt('192.0.2.12', 'ana@example.test', current=1000)
        self.assertTrue(server.allow_auth_attempt('192.0.2.12', 'ana@example.test', current=1000 + server.LOGIN_WINDOW_SECONDS + 1))

    def test_external_bind_requires_explicit_opt_in(self):
        self.assertTrue(server.is_loopback_host('127.0.0.1'))
        self.assertTrue(server.is_loopback_host('::1'))
        self.assertTrue(server.is_loopback_host('localhost'))
        self.assertFalse(server.is_loopback_host('0.0.0.0'))
        self.assertFalse(server.is_loopback_host('192.0.2.20'))

    def test_unknown_and_unactivated_accounts_use_dummy_password_work(self):
        with patch.object(server, 'verify_password', return_value=True) as verify:
            self.assertFalse(server.verify_login_password('a-password', None))
            verify.assert_called_once_with('a-password', server.DUMMY_SALT, server.DUMMY_PASSWORD_HASH)
            verify.reset_mock()
            self.assertFalse(server.verify_login_password('a-password', {'salt': None, 'password_hash': None}))
            verify.assert_called_once_with('a-password', server.DUMMY_SALT, server.DUMMY_PASSWORD_HASH)

    def test_write_origin_requires_matching_host_and_http_origin(self):
        handler = object.__new__(server.Handler)
        handler.headers = Message()
        handler.headers['Host'] = 'nutrion.example.test'
        handler.headers['Origin'] = 'https://nutrion.example.test'
        handler.headers['Sec-Fetch-Site'] = 'same-origin'
        self.assertTrue(handler.same_origin())
        handler.headers.replace_header('Origin', 'https://attacker.example.test')
        self.assertFalse(handler.same_origin())
        handler.headers.replace_header('Origin', 'null')
        self.assertFalse(handler.same_origin())
        del handler.headers['Origin']
        self.assertFalse(handler.same_origin())


if __name__ == '__main__':
    unittest.main()
