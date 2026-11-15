$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $repoRoot 'node_modules\.bin\electron.cmd'
$tests = @(
  (Join-Path $repoRoot 'renderer\tests\login-background.electron.test.js'),
  (Join-Path $repoRoot 'renderer\tests\maintenance-layout.electron.test.js')
)

$additional = Get-ChildItem (Join-Path $PSScriptRoot 'e2e') -File -Filter '*.electron.test.js' -ErrorAction SilentlyContinue
if ($additional) { $tests += @($additional.FullName) }

$env:ELECTRON_RUN_AS_NODE = $null
foreach ($testFile in $tests) {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $profilePath = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ("qlqtbdxm-e2e-" + [Guid]::NewGuid().ToString('N'))))
  if (-not $profilePath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unsafe Electron test profile path: $profilePath"
  }

  [System.IO.Directory]::CreateDirectory($profilePath) | Out-Null
  try {
    $testOutput = @(& $electron "--user-data-dir=$profilePath" $testFile 2>&1)
    $testExitCode = $LASTEXITCODE
    $testOutput | ForEach-Object { Write-Output $_ }
    if ($testExitCode -ne 0) { exit $testExitCode }
    if (-not (($testOutput -join "`n") -match '(?m)^PASS\s')) {
      Write-Error "Electron test exited without an explicit PASS marker: $testFile"
      exit 1
    }
  } finally {
    if (Test-Path -LiteralPath $profilePath) {
      $resolvedProfile = [System.IO.Path]::GetFullPath($profilePath)
      if (-not $resolvedProfile.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing unsafe Electron test cleanup path: $resolvedProfile"
      }
      Remove-Item -LiteralPath $resolvedProfile -Recurse -Force
    }
  }
}
