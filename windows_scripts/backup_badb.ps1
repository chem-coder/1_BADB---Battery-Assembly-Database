param(
  [string]$Database = "badb_app_v1",
  [string]$DbUser = "postgres",
  [string]$Host = "localhost",
  [int]$Port = 5432,
  [string]$BackupDir = "",
  [string]$PgDumpPath = "pg_dump",
  [int]$KeepDays = 30
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BackupDir)) {
  $BackupDir = Join-Path $PSScriptRoot "..\sql_backups"
}

$resolvedBackupDir = [System.IO.Path]::GetFullPath($BackupDir)
New-Item -ItemType Directory -Force -Path $resolvedBackupDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$backupFile = Join-Path $resolvedBackupDir "$timestamp-$Database-full.sql"

Write-Host "Starting backup..."
Write-Host "Database : $Database"
Write-Host "User     : $DbUser"
Write-Host "Host     : $Host"
Write-Host "Port     : $Port"
Write-Host "Output   : $backupFile"

$pgDumpArgs = @(
  "-h", $Host,
  "-p", $Port,
  "-U", $DbUser,
  "-d", $Database,
  "--encoding=UTF8",
  "--file", $backupFile
)

try {
  & $PgDumpPath @pgDumpArgs

  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump exited with code $LASTEXITCODE."
  }

  Write-Host "Backup completed successfully."

  if ($KeepDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    Get-ChildItem -Path $resolvedBackupDir -File -Filter "*-$Database-full.sql" |
      Where-Object { $_.LastWriteTime -lt $cutoff } |
      Remove-Item -Force
    Write-Host "Retention applied: removed backups older than $KeepDays days."
  }
}
catch {
  if (Test-Path $backupFile) {
    Remove-Item -Force $backupFile
  }
  Write-Error $_
  exit 1
}
