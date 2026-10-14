param(
  [string]$PidFile = "services/.run/inventory.pid"
)

Write-Host "======================================================================"
Write-Host "[stop-inventory] Yeu cau tat Inventory Service"
Write-Host "  - File PID: $PidFile"
Write-Host "======================================================================"

if (-not (Test-Path $PidFile)) {
  if (Test-Path "../../.run/inventory.pid") {
    $PidFile = "../../.run/inventory.pid"
  } elseif (Test-Path "../.run/inventory.pid") {
    $PidFile = "../.run/inventory.pid"
  } elseif (Test-Path ".run/inventory.pid") {
    $PidFile = ".run/inventory.pid"
  } else {
    Write-Host "[stop-inventory] LOI: Khong tim thay file PID tai '$PidFile'."
    Write-Host "Huong dan:"
    Write-Host "  Truyen duong dan: .\stop-inventory.ps1 -PidFile <duong-dan>"
    exit 1
  }
}

$procId = (Get-Content $PidFile).Trim()
if ([string]::IsNullOrWhiteSpace($procId)) {
  Write-Host "[stop-inventory] LOI: File PID rong."
  exit 1
}

Write-Host "[stop-inventory] Tim thay PID: $procId"

try {
  $p = Get-Process -Id $procId -ErrorAction Stop
  Stop-Process -Id $procId -Force
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  Write-Host "[stop-inventory] THANH CONG: Da tat tien trinh Inventory (PID $procId)."
  Write-Host "Luu y: Tien trinh se KHONG tu khoi dong lai. Bay gio co the chay 'npm run down'."
} catch {
  Write-Host "[stop-inventory] CANH BAO: Tien trinh voi PID $procId khong con ton tai."
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}
