import sqlite3
import tempfile
import unittest
from pathlib import Path

import database_tools


def make_database(path, professional_name):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as con:
        con.executescript('''
            CREATE TABLE professionals (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE sessions (token_hash TEXT PRIMARY KEY);
            CREATE TABLE workspaces (professional_id INTEGER PRIMARY KEY, data_json TEXT);
            CREATE TABLE patient_accounts (id INTEGER PRIMARY KEY, patient_id TEXT);
        ''')
        con.execute('INSERT INTO professionals(name) VALUES (?)', (professional_name,))


class DatabaseToolsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.database = self.root / 'nutrion.sqlite3'
        self.backups = self.root / 'backups'
        make_database(self.database, 'Estado atual')
        self.original_db_path = database_tools.DB_PATH
        self.original_backup_dir = database_tools.BACKUP_DIR
        database_tools.DB_PATH = self.database
        database_tools.BACKUP_DIR = self.backups
        self.addCleanup(self.restore_globals)

    def restore_globals(self):
        database_tools.DB_PATH = self.original_db_path
        database_tools.BACKUP_DIR = self.original_backup_dir

    def professional_name(self, path):
        with sqlite3.connect(path) as con:
            return con.execute('SELECT name FROM professionals').fetchone()[0]

    def test_backup_is_valid_and_private(self):
        backup = database_tools.create_backup()
        database_tools.validate_database(backup)
        self.assertEqual(self.professional_name(backup), 'Estado atual')
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(backup.parent.stat().st_mode & 0o777, 0o700)

    def test_restore_keeps_recovery_copy(self):
        backup = self.backups / 'restore-point.sqlite3'
        make_database(backup, 'Estado do backup')
        recovery = database_tools.restore(backup)
        self.assertEqual(self.professional_name(self.database), 'Estado do backup')
        self.assertEqual(self.professional_name(recovery), 'Estado atual')

    def test_restore_rejects_invalid_database_without_changing_current(self):
        invalid = self.root / 'invalid.sqlite3'
        with sqlite3.connect(invalid) as con:
            con.execute('CREATE TABLE unrelated (id INTEGER)')
        with self.assertRaises(ValueError):
            database_tools.restore(invalid)
        self.assertEqual(self.professional_name(self.database), 'Estado atual')

    def test_restore_refuses_pending_wal(self):
        backup = self.backups / 'restore-point.sqlite3'
        make_database(backup, 'Estado do backup')
        Path(f'{self.database}-wal').write_bytes(b'pending data')
        with self.assertRaisesRegex(ValueError, 'Encerr[e|e]'):
            database_tools.restore(backup)
        self.assertEqual(self.professional_name(self.database), 'Estado atual')


if __name__ == '__main__':
    unittest.main()
