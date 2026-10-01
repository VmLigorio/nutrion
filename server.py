#!/usr/bin/env python3
"""Servidor local do MVP Nutrion. Execute: python3 server.py"""
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import sqlite3
import time
from datetime import date, datetime, timezone
from threading import BoundedSemaphore, Lock
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, urlsplit

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('NUTRION_DB', ROOT / 'data' / 'nutrion.sqlite3'))
HOST = os.environ.get('NUTRION_HOST', '127.0.0.1')
PORT = int(os.environ.get('NUTRION_PORT', '8765'))
SESSION_SECONDS = 60 * 60 * 12
INVITE_SECONDS = 60 * 60 * 48
MAX_BODY = 2_000_000
STATIC = {
    '/login.html': ('login.html', 'text/html; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/portal.html': ('portal.html', 'text/html; charset=utf-8'),
    '/invite.html': ('invite.html', 'text/html; charset=utf-8'),
    '/styles.css': ('styles.css', 'text/css; charset=utf-8'),
    '/auth.css': ('auth.css', 'text/css; charset=utf-8'),
    '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
    '/plans.js': ('plans.js', 'text/javascript; charset=utf-8'),
    '/mvp.js': ('mvp.js', 'text/javascript; charset=utf-8'),
    '/auth.js': ('auth.js', 'text/javascript; charset=utf-8'),
    '/portal.js': ('portal.js', 'text/javascript; charset=utf-8'),
    '/outputs/nutrion-brasao-transparente.png': ('outputs/nutrion-brasao-transparente.png', 'image/png'),
}
LOGIN_ATTEMPTS = {}
LOGIN_IP_ATTEMPTS = {}
ATTEMPTS_LOCK = Lock()
LOGIN_WINDOW_SECONDS = 900
LOGIN_ACCOUNT_LIMIT = 10
LOGIN_IP_LIMIT = 40
MAX_LOGIN_BUCKETS = 4096

def now():
    return int(time.time())

def is_loopback_host(host):
    if str(host).lower() == 'localhost':
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False

def allow_auth_attempt(address, key, current=None):
    current = now() if current is None else current
    cutoff = current - LOGIN_WINDOW_SECONDS
    bucket = (str(address), str(key)[:254].casefold())
    address = str(address)
    with ATTEMPTS_LOCK:
        for table in (LOGIN_ATTEMPTS, LOGIN_IP_ATTEMPTS):
            for saved_bucket, stamps in list(table.items()):
                recent = [stamp for stamp in stamps if stamp > cutoff]
                if recent:
                    table[saved_bucket] = recent
                else:
                    table.pop(saved_bucket, None)
        account_attempts = LOGIN_ATTEMPTS.get(bucket, [])
        ip_attempts = LOGIN_IP_ATTEMPTS.get(address, [])
        if len(account_attempts) >= LOGIN_ACCOUNT_LIMIT or len(ip_attempts) >= LOGIN_IP_LIMIT:
            return False
        if bucket not in LOGIN_ATTEMPTS and len(LOGIN_ATTEMPTS) >= MAX_LOGIN_BUCKETS:
            oldest = min(LOGIN_ATTEMPTS, key=lambda item: LOGIN_ATTEMPTS[item][-1])
            LOGIN_ATTEMPTS.pop(oldest, None)
        if address not in LOGIN_IP_ATTEMPTS and len(LOGIN_IP_ATTEMPTS) >= MAX_LOGIN_BUCKETS:
            oldest_address = min(LOGIN_IP_ATTEMPTS, key=lambda item: LOGIN_IP_ATTEMPTS[item][-1])
            LOGIN_IP_ATTEMPTS.pop(oldest_address, None)
        LOGIN_ATTEMPTS.setdefault(bucket, []).append(current)
        LOGIN_IP_ATTEMPTS.setdefault(address, []).append(current)
        return True

def clear_auth_attempts(address, key):
    with ATTEMPTS_LOCK:
        LOGIN_ATTEMPTS.pop((str(address), str(key)[:254].casefold()), None)

def connect():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('PRAGMA busy_timeout=10000')
    return con

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        DB_PATH.parent.chmod(0o700)
    except OSError:
        pass
    with connect() as con:
        con.execute('PRAGMA journal_mode=WAL')
        con.executescript('''
        CREATE TABLE IF NOT EXISTS professionals (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
          salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, subject_id INTEGER NOT NULL,
          csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workspaces (
          professional_id INTEGER PRIMARY KEY REFERENCES professionals(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS professional_profiles (
          professional_id INTEGER PRIMARY KEY REFERENCES professionals(id) ON DELETE CASCADE,
          data_json TEXT NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS patient_accounts (
          id INTEGER PRIMARY KEY, professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
          patient_id TEXT NOT NULL, access_code TEXT NOT NULL UNIQUE,
          salt TEXT, password_hash TEXT, invite_hash TEXT, invite_expires INTEGER,
          UNIQUE(professional_id, patient_id)
        );
        CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
        ''')
    if DB_PATH.exists():
        try:
            DB_PATH.chmod(0o600)
        except OSError:
            pass

def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 600_000, dklen=32)
    return salt.hex(), digest.hex()

def verify_password(password, salt, expected):
    if not salt or not expected:
        return False
    _, actual = hash_password(password, bytes.fromhex(salt))
    return hmac.compare_digest(actual, expected)

DUMMY_PASSWORD = secrets.token_urlsafe(32)
DUMMY_SALT = '00' * 16
DUMMY_PASSWORD_HASH = hashlib.pbkdf2_hmac('sha256', DUMMY_PASSWORD.encode('utf-8'), bytes.fromhex(DUMMY_SALT), 600_000, dklen=32).hex()

def verify_login_password(password, account):
    if account is not None and account['salt'] and account['password_hash']:
        return verify_password(password, account['salt'], account['password_hash'])
    verify_password(password, DUMMY_SALT, DUMMY_PASSWORD_HASH)
    return False

def token_hash(token):
    return hashlib.sha256(token.encode('ascii')).hexdigest()

def valid_password(value):
    return (
        isinstance(value, str)
        and 8 <= len(value) <= 256
        and any(char.isupper() for char in value)
        and any(char.isdigit() for char in value)
        and any(not char.isalnum() and not char.isspace() for char in value)
    )

def validate_workspace(data):
    if not isinstance(data, dict) or set(data) != {'patients', 'consultations', 'appointments', 'plans'}:
        raise ValueError('Estrutura do espaço inválida.')
    for key in data:
        if not isinstance(data[key], list) or len(data[key]) > 5000:
            raise ValueError('Lista de registros inválida.')
    patient_ids = set()
    for patient in data['patients']:
        if not isinstance(patient, dict) or not isinstance(patient.get('id'), (int, str)) or not isinstance(patient.get('name'), str) or not patient['name'].strip() or len(patient['name']) > 150:
            raise ValueError('Paciente inválido.')
        patient_ids.add(str(patient['id']))
    if len(patient_ids) != len(data['patients']):
        raise ValueError('Há identificadores de pacientes repetidos.')
    for group in ('consultations', 'appointments', 'plans'):
        for item in data[group]:
            if not isinstance(item, dict) or str(item.get('patientId')) not in patient_ids:
                raise ValueError(f'{group}: paciente inexistente.')
    for plan in data['plans']:
        versions = plan.get('versions')
        if not isinstance(versions, list) or len(versions) > 100:
            raise ValueError('Histórico de versões inválido.')
        if versions and not isinstance(plan.get('published'), dict):
            raise ValueError('Plano publicado inválido.')
    return True

def patient_portal_payload(data, patient_id, professional_name):
    patient_id = str(patient_id)
    patient = next((item for item in data['patients'] if str(item.get('id')) == patient_id), None)
    if patient is None:
        return None
    plans = [
        {'id': plan['id'], 'title': plan['published']['title'], 'published': plan['published'],
         'version': plan['versions'][-1]['version'], 'publishedAt': plan['versions'][-1]['publishedAt']}
        for plan in data['plans']
        if str(plan.get('patientId')) == patient_id and plan.get('published') and plan.get('versions')
    ]
    appointments = [item for item in data['appointments'] if str(item.get('patientId')) == patient_id and item.get('status') != 'Cancelada']
    consultations = [item for item in data['consultations'] if str(item.get('patientId')) == patient_id]
    return {'patient': dict(patient), 'professional': professional_name, 'plans': plans,
            'appointments': appointments, 'consultations': consultations}


def remove_patient_records(data, patient_id):
    """Remove a patient and every workspace record associated with that patient."""
    patient_id = str(patient_id)
    if not any(str(patient.get('id')) == patient_id for patient in data['patients']):
        return False
    data['patients'] = [patient for patient in data['patients'] if str(patient.get('id')) != patient_id]
    for group in ('consultations', 'appointments', 'plans'):
        data[group] = [item for item in data[group] if str(item.get('patientId')) != patient_id]
    return True

PROFILE_TEXT_LIMITS = {
    'fullName': 150, 'phone': 40, 'crnNumber': 30, 'crnState': 2, 'crnStatus': 20,
    'courseName': 120, 'institution': 180, 'courseStart': 10, 'courseEnd': 10,
    'specialization': 180, 'additionalTraining': 2000, 'bio': 1200,
    'clinicName': 180, 'clinicAddress': 240, 'city': 100, 'state': 2,
    'instagram': 100, 'website': 200,
}
PROFILE_FIELDS = set(PROFILE_TEXT_LIMITS) | {'serviceModes'}
BRAZILIAN_STATES = {'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'}


def validate_professional_profile(data):
    if not isinstance(data, dict) or set(data) != PROFILE_FIELDS:
        raise ValueError('Estrutura do perfil profissional inválida.')
    clean = {}
    for key, limit in PROFILE_TEXT_LIMITS.items():
        value = data.get(key)
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError(f'Campo inválido no perfil: {key}.')
        clean[key] = value.strip()
    clean['fullName'] = clean['fullName'] or ''
    if not clean['fullName']:
        raise ValueError('Informe o nome profissional.')
    if clean['crnState'] and clean['crnState'] not in BRAZILIAN_STATES:
        raise ValueError('Selecione uma UF válida para o CRN.')
    if clean['crnStatus'] not in {'', 'regular', 'pending'}:
        raise ValueError('Selecione uma situação válida para o CRN.')
    if clean['crnStatus'] == 'regular' and (not clean['crnNumber'] or not clean['crnState']):
        raise ValueError('Informe o número e a UF do CRN para marcar o registro como regular.')
    if clean['state'] and clean['state'] not in BRAZILIAN_STATES:
        raise ValueError('Selecione uma UF válida para o endereço profissional.')
    modes = data.get('serviceModes')
    if not isinstance(modes, list) or len(modes) > 2 or any(mode not in {'presencial', 'online'} for mode in modes):
        raise ValueError('Selecione uma forma de atendimento válida.')
    clean['serviceModes'] = list(dict.fromkeys(modes))
    for key in ('courseStart', 'courseEnd'):
        if clean[key]:
            try:
                date.fromisoformat(clean[key])
            except ValueError as exc:
                raise ValueError('Informe datas válidas para o curso superior.') from exc
    if clean['courseStart'] and clean['courseEnd'] and clean['courseEnd'] < clean['courseStart']:
        raise ValueError('A data de conclusão não pode ser anterior ao início do curso.')
    return clean


def empty_professional_profile(full_name=''):
    profile = {key: '' for key in PROFILE_TEXT_LIMITS}
    profile.update({'fullName': full_name, 'serviceModes': []})
    return profile


def professional_export_payload(name, email, profile, workspace):
    """Build a portable export without authentication secrets or patient portal credentials."""
    return {
        'format': 'nutrion-export-v1',
        'exportedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'professional': {'name': name, 'email': email, 'profile': profile},
        'workspace': workspace,
    }

class Handler(BaseHTTPRequestHandler):
    server_version = 'Nutrion'
    sys_version = ''

    def version_string(self):
        return 'Nutrion'

    def log_message(self, fmt, *args):
        # Não registrar URL, token de convite, corpo ou credenciais.
        print('%s - %s' % (self.client_address[0], self.command))

    def headers_common(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")

    def json_response(self, status, payload, cookie=None):
        raw = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.headers_common()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(raw)

    def error(self, status, message):
        self.json_response(status, {'error': message})

    def redirect(self, location):
        self.send_response(HTTPStatus.SEE_OTHER)
        self.headers_common()
        self.send_header('Location', location)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def read_json(self):
        if self.headers.get_content_type() != 'application/json':
            raise ValueError('Envie dados em JSON.')
        size = int(self.headers.get('Content-Length', '0'))
        if size < 1 or size > MAX_BODY:
            raise ValueError('Tamanho da solicitação inválido.')
        try:
            return json.loads(self.rfile.read(size))
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
            raise ValueError('JSON inválido.') from exc

    def session(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
        except Exception:
            return None
        morsel = cookie.get('nutrion_session')
        if not morsel:
            return None
        with connect() as con:
            row = con.execute('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?', (token_hash(morsel.value), now())).fetchone()
        return dict(row) if row else None

    def require(self, role=None, csrf=False):
        session = self.session()
        if not session or (role and session['role'] != role):
            self.error(HTTPStatus.UNAUTHORIZED, 'Acesso não autorizado.')
            return None
        if csrf and not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), session['csrf']):
            self.error(HTTPStatus.FORBIDDEN, 'Sessão inválida. Atualize a página.')
            return None
        return session

    def same_origin(self):
        origin = self.headers.get('Origin')
        host = self.headers.get('Host', '')
        fetch_site = self.headers.get('Sec-Fetch-Site')
        try:
            parsed = urlsplit(origin or '')
            origin_ok = parsed.scheme in ('http', 'https') and parsed.netloc.casefold() == host.casefold() and not parsed.path and not parsed.query and not parsed.fragment
        except ValueError:
            origin_ok = False
        return origin_ok and fetch_site not in ('cross-site', 'same-site')

    def allow_login_attempt(self, key):
        return allow_auth_attempt(self.client_address[0], key)

    def clear_login_attempts(self, key):
        clear_auth_attempts(self.client_address[0], key)

    def session_cookie(self, token, expires=SESSION_SECONDS):
        secure = '; Secure' if self.external_scheme() == 'https' else ''
        return f'nutrion_session={token}; Path=/; Max-Age={expires}; HttpOnly; SameSite=Strict{secure}'

    def external_scheme(self):
        scheme = self.headers.get('X-Forwarded-Proto', 'http').split(',')[0].strip().lower()
        return scheme if scheme in ('http', 'https') else 'http'

    def create_session(self, role, subject_id):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        with connect() as con:
            con.execute('DELETE FROM sessions WHERE expires_at<=?', (now(),))
            con.execute('INSERT INTO sessions VALUES (?,?,?,?,?)', (token_hash(token), role, subject_id, csrf, now() + SESSION_SECONDS))
        return token, csrf

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/':
            session = self.session()
            return self.redirect('/index.html' if session and session['role'] == 'professional' else '/portal.html' if session else '/login.html')
        if path == '/api/me':
            session = self.session()
            if not session:
                return self.error(HTTPStatus.UNAUTHORIZED, 'Faça login para continuar.')
            with connect() as con:
                if session['role'] == 'professional':
                    row = con.execute('SELECT id,name,email FROM professionals WHERE id=?', (session['subject_id'],)).fetchone()
                else:
                    row = con.execute('SELECT id FROM patient_accounts WHERE id=?', (session['subject_id'],)).fetchone()
            if not row:
                return self.error(HTTPStatus.UNAUTHORIZED, 'Sessão inválida.')
            return self.json_response(200, {'role': session['role'], 'profile': dict(row), 'csrf': session['csrf']})
        if path == '/api/profile':
            session = self.require('professional')
            if not session: return
            with connect() as con:
                row = con.execute('''SELECT p.name,p.email,pp.data_json
                    FROM professionals p LEFT JOIN professional_profiles pp
                    ON pp.professional_id=p.id WHERE p.id=?''', (session['subject_id'],)).fetchone()
            if not row: return self.error(HTTPStatus.UNAUTHORIZED, 'Conta profissional não encontrada.')
            profile = empty_professional_profile(row['name'])
            if row['data_json']:
                profile.update(json.loads(row['data_json']))
            profile['fullName'] = row['name']
            profile['email'] = row['email']
            return self.json_response(200, {'profile': profile})
        if path == '/api/export':
            session = self.require('professional')
            if not session: return
            with connect() as con:
                account = con.execute('SELECT name,email FROM professionals WHERE id=?', (session['subject_id'],)).fetchone()
                workspace_row = con.execute('SELECT data_json FROM workspaces WHERE professional_id=?', (session['subject_id'],)).fetchone()
                profile_row = con.execute('SELECT data_json FROM professional_profiles WHERE professional_id=?', (session['subject_id'],)).fetchone()
            if not account or not workspace_row:
                return self.error(HTTPStatus.UNAUTHORIZED, 'Conta profissional não encontrada.')
            profile = empty_professional_profile(account['name'])
            if profile_row:
                profile.update(json.loads(profile_row['data_json']))
            profile['fullName'] = account['name']
            profile['email'] = account['email']
            payload = professional_export_payload(account['name'], account['email'], profile, json.loads(workspace_row['data_json']))
            raw = json.dumps(payload, ensure_ascii=False, indent=2).encode('utf-8')
            self.send_response(200)
            self.headers_common()
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename="nutrion-export.json"')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        if path == '/api/workspace':
            session = self.require('professional')
            if not session: return
            with connect() as con:
                row = con.execute('SELECT revision,data_json FROM workspaces WHERE professional_id=?', (session['subject_id'],)).fetchone()
            return self.json_response(200, {'revision': row['revision'], 'data': json.loads(row['data_json'])})
        if path == '/api/portal':
            session = self.require('patient')
            if not session: return
            with connect() as con:
                account = con.execute('SELECT professional_id,patient_id,access_code FROM patient_accounts WHERE id=?', (session['subject_id'],)).fetchone()
                if not account: return self.error(401, 'Conta não encontrada.')
                owner = con.execute('SELECT name FROM professionals WHERE id=?', (account['professional_id'],)).fetchone()
                workspace = con.execute('SELECT data_json FROM workspaces WHERE professional_id=?', (account['professional_id'],)).fetchone()
            data = json.loads(workspace['data_json'])
            payload = patient_portal_payload(data, account['patient_id'], owner['name'])
            if payload is None: return self.error(404, 'Paciente não encontrado.')
            return self.json_response(200, payload)
        if path in ('/index.html', '/portal.html'):
            session = self.session()
            role = 'professional' if path == '/index.html' else 'patient'
            if not session or session['role'] != role:
                return self.redirect('/login.html')
        item = STATIC.get(path)
        if not item:
            return self.error(404, 'Página não encontrada.')
        file_path = ROOT / item[0]
        if not file_path.is_file():
            return self.error(404, 'Arquivo não encontrado.')
        content = file_path.read_bytes()
        self.send_response(200)
        self.headers_common()
        self.send_header('Content-Type', item[1])
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        path = urlparse(self.path).path
        if not self.same_origin():
            return self.error(403, 'Origem não permitida.')
        try:
            body = self.read_json()
            if not isinstance(body, dict): raise ValueError('Dados inválidos.')
        except (ValueError, json.JSONDecodeError) as exc:
            return self.error(400, str(exc))
        if path == '/api/register':
            name = str(body.get('name', '')).strip()
            email = str(body.get('email', '')).strip().lower()
            password = body.get('password')
            if not name or len(name) > 150 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254 or not valid_password(password):
                return self.error(400, 'Informe nome, e-mail válido e senha com 8 caracteres ou mais, incluindo maiúscula, número e símbolo.')
            if not self.allow_login_attempt(f'register:{email}'):
                return self.error(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.')
            salt, password_hash = hash_password(password)
            try:
                with connect() as con:
                    cur = con.execute('INSERT INTO professionals(name,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)', (name,email,salt,password_hash,now()))
                    con.execute('INSERT INTO workspaces(professional_id,data_json) VALUES (?,?)', (cur.lastrowid, json.dumps({'patients': [], 'consultations': [], 'appointments': [], 'plans': []})))
                    user_id = cur.lastrowid
            except sqlite3.IntegrityError:
                return self.error(409, 'Este e-mail já está cadastrado.')
            token, csrf = self.create_session('professional', user_id)
            return self.json_response(201, {'role': 'professional', 'csrf': csrf}, self.session_cookie(token))
        if path == '/api/login':
            email, password = str(body.get('email', '')).strip().lower(), body.get('password', '')
            if len(email) > 254 or not isinstance(password, str) or len(password) > 256: return self.error(400, 'Credenciais inválidas.')
            if not self.allow_login_attempt(email): return self.error(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.')
            with connect() as con:
                row = con.execute('SELECT * FROM professionals WHERE email=?', (email,)).fetchone()
            if not verify_login_password(password, row):
                return self.error(401, 'E-mail ou senha incorretos.')
            self.clear_login_attempts(email)
            token, csrf = self.create_session('professional', row['id'])
            return self.json_response(200, {'role': 'professional', 'csrf': csrf}, self.session_cookie(token))
        if path == '/api/patient/activate':
            token, password = str(body.get('token', '')), body.get('password')
            if len(token) > 128 or not re.fullmatch(r'[A-Za-z0-9_-]+', token) or not valid_password(password): return self.error(400, 'Convite ou senha inválidos.')
            with connect() as con:
                account = con.execute('SELECT * FROM patient_accounts WHERE invite_hash=? AND invite_expires>?', (token_hash(token), now())).fetchone()
                if not account: return self.error(400, 'Convite inválido ou expirado.')
                salt, password_hash = hash_password(password)
                con.execute('UPDATE patient_accounts SET salt=?,password_hash=?,invite_hash=NULL,invite_expires=NULL WHERE id=?', (salt,password_hash,account['id']))
            session_token, csrf = self.create_session('patient', account['id'])
            return self.json_response(200, {'accessCode': account['access_code'], 'csrf': csrf}, self.session_cookie(session_token))
        if path == '/api/patient/login':
            code, password = str(body.get('accessCode', '')).strip().upper(), body.get('password')
            if not re.fullmatch(r'NTR-[A-F0-9]{10}', code) or not isinstance(password, str) or len(password) > 256: return self.error(400, 'Credenciais inválidas.')
            if not self.allow_login_attempt(code): return self.error(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.')
            with connect() as con:
                account = con.execute('SELECT * FROM patient_accounts WHERE access_code=?', (code,)).fetchone()
            if not verify_login_password(password, account):
                return self.error(401, 'Código ou senha incorretos.')
            self.clear_login_attempts(code)
            token, csrf = self.create_session('patient', account['id'])
            return self.json_response(200, {'role': 'patient', 'csrf': csrf}, self.session_cookie(token))
        if path == '/api/logout':
            session = self.require(csrf=True)
            if not session: return
            with connect() as con:
                con.execute('DELETE FROM sessions WHERE token_hash=?', (session['token_hash'],))
            return self.json_response(200, {'ok': True}, self.session_cookie('', 0))
        if path == '/api/patient-invite':
            session = self.require('professional', csrf=True)
            if not session: return
            patient_id = str(body.get('patientId', ''))
            with connect() as con:
                workspace = con.execute('SELECT data_json FROM workspaces WHERE professional_id=?', (session['subject_id'],)).fetchone()
                patient = next((p for p in json.loads(workspace['data_json'])['patients'] if str(p['id']) == patient_id), None)
                if not patient: return self.error(404, 'Paciente não encontrado.')
                existing = con.execute('SELECT id,access_code FROM patient_accounts WHERE professional_id=? AND patient_id=?', (session['subject_id'],patient_id)).fetchone()
                token = secrets.token_urlsafe(32)
                if existing:
                    con.execute('UPDATE patient_accounts SET invite_hash=?,invite_expires=? WHERE id=?', (token_hash(token),now()+INVITE_SECONDS,existing['id']))
                    code = existing['access_code']
                else:
                    code = 'NTR-' + secrets.token_hex(5).upper()
                    con.execute('INSERT INTO patient_accounts(professional_id,patient_id,access_code,invite_hash,invite_expires) VALUES (?,?,?,?,?)', (session['subject_id'],patient_id,code,token_hash(token),now()+INVITE_SECONDS))
            host = self.headers.get('Host', f'{HOST}:{PORT}')
            return self.json_response(200, {'inviteUrl': f'{self.external_scheme()}://{host}/invite.html?token={token}', 'accessCode': code, 'expiresInHours': 48})
        return self.error(404, 'Rota não encontrada.')

    def do_PUT(self):
        path = urlparse(self.path).path
        if path not in ('/api/workspace', '/api/profile'): return self.error(404, 'Rota não encontrada.')
        if not self.same_origin(): return self.error(403, 'Origem não permitida.')
        session = self.require('professional', csrf=True)
        if not session: return
        if path == '/api/profile':
            try:
                body = self.read_json()
                profile = validate_professional_profile(body.get('profile'))
                raw = json.dumps(profile, ensure_ascii=False, separators=(',', ':'))
                if len(raw.encode('utf-8')) > 10_000: raise ValueError('O perfil excede o limite permitido.')
            except (ValueError, AttributeError, json.JSONDecodeError) as exc:
                return self.error(400, str(exc))
            with connect() as con:
                con.execute('UPDATE professionals SET name=? WHERE id=?', (profile['fullName'], session['subject_id']))
                con.execute('''INSERT INTO professional_profiles(professional_id,data_json,updated_at) VALUES (?,?,?)
                    ON CONFLICT(professional_id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at''',
                    (session['subject_id'], raw, now()))
            return self.json_response(200, {'ok': True, 'profile': profile})
        try:
            body = self.read_json()
            revision = body.get('revision')
            data = body.get('data')
            if not isinstance(revision, int): raise ValueError('Versão dos dados inválida.')
            validate_workspace(data)
            raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
            if len(raw.encode('utf-8')) > MAX_BODY: raise ValueError('Limite de dados excedido.')
        except (ValueError, AttributeError, json.JSONDecodeError) as exc:
            return self.error(400, str(exc))
        with connect() as con:
            cur = con.execute('UPDATE workspaces SET revision=revision+1,data_json=? WHERE professional_id=? AND revision=?', (raw,session['subject_id'],revision))
            if cur.rowcount != 1: return self.error(409, 'Os dados mudaram em outra janela. Atualize a página antes de salvar novamente.')
        return self.json_response(200, {'revision': revision + 1})

    def do_DELETE(self):
        path = urlparse(self.path).path
        match = re.fullmatch(r'/api/patients/([^/]+)', path)
        if not match:
            return self.error(404, 'Rota não encontrada.')
        if not self.same_origin():
            return self.error(403, 'Origem não permitida.')
        session = self.require('professional', csrf=True)
        if not session: return
        patient_id = match.group(1)
        with connect() as con:
            row = con.execute('SELECT revision,data_json FROM workspaces WHERE professional_id=?', (session['subject_id'],)).fetchone()
            if not row:
                return self.error(404, 'Espaço profissional não encontrado.')
            data = json.loads(row['data_json'])
            if not remove_patient_records(data, patient_id):
                return self.error(404, 'Paciente não encontrado.')
            validate_workspace(data)
            raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
            con.execute('UPDATE workspaces SET revision=revision+1,data_json=? WHERE professional_id=?', (raw, session['subject_id']))
            accounts = con.execute('SELECT id FROM patient_accounts WHERE professional_id=? AND patient_id=?', (session['subject_id'], patient_id)).fetchall()
            account_ids = [account['id'] for account in accounts]
            if account_ids:
                placeholders = ','.join('?' for _ in account_ids)
                con.execute(f"DELETE FROM sessions WHERE role='patient' AND subject_id IN ({placeholders})", account_ids)
                con.execute('DELETE FROM patient_accounts WHERE professional_id=? AND patient_id=?', (session['subject_id'], patient_id))
            revision = row['revision'] + 1
        return self.json_response(200, {'ok': True, 'revision': revision})

class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 32

    def __init__(self, address, handler):
        self.request_slots = BoundedSemaphore(32)
        super().__init__(address, handler)

    def get_request(self):
        request, address = super().get_request()
        request.settimeout(15)
        return request, address

    def process_request(self, request, client_address):
        if not self.request_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.request_slots.release()

if __name__ == '__main__':
    if not is_loopback_host(HOST) and os.environ.get('NUTRION_ALLOW_NETWORK') != '1':
        raise SystemExit('Por segurança, o Nutrion aceita conexões locais por padrão. Para permitir conexões de rede, defina NUTRION_ALLOW_NETWORK=1 sabendo que o servidor usa HTTP e não é adequado para dados reais de saúde.')
    init_db()
    print(f'Nutrion disponível em http://{HOST}:{PORT}')
    BoundedThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
