#!/usr/bin/env python3
"""Ferramentas locais para backup e restauração do banco Nutrion."""
import argparse
from datetime import datetime
import os
from pathlib import Path
import secrets
import sqlite3
import sys

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('NUTRION_DB', ROOT / 'data' / 'nutrion.sqlite3'))
BACKUP_DIR = Path(os.environ.get('NUTRION_BACKUP_DIR', ROOT / 'data' / 'backups'))
REQUIRED_TABLES = {'professionals', 'sessions', 'workspaces', 'patient_accounts'}


def private_directory(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        path.chmod(0o700)
    except OSError:
        pass


def validate_database(path):
    if not path.is_file():
        raise ValueError(f'Arquivo não encontrado: {path}')
    try:
        with sqlite3.connect(f'file:{path.resolve()}?mode=ro', uri=True, timeout=10) as con:
            result = con.execute('PRAGMA integrity_check').fetchone()
            if not result or result[0] != 'ok':
                raise ValueError('A verificação de integridade do banco falhou.')
            tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not REQUIRED_TABLES.issubset(tables):
                raise ValueError('O arquivo não contém as tabelas esperadas do Nutrion.')
    except sqlite3.DatabaseError as exc:
        raise ValueError('O arquivo não é um banco SQLite válido.') from exc


def snapshot(source_path, destination_path):
    """Cria um snapshot SQLite consistente, inclusive quando o banco usa WAL."""
    private_directory(destination_path.parent)
    temp_path = destination_path.with_name(f'.{destination_path.name}.{secrets.token_hex(6)}.tmp')
    try:
        with sqlite3.connect(source_path, timeout=10) as source, sqlite3.connect(temp_path) as destination:
            source.backup(destination)
        validate_database(temp_path)
        try:
            temp_path.chmod(0o600)
        except OSError:
            pass
        os.replace(temp_path, destination_path)
        try:
            destination_path.chmod(0o600)
        except OSError:
            pass
    finally:
        if temp_path.exists():
            temp_path.unlink()


def timestamped_path(label='backup'):
    stamp = datetime.now().astimezone().strftime('%Y%m%d-%H%M%S-%z')
    return BACKUP_DIR / f'nutrion-{label}-{stamp}-{secrets.token_hex(3)}.sqlite3'


def create_backup(label='backup'):
    if not DB_PATH.is_file():
        raise ValueError(f'Banco Nutrion não encontrado: {DB_PATH}')
    target = timestamped_path(label)
    snapshot(DB_PATH, target)
    return target


def restore(source_path):
    source_path = Path(source_path).expanduser().resolve()
    target_path = DB_PATH.resolve()
    if source_path == target_path:
        raise ValueError('Escolha um arquivo de backup diferente do banco em uso.')
    validate_database(source_path)
    if not target_path.is_file():
        raise ValueError(f'Banco Nutrion não encontrado: {target_path}')

    wal_path = Path(f'{target_path}-wal')
    shm_path = Path(f'{target_path}-shm')
    if wal_path.exists() and wal_path.stat().st_size:
        raise ValueError('Há alterações SQLite pendentes. Encerre o servidor Nutrion e tente novamente.')
    if shm_path.exists() and shm_path.stat().st_size:
        raise ValueError('O banco ainda parece estar em uso. Encerre o servidor Nutrion e tente novamente.')

    # Criar primeiro um ponto de retorno reduz o risco caso o arquivo selecionado
    # esteja válido, mas contenha dados inesperados para este ambiente.
    safety_copy = create_backup('antes-da-restauracao')
    private_directory(target_path.parent)
    temp_path = target_path.with_name(f'.{target_path.name}.{secrets.token_hex(6)}.restore')
    try:
        snapshot(source_path, temp_path)
        # A troca do arquivo principal só é segura com o servidor Nutrion parado.
        os.replace(temp_path, target_path)
        try:
            target_path.chmod(0o600)
        except OSError:
            pass
        return safety_copy
    finally:
        if temp_path.exists():
            temp_path.unlink()


def main():
    parser = argparse.ArgumentParser(description='Crie ou restaure uma cópia local do banco Nutrion.')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('backup', help='Criar uma cópia de segurança com data e hora.')
    restore_parser = commands.add_parser('restore', help='Restaurar um arquivo SQLite validado.')
    restore_parser.add_argument('arquivo', help='Caminho para o arquivo de backup .sqlite3')
    args = parser.parse_args()
    try:
        if args.command == 'backup':
            print(f'Backup criado: {create_backup()}')
        else:
            recovery = restore(args.arquivo)
            print(f'Banco restaurado. Cópia do estado anterior: {recovery}')
    except (OSError, sqlite3.Error, ValueError) as exc:
        print(f'Erro: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
