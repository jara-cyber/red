param([switch]$Sondear, [int]$Interfaz = 0)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Get-Command py -ErrorAction SilentlyContinue)) { throw 'Instala Python 3.11 o posterior desde python.org (incluye el lanzador py) y vuelve a abrir PowerShell.' }
$version = & py -3 -c "import sys; print(int(sys.version_info >= (3,11)))"
if ($version -ne '1') { throw 'Se requiere Python 3.11 o posterior.' }
if (!(Test-Path '.venv\Scripts\python.exe')) {
    & py -3 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno Python.' }
}
$agentArgs = @('agent.py')
if ($Sondear) { $agentArgs += '--probe' }
if ($Interfaz -gt 0) { $agentArgs += @('--interface', "$Interfaz") }
Write-Host 'Abre http://localhost:8765 y pega la clave que aparecerá a continuación.'
& '.\.venv\Scripts\python.exe' @agentArgs
if ($LASTEXITCODE -ne 0) { throw 'El agente se ha detenido con un error. Revisa el mensaje anterior.' }
