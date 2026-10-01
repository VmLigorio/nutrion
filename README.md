<<<<<<< HEAD
# Nutrion

MVP local concluído para demonstração e validação: nutricionistas acompanham pacientes, consultas, agenda e planos alimentares. O portal do paciente permite visualizar o próprio perfil, medidas, histórico, agenda e planos publicados, sem editar os registros.

## Identidade visual

A marca usa o brasão Nutrion em `outputs/nutrion-brasao-transparente.png`, com `N` serifado, escudo bordô e folhagens laterais. O site mantém a paleta creme, areia, bordô e dourado.

## Iniciar

Requer Python 3.9 ou superior. Não há dependências externas.

1. Na pasta do projeto, execute `python3 server.py` (Windows: `py server.py`).
2. Acesse `http://127.0.0.1:8765`.
3. Crie uma conta profissional e entre no espaço Nutrion.

O servidor escuta somente no próprio computador por padrão. Para iniciar um bind de rede é necessário definir `NUTRION_ALLOW_NETWORK=1`; isso não adiciona HTTPS e não torna o app seguro para exposição pública. A base SQLite fica em `data/nutrion.sqlite3`, com permissões restritas ao usuário do sistema. Não abra `index.html` diretamente: use o endereço local do servidor para que login e salvamento funcionem.

## Backup e restauração local

Com o Nutrion em execução, crie um backup consistente do banco com `python3 database_tools.py backup` (Windows: `py database_tools.py backup`). A cópia é gravada em `data/backups` com acesso restrito ao usuário do sistema. Guarde também uma cópia em outro dispositivo protegido; o backup contém dados pessoais e não é criptografado.

Para restaurar, encerre primeiro o servidor, escolha um arquivo `.sqlite3` criado pelo Nutrion e execute `python3 database_tools.py restore caminho/para/backup.sqlite3`. O arquivo é validado antes da troca, e o banco atual é copiado para `data/backups` como ponto de recuperação. Depois, inicie novamente o servidor. A restauração substitui os dados atuais pelo conteúdo do backup escolhido.

## Fases e recursos entregues

- Conta profissional com senha de ao menos 8 caracteres, incluindo letra maiúscula, número e símbolo, além de sessão de navegador.
- Perfil profissional com telefone, CRN e UF, situação do registro, formação superior com datas de início/conclusão, especialização, cursos complementares e dados de atuação/atendimento.
- Dados separados por conta profissional e salvos após recarregar a página.
- Cadastro de pacientes com identificação, contato, objetivo, contexto de saúde, rotina, hábitos e medidas corporais/de costura.
- Situação do acompanhamento por paciente e indicadores da visão geral calculados a partir dos registros reais, sem contadores de demonstração.
- Histórico de consultas com notas, próximos passos, medidas e comparação descritiva por mês.
- Agenda com criação, filtro por data e cancelamento de consultas.
- Editor de planos com refeições, alimentos, porções, substituições, orientações, rascunhos e histórico de versões.
- Prévia e impressão de versões publicadas como PDF.
- Convite individual do paciente, ativação com senha e código de acesso.
- Portal do paciente com perfil, medidas, consultas e agenda associados à própria conta; não há edição pelo paciente e só são exibidos planos publicados.
- Layout adaptado para celular.
- Backup e restauração local do banco, com validação de integridade e cópia de recuperação antes da restauração.
- Exportação autenticada do perfil e dos registros em JSON, sem credenciais, sessões, convites ou códigos de acesso.
- Exclusão de paciente pela profissional, removendo os registros associados e revogando a conta e as sessões do portal.

## Auditoria e controles locais

Na revisão local foram adicionados limites de tentativas por conta e endereço de rede, verificação de origem nas gravações, hash de trabalho fictício para reduzir diferenças de tempo em logins inexistentes, limite de conexões simultâneas e tempo de leitura de requisições. As respostas também incluem política de segurança de conteúdo, proteção contra enquadramento e cache desativado para as páginas e APIs autenticadas. O bind externo exige uma confirmação explícita.

Esses controles reduzem riscos na demonstração local, mas não equivalem a uma revisão independente nem a uma configuração segura de produção.

## Limites deste MVP

Este é um ambiente local para demonstração e validação de fluxo, sem envio de e-mail, recuperação de senha, confirmação de e-mail, integração de pagamentos, backup automático, criptografia do banco em repouso ou hospedagem com HTTPS. Os convites são links de uso único que expiram em 48 horas; a nutricionista compartilha o link com o paciente. A profissional pode baixar uma cópia JSON dos seus dados pela aba Perfil; essa exportação contém dados pessoais e de saúde e deve ser armazenada com cuidado. O sistema não deve ser exposto à internet nem receber dados reais de saúde até completar revisão técnica independente e operacional de segurança, privacidade, backups, consentimento/base legal, retenção e atendimento aos direitos dos titulares.

Como os registros de saúde são dados pessoais sensíveis, comece com dados fictícios durante a validação. Consulte a [ANPD sobre dados sensíveis e direitos dos titulares](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-frequentes) e avalie com profissionais qualificados as obrigações aplicáveis ao serviço.

## Próxima etapa após o MVP local

Validar com nutricionistas e pacientes, definir os requisitos operacionais de privacidade, implementar HTTPS e recuperação de conta, estabelecer backups automáticos e protegidos, revisar controle de acesso e retenção, e só então preparar hospedagem com revisão de segurança independente.

## Princípios do produto

- A profissional controla o que é publicado para o paciente.
- Cada profissional acessa apenas os próprios registros.
- O portal do paciente mostra apenas planos publicados vinculados ao convite daquele paciente.
- O histórico publicado é preservado em versões.
- Medidas, relatos e comparações são registros contextuais; o sistema não formula diagnóstico nem recomenda condutas.
=======
# nutrion
>>>>>>> 1eba6882eb21467bd268675caed88a1b21215a7d
