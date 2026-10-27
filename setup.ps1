# Script de Configuração Rápida do EasyAgenda+ SaaS
# Execute este script após instalar o PostgreSQL.
# Cria um banco LOCAL, aplica as migrações do Prisma e gera backend\.env e frontend\.env.local.
# Se já existirem, os dois .env são copiados para .bak-<data> antes de serem substituídos.

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   CONFIGURACAO DO EASYAGENDA+ SAAS" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Configuracoes de conexao
$pgHost = "127.0.0.1"
$pgPort = "5432"
$pgUser = "postgres"
$pgDatabase = "postgres"
$projectDatabase = "easyagenda"

try {
    # 1. Verificar se PostgreSQL está instalado
    Write-Host "Verificando instalacao do PostgreSQL..." -ForegroundColor Cyan

    try {
        $pgVersion = & psql --version 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $pgVersion) {
            throw "psql nao encontrado"
        }
        Write-Host "PostgreSQL encontrado: $pgVersion" -ForegroundColor Green
    }
    catch {
        Write-Host "PostgreSQL NAO encontrado!" -ForegroundColor Red
        Read-Host "Instale o PostgreSQL e pressione ENTER"
        exit
    }

    # 2. Solicitar senha do PostgreSQL
    Write-Host ""
    Write-Host "Digite a senha do PostgreSQL (usuario postgres):" -ForegroundColor Cyan
    $pgPassword = Read-Host -AsSecureString

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword)
    try {
        $pgPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }

    if ([string]::IsNullOrWhiteSpace($pgPasswordText)) {
        Write-Host "Senha nao informada." -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    # 3. Testar conexão
    Write-Host ""
    Write-Host "Testando conexao..." -ForegroundColor Cyan
    $env:PGPASSWORD = $pgPasswordText

    $result = & psql -h $pgHost -p $pgPort -U $pgUser -d $pgDatabase -c "SELECT version();" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao conectar no PostgreSQL" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    Write-Host "Conexao OK!" -ForegroundColor Green

    # 4. Criar banco
    Write-Host ""
    Write-Host "Recriando banco $projectDatabase..." -ForegroundColor Cyan

    & psql -h $pgHost -p $pgPort -U $pgUser -d $pgDatabase -c "DROP DATABASE IF EXISTS $projectDatabase;" 2>&1 | Out-Null
    $result = & psql -h $pgHost -p $pgPort -U $pgUser -d $pgDatabase -c "CREATE DATABASE $projectDatabase;" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao criar banco" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    Write-Host "Banco criado com sucesso!" -ForegroundColor Green

    # 5. Aplicar o stub do Supabase e as migracoes do Prisma
    $stubFile = "backend/prisma/local/supabase-stub.sql"
    if (-not (Test-Path $stubFile)) {
        Write-Host "Arquivo nao encontrado: $stubFile" -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    Write-Host "Garantindo extensao pgcrypto..." -ForegroundColor Cyan
    $result = & psql -h $pgHost -p $pgPort -U $pgUser -d $projectDatabase -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao habilitar extensao pgcrypto" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    # Schemas, roles e funcoes do Supabase que as migracoes referenciam
    Write-Host "Aplicando supabase-stub.sql..." -ForegroundColor Cyan
    $result = & psql -h $pgHost -p $pgPort -U $pgUser -d $projectDatabase -v ON_ERROR_STOP=1 -f $stubFile 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao aplicar supabase-stub.sql" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    $escapedPassword = [Uri]::EscapeDataString($pgPasswordText)
    $databaseUrl = "postgresql://${pgUser}:${escapedPassword}@${pgHost}:${pgPort}/${projectDatabase}"

    if (-not (Test-Path "backend/node_modules")) {
        Write-Host "Instalando dependencias do backend..." -ForegroundColor Cyan
        Push-Location backend
        & npm install
        $npmExit = $LASTEXITCODE
        Pop-Location
        if ($npmExit -ne 0) {
            Write-Host "Erro no npm install do backend" -ForegroundColor Red
            Read-Host "Pressione ENTER para sair"
            exit
        }
    }

    Write-Host "Aplicando migracoes do Prisma..." -ForegroundColor Cyan
    $env:DATABASE_URL = $databaseUrl
    $env:DIRECT_URL = $databaseUrl
    Push-Location backend
    & npx prisma migrate deploy
    $migrateExit = $LASTEXITCODE
    Pop-Location
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue

    if ($migrateExit -ne 0) {
        Write-Host "Erro ao aplicar as migracoes do Prisma" -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    Write-Host "Schema e migracoes aplicados com sucesso!" -ForegroundColor Green

    # 6. Criar .env backend
    $envFile = "backend\.env"
    if (Test-Path $envFile) {
        $backupFile = "$envFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item $envFile $backupFile
        Write-Host "backend\.env existente copiado para $backupFile" -ForegroundColor Yellow
    }
    $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

    @"
PORT=5000
DATABASE_URL=$databaseUrl
DIRECT_URL=$databaseUrl
JWT_SECRET=$jwtSecret
NODE_ENV=development
LOG_LEVEL=info
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
BUSINESS_TIMEZONE=America/Sao_Paulo
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/callback
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="EasyAgenda+ <no-reply@easyagenda.local>"
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_BASICO=
STRIPE_PRICE_ID_PROFISSIONAL=
STRIPE_PRICE_ID_PREMIUM=
STRIPE_PRICE_ID_BASICO_ONE_TIME=
STRIPE_PRICE_ID_PROFISSIONAL_ONE_TIME=
STRIPE_PRICE_ID_PREMIUM_ONE_TIME=
ASAAS_API_KEY=
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=
ASAAS_BILLING_DESCRIPTION=EasyAgenda+ - Plano {plan} ({business})
ASAAS_TIMEOUT_MS=12000
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
BACKEND_WEBHOOK_BASE_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_AGENDA_REDIRECT_URI=http://localhost:5000/api/v1/google-agenda/callback
GOOGLE_TOKEN_KEY=
"@ | Out-File -FilePath $envFile -Encoding UTF8

    Write-Host ".env backend criado com sucesso!" -ForegroundColor Green

    # 7. Criar .env.local frontend
    $envLocalFile = "frontend\.env.local"
    if (Test-Path $envLocalFile) {
        $backupLocal = "$envLocalFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item $envLocalFile $backupLocal
        Write-Host "frontend\.env.local existente copiado para $backupLocal" -ForegroundColor Yellow
    }
    @"
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
BACKEND_ORIGIN=http://localhost:5000
NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=
"@ | Out-File -FilePath $envLocalFile -Encoding UTF8

    Write-Host ".env.local frontend criado com sucesso!" -ForegroundColor Green

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "CONFIGURACAO CONCLUIDA!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Read-Host "Pressione ENTER para finalizar"