$ErrorActionPreference = "Continue"
$log = "C:\projetos\GemTD-react\.dsh-restart-web.log"
function Log($m) { "$(Get-Date -Format o)  $m" | Add-Content -Path $log }
Log "=== dsh web restart orchestration started ==="

$oldPid = $null
$conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
if ($conn) { $oldPid = $conn[0].OwningProcess }
if (-not $oldPid) {
  $proc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*lib\bin.js*" -and $_.CommandLine -like "*web*" } | Select-Object -First 1
  if ($proc) { $oldPid = $proc.ProcessId }
}
Log "Discovered old dsh web PID: $oldPid"

if ($oldPid) {
  Log "Stopping old dsh web PID $oldPid"
  Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
} else { Log "No old dsh web process found on port 3080" }

$free = $false
for ($i = 0; $i -lt 30; $i++) {
  $conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
  if (-not $conn) { $free = $true; break }
  Start-Sleep -Seconds 1
}
Log "Port 3080 free? $free"

$node = "C:\Users\Administrator\AppData\Local\Author Software\nvm\installs\v26.9.0\node.exe"
$bin = "C:\Users\Administrator\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh\lib\bin.js"
$stdout = "C:\projetos\GemTD-react\.dsh-web.stdout.log"
$stderr = "C:\projetos\GemTD-react\.dsh-web.stderr.log"
Log "Launching new dsh web"
$p = Start-Process -FilePath $node -ArgumentList $bin,"web" -WorkingDirectory "C:\Users\Administrator\.dsh" -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
Log "New dsh web PID $($p.Id)"

$up = $false
$newPid = $null
for ($i = 0; $i -lt 90; $i++) {
  $conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
  if ($conn) { $up = $true; $newPid = $conn[0].OwningProcess; Log "Port 3080 listening by PID $newPid"; break }
  try { if ($p -and $p.HasExited) { Log "New dsh web exited early code=$($p.ExitCode)"; break } } catch {}
  Start-Sleep -Seconds 1
}
Log "Server up? $up newPid=$newPid"

try {
  $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3080" -UseBasicParsing -TimeoutSec 15
  Log "HTTP probe status $($resp.StatusCode)"
} catch { Log "HTTP probe error: $($_.Exception.Message)" }
Log "=== orchestration finished ==="
