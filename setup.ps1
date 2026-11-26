# App Turnos - instalacion local (Windows)
# Uso:  powershell -ExecutionPolicy Bypass -File .\setup.ps1

# Los comandos nativos se validan con $LASTEXITCODE (Stop rompe con stderr en PowerShell 5.1)
$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    !!  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "    XX  $msg" -ForegroundColor Red; exit 1 }
function Has($cmd)  { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# 1. Requisitos ---------------------------------------------------------------
Step 'Verificando requisitos'

if (-not (Has 'node')) { Fail 'Node.js no esta instalado. Instala Node 24 LTS desde https://nodejs.org' }
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { Fail "Node $(node -v) es muy viejo. Se necesita Node 22 o superior (recomendado 24 LTS)." }
Ok "Node $(node -v)"

if (-not (Has 'pnpm')) {
  Warn 'pnpm no encontrado, instalando con npm...'
  npm install -g pnpm@10 | Out-Null
  if (-not (Has 'pnpm')) { Fail 'No se pudo instalar pnpm. Ejecuta: npm install -g pnpm@10' }
}
Ok "pnpm $(pnpm -v)"

if (-not (Has 'docker')) { Fail 'Docker no esta instalado. Instala Docker Desktop: https://www.docker.com/products/docker-desktop' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker esta instalado pero no corriendo. Abri Docker Desktop y volve a ejecutar el script.' }
Ok 'Docker corriendo'

$hasGit = Has 'git'
if ($hasGit) { Ok "$(git --version)" } else { Warn 'Git no esta instalado: se omite el commit inicial (https://git-scm.com)' }

# 2. Variables de entorno -----------------------------------------------------
Step 'Archivos de entorno'
if (-not (Test-Path 'apps/api/.env'))      { Copy-Item 'apps/api/.env.example' 'apps/api/.env';      Ok 'apps/api/.env creado' }      else { Ok 'apps/api/.env ya existe' }
if (-not (Test-Path 'apps/web/.env.local')) { Copy-Item 'apps/web/.env.example' 'apps/web/.env.local'; Ok 'apps/web/.env.local creado' } else { Ok 'apps/web/.env.local ya existe' }

# 3. Dependencias -------------------------------------------------------------
Step 'Instalando dependencias (pnpm install)'
pnpm install
if ($LASTEXITCODE -ne 0) { Fail 'pnpm install fallo' }
Ok 'Dependencias instaladas y cliente de Prisma generado'

# 4. PostgreSQL ---------------------------------------------------------------
Step 'Levantando PostgreSQL (Docker)'
docker compose up -d
if ($LASTEXITCODE -ne 0) { Fail 'docker compose up fallo. Si el puerto 5433 esta ocupado, cambia el mapeo en docker-compose.yml' }

$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
  $state = docker inspect -f '{{.State.Health.Status}}' turnos-postgres 2>$null
  if ($state -eq 'healthy') { $healthy = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $healthy) { Fail 'PostgreSQL no quedo healthy en 60s. Revisa: docker compose logs postgres' }
Ok 'PostgreSQL listo en localhost:5433'

# 5. Migraciones --------------------------------------------------------------
Step 'Aplicando migraciones'
pnpm --filter api exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Fail 'prisma migrate deploy fallo' }
Ok 'Migraciones aplicadas'

Step 'Verificando que la base coincide con schema.prisma'
pnpm --filter api exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
switch ($LASTEXITCODE) {
  0       { Ok 'Base y schema sincronizados' }
  2       { Warn 'Hay diferencias entre la base y schema.prisma (ver arriba)' }
  default { Warn 'No se pudo ejecutar la verificacion de drift' }
}

$constraint = docker exec turnos-postgres psql -U turnos -d turnos -tAc "SELECT conname FROM pg_constraint WHERE conname = 'appointments_no_overlap'"
if ($constraint -match 'appointments_no_overlap') { Ok 'Constraint anti-solapamiento activa' } else { Warn 'No se encontro appointments_no_overlap' }

# 6. Tests y build ------------------------------------------------------------
Step 'Tests de la API'
pnpm --filter api test
if ($LASTEXITCODE -ne 0) { Fail 'Tests unitarios fallaron' }
pnpm --filter api test:e2e
if ($LASTEXITCODE -ne 0) { Fail 'Tests e2e fallaron' }
Ok 'Tests OK'

# 7. Git ----------------------------------------------------------------------
if ($hasGit) {
  Step 'Repositorio Git'
  if (-not (Test-Path '.git')) {
    git init -b main | Out-Null
    git add -A
    git commit -q -m "chore: etapa 1 - monorepo, prisma 7, postgres y health check"
    if ($LASTEXITCODE -eq 0) { Ok 'Repo inicializado con commit inicial en main' }
    else { Warn 'No se pudo commitear. Configura: git config --global user.name "Tu Nombre" y user.email, despues: git commit -m "chore: etapa 1"' }
  } else {
    Ok 'Ya existe un repo Git (no se modifica)'
  }
}

Write-Host "`nListo. Para arrancar:" -ForegroundColor Green
Write-Host '    pnpm dev'
Write-Host '    API:   http://localhost:3001/api/health'
Write-Host '    Panel: http://localhost:3000'
