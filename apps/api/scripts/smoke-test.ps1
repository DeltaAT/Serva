param(
  [string]$BaseUrl = "http://localhost:8787",
  [string]$EnvFile = "C:\Users\fampo\RustroverProjects\Serva\apps\api\.env"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  $line = Get-Content -Path $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) {
    throw "Missing $Key in $Path"
  }

  $raw = $line.Split("=", 2)[1].Trim()
  if ($raw.StartsWith('"') -and $raw.EndsWith('"')) {
    return $raw.Substring(1, $raw.Length - 2)
  }
  return $raw
}

function Add-Result {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Details
  )

  $script:Results += [PSCustomObject]@{
    name = $Name
    passed = $Passed
    details = $Details
  }
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [int]$ExpectedStatus,
    [string]$Token,
    [object]$Body,
    [string]$Accept
  )

  $headers = @{}
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }
  if ($Accept) {
    $headers["Accept"] = $Accept
  }

  $uri = "$BaseUrl$Path"
  if ($null -ne $Body) {
    $bodyJson = $Body | ConvertTo-Json -Depth 8
    try {
      $response = Invoke-WebRequest -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body $bodyJson -UseBasicParsing
      $status = [int]$response.StatusCode
      $text = [string]$response.Content
      $contentType = $response.Headers["Content-Type"]
    } catch {
      if (-not $_.Exception.Response) {
        throw
      }
      $response = $_.Exception.Response
      $status = [int]$response.StatusCode
      $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
      try {
        $text = $reader.ReadToEnd()
      } finally {
        $reader.Dispose()
      }
      $contentType = $response.Headers["Content-Type"]
    }

    $json = $null
    if ($text -and $contentType -like "application/json*") {
      try {
        $json = $text | ConvertFrom-Json
      } catch {
        $json = $null
      }
    }

    return [PSCustomObject]@{
      status = $status
      expected = $ExpectedStatus
      ok = ($status -eq $ExpectedStatus)
      headers = @{ "Content-Type" = $contentType }
      text = $text
      bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
      json = $json
    }
  }

  $headerFile = [System.IO.Path]::GetTempFileName()
  $bodyFile = [System.IO.Path]::GetTempFileName()
  try {
    $curlMethod = $Method.ToUpperInvariant()
    $curlArgs = @(
      "--silent",
      "--show-error",
      "--request", $curlMethod,
      "--url", $uri,
      "--output", $bodyFile,
      "--dump-header", $headerFile,
      "--write-out", "%{http_code}"
    )

    foreach ($entry in $headers.GetEnumerator()) {
      $curlArgs += @("--header", "$($entry.Key): $($entry.Value)")
    }

    $statusText = & curl.exe @curlArgs 2>&1
    if ($statusText -notmatch "^\d+$") {
      throw "curl failed for $Method ${uri}: $statusText"
    }

    $status = [int]$statusText
    $bytes = @()
    if (Test-Path $bodyFile) {
      $bytes = [System.IO.File]::ReadAllBytes($bodyFile)
    }

    $text = ""
    if ($bytes.Count -gt 0) {
      $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    }

    $rawHeaders = ""
    if (Test-Path $headerFile) {
      $rawHeaders = Get-Content -Path $headerFile -Raw
    }

    $contentType = $null
    if ($rawHeaders) {
      $matches = [regex]::Matches($rawHeaders, "(?im)^Content-Type:\s*(.+)$")
      if ($matches.Count -gt 0) {
        $contentType = $matches[$matches.Count - 1].Groups[1].Value.Trim()
      }
    }

    $json = $null
    if ($text -and ($contentType -like "application/json*")) {
      try {
        $json = $text | ConvertFrom-Json
      } catch {
        $json = $null
      }
    }

    return [PSCustomObject]@{
      status = $status
      expected = $ExpectedStatus
      ok = ($status -eq $ExpectedStatus)
      headers = @{ "Content-Type" = $contentType }
      text = $text
      bytes = $bytes
      json = $json
    }
  } finally {
    Remove-Item -Path $headerFile, $bodyFile -ErrorAction SilentlyContinue
  }
}

function Abort-Smoke {
  param([string]$Reason)
  throw [System.Exception]::new("ABORT_SMOKE:$Reason")
}

$Results = @()

$masterUsername = Get-EnvValue -Path $EnvFile -Key "MASTER_USERNAME"
$masterPassword = Get-EnvValue -Path $EnvFile -Key "MASTER_PASSWORD"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$eventName = "smoke-$stamp"
$eventPasscode = "sp-$stamp"
$adminUsername = "admin-$stamp"
$adminPassword = "adminpw-$stamp"
$waiterUsername = "waiter-$stamp"

try {
  $masterLogin = Invoke-Api -Method "Post" -Path "/auth/master/login" -ExpectedStatus 200 -Body @{
    username = $masterUsername
    password = $masterPassword
  }
  Add-Result -Name "Master-Login" -Passed $masterLogin.ok -Details "status=$($masterLogin.status)"
  if (-not $masterLogin.ok) { Abort-Smoke "Master login failed" }
  $masterToken = $masterLogin.json.accessToken

  $createEvent = Invoke-Api -Method "Post" -Path "/admin/events" -ExpectedStatus 201 -Token $masterToken -Body @{
    eventName = $eventName
    eventPasscode = $eventPasscode
    adminUsername = $adminUsername
    adminPassword = $adminPassword
  }
  Add-Result -Name "Event erstellen" -Passed $createEvent.ok -Details "status=$($createEvent.status)"
  if (-not $createEvent.ok) { Abort-Smoke "Event creation failed" }
  $eventId = [int]$createEvent.json.id

  $activateEvent = Invoke-Api -Method "Post" -Path "/admin/events/$eventId/activate" -ExpectedStatus 200 -Token $masterToken
  Add-Result -Name "Event aktivieren" -Passed $activateEvent.ok -Details "status=$($activateEvent.status), isActive=$($activateEvent.json.isActive)"

  $activeEvent = Invoke-Api -Method "Get" -Path "/admin/events/active" -ExpectedStatus 200 -Token $masterToken
  $activeCheck = $activeEvent.ok -and ([int]$activeEvent.json.id -eq $eventId) -and [bool]$activeEvent.json.isActive
  Add-Result -Name "Aktives Event prüfen" -Passed $activeCheck -Details "status=$($activeEvent.status), activeId=$($activeEvent.json.id)"

  $adminLogin = Invoke-Api -Method "Post" -Path "/auth/admin/login" -ExpectedStatus 200 -Body @{
    eventId = $eventId
    username = $adminUsername
    password = $adminPassword
  }
  Add-Result -Name "Admin-Login" -Passed $adminLogin.ok -Details "status=$($adminLogin.status)"
  if (-not $adminLogin.ok) { Abort-Smoke "Admin login failed" }
  $adminToken = $adminLogin.json.accessToken

  $guardNoToken = Invoke-Api -Method "Get" -Path "/tables" -ExpectedStatus 401
  Add-Result -Name "Guard ohne Token" -Passed $guardNoToken.ok -Details "status=$($guardNoToken.status)"

  $createWaiter = Invoke-Api -Method "Post" -Path "/users" -ExpectedStatus 201 -Token $adminToken -Body @{
    username = $waiterUsername
  }
  Add-Result -Name "Waiter-User erstellen" -Passed $createWaiter.ok -Details "status=$($createWaiter.status)"

  $waiterLogin = Invoke-Api -Method "Post" -Path "/auth/login" -ExpectedStatus 200 -Body @{
    username = $waiterUsername
    eventPasscode = $eventPasscode
  }
  Add-Result -Name "Waiter-Login (aktives Event)" -Passed $waiterLogin.ok -Details "status=$($waiterLogin.status)"
  if (-not $waiterLogin.ok) { Abort-Smoke "Waiter login failed" }
  $waiterToken = $waiterLogin.json.accessToken

$guardWaiterOnAdmin = Invoke-Api -Method "Post" -Path "/tables" -ExpectedStatus 403 -Token $waiterToken -Body @{
  name = "Forbidden"
}
Add-Result -Name "Guard Waiter auf Admin-Route" -Passed $guardWaiterOnAdmin.ok -Details "status=$($guardWaiterOnAdmin.status)"

$guardMasterOrders = Invoke-Api -Method "Get" -Path "/orders" -ExpectedStatus 403 -Token $masterToken
Add-Result -Name "Guard Master auf Orders" -Passed $guardMasterOrders.ok -Details "status=$($guardMasterOrders.status)"

  $printerCreate = Invoke-Api -Method "Post" -Path "/printers" -ExpectedStatus 201 -Token $adminToken -Body @{
    name = "SmokePrinter"
    ipAddress = "127.0.0.1"
    connectionDetails = "9100"
  }
  Add-Result -Name "Printer erstellen" -Passed $printerCreate.ok -Details "status=$($printerCreate.status)"
  if (-not $printerCreate.ok) { Abort-Smoke "Printer creation failed" }
  $printerId = [int]$printerCreate.json.id

$printerList = Invoke-Api -Method "Get" -Path "/printers" -ExpectedStatus 200 -Token $adminToken
Add-Result -Name "Printer auflisten" -Passed $printerList.ok -Details "status=$($printerList.status), count=$($printerList.json.printers.Count)"

$printerGet = Invoke-Api -Method "Get" -Path "/printers/$printerId" -ExpectedStatus 200 -Token $adminToken
Add-Result -Name "Printer per ID" -Passed $printerGet.ok -Details "status=$($printerGet.status)"

$printerPatch = Invoke-Api -Method "Patch" -Path "/printers/$printerId" -ExpectedStatus 200 -Token $adminToken -Body @{
  connectionDetails = "9100;smoke"
}
Add-Result -Name "Printer patch" -Passed $printerPatch.ok -Details "status=$($printerPatch.status)"

  $categoryCreate = Invoke-Api -Method "Post" -Path "/menu/categories" -ExpectedStatus 201 -Token $adminToken -Body @{
    name = "SmokeCategory"
    description = "smoke"
    printerId = $printerId
  }
  Add-Result -Name "Menue-Kategorie erstellen" -Passed $categoryCreate.ok -Details "status=$($categoryCreate.status)"
  if (-not $categoryCreate.ok) { Abort-Smoke "Category creation failed" }
  $categoryId = [int]$categoryCreate.json.id

  $menuItemCreate = Invoke-Api -Method "Post" -Path "/menu/items" -ExpectedStatus 201 -Token $adminToken -Body @{
    name = "SmokeItem"
    price = 4.5
    menuCategoryId = $categoryId
  }
  Add-Result -Name "Menue-Item erstellen" -Passed $menuItemCreate.ok -Details "status=$($menuItemCreate.status)"
  if (-not $menuItemCreate.ok) { Abort-Smoke "Menu item creation failed" }
  $menuItemId = [int]$menuItemCreate.json.id

$menuWaiterList = Invoke-Api -Method "Get" -Path "/menu/items?categoryId=$categoryId" -ExpectedStatus 200 -Token $waiterToken
Add-Result -Name "Menue-Items lesen (Waiter)" -Passed $menuWaiterList.ok -Details "status=$($menuWaiterList.status), count=$($menuWaiterList.json.items.Count)"

  $stockCreate = Invoke-Api -Method "Post" -Path "/stock/items" -ExpectedStatus 201 -Token $adminToken -Body @{
    name = "SmokeStock"
    quantity = 50
  }
  Add-Result -Name "Stock-Item erstellen" -Passed $stockCreate.ok -Details "status=$($stockCreate.status)"
  if (-not $stockCreate.ok) { Abort-Smoke "Stock creation failed" }
  $stockItemId = [int]$stockCreate.json.id

$stockPatch = Invoke-Api -Method "Patch" -Path "/stock/items/$stockItemId" -ExpectedStatus 200 -Token $adminToken -Body @{
  delta = -3
}
Add-Result -Name "Stock-Item patch" -Passed $stockPatch.ok -Details "status=$($stockPatch.status), quantity=$($stockPatch.json.quantity)"

$requirements = Invoke-Api -Method "Put" -Path "/menu/items/$menuItemId/stock-requirements" -ExpectedStatus 200 -Token $adminToken -Body @{
  requirements = @(
    @{
      stockItemId = $stockItemId
      quantityRequired = 2
    }
  )
}
Add-Result -Name "Stock-Requirements setzen" -Passed $requirements.ok -Details "status=$($requirements.status)"

  $tableCreate = Invoke-Api -Method "Post" -Path "/tables" -ExpectedStatus 201 -Token $adminToken -Body @{
    name = "A1"
    weight = 1
  }
  Add-Result -Name "Tisch erstellen" -Passed $tableCreate.ok -Details "status=$($tableCreate.status)"
  if (-not $tableCreate.ok) { Abort-Smoke "Table creation failed" }
  $tableId = [int]$tableCreate.json.id

$tableBulk = Invoke-Api -Method "Post" -Path "/tables/bulk" -ExpectedStatus 201 -Token $adminToken -Body @{
  rows = @("B")
  from = 1
  to = 2
}
Add-Result -Name "Tisch-Bulk erstellen" -Passed $tableBulk.ok -Details "status=$($tableBulk.status), created=$($tableBulk.json.tables.Count)"

$tablePatch = Invoke-Api -Method "Patch" -Path "/tables/$tableId" -ExpectedStatus 200 -Token $adminToken -Body @{
  isLocked = $false
}
Add-Result -Name "Tisch patch" -Passed $tablePatch.ok -Details "status=$($tablePatch.status)"

$tableList = Invoke-Api -Method "Get" -Path "/tables" -ExpectedStatus 200 -Token $waiterToken
Add-Result -Name "Tische lesen (Waiter)" -Passed $tableList.ok -Details "status=$($tableList.status), count=$($tableList.json.tables.Count)"

  $orderCreate = Invoke-Api -Method "Post" -Path "/orders" -ExpectedStatus 201 -Token $waiterToken -Body @{
    tableId = $tableId
    items = @(
      @{
        menuItemId = $menuItemId
        quantity = 1
      }
    )
  }
  Add-Result -Name "Order erstellen" -Passed $orderCreate.ok -Details "status=$($orderCreate.status)"
  if (-not $orderCreate.ok) { Abort-Smoke "Order creation failed" }
  $orderId = [int]$orderCreate.json.id

$orderList = Invoke-Api -Method "Get" -Path "/orders" -ExpectedStatus 200 -Token $waiterToken
Add-Result -Name "Orders lesen" -Passed $orderList.ok -Details "status=$($orderList.status), count=$($orderList.json.orders.Count)"

$orderGet = Invoke-Api -Method "Get" -Path "/orders/$orderId" -ExpectedStatus 200 -Token $waiterToken
Add-Result -Name "Order per ID" -Passed $orderGet.ok -Details "status=$($orderGet.status)"

$stockAfterOrder = Invoke-Api -Method "Get" -Path "/stock/items" -ExpectedStatus 200 -Token $adminToken
$orderedStock = $stockAfterOrder.json.items | Where-Object { $_.id -eq $stockItemId } | Select-Object -First 1
$stockLooksRight = $stockAfterOrder.ok -and ($orderedStock.quantity -eq 45)
Add-Result -Name "Stock nach Order plausibel" -Passed $stockLooksRight -Details "status=$($stockAfterOrder.status), quantity=$($orderedStock.quantity)"

$qrSvg = Invoke-Api -Method "Get" -Path "/tables/$tableId/qr" -ExpectedStatus 200 -Token $adminToken
$qrSvgOk = $qrSvg.ok -and ($qrSvg.headers["Content-Type"] -like "image/svg+xml*") -and ($qrSvg.text -match "<svg")
Add-Result -Name "QR-SVG Export" -Passed $qrSvgOk -Details "status=$($qrSvg.status), contentType=$($qrSvg.headers['Content-Type'])"

$qrPdf = Invoke-Api -Method "Get" -Path "/tables/qr.pdf" -ExpectedStatus 200 -Token $adminToken -Accept "application/pdf"
$pdfPrefix = ""
if ($qrPdf.text.Length -ge 5) {
  $pdfPrefix = $qrPdf.text.Substring(0,5)
}
$qrPdfOk = $qrPdf.ok -and ($qrPdf.headers["Content-Type"] -like "application/pdf*") -and ($pdfPrefix -eq "%PDF-")
Add-Result -Name "QR-PDF Export" -Passed $qrPdfOk -Details "status=$($qrPdf.status), contentType=$($qrPdf.headers['Content-Type']), prefix=$pdfPrefix"

$swagger = Invoke-Api -Method "Get" -Path "/documentation" -ExpectedStatus 200
$swaggerOk = $swagger.ok -and ($swagger.text -match "<html")
Add-Result -Name "Swagger-UI laden" -Passed $swaggerOk -Details "status=$($swagger.status)"

$deactivate = Invoke-Api -Method "Post" -Path "/admin/events/$eventId/deactivate" -ExpectedStatus 200 -Token $masterToken
Add-Result -Name "Event deaktivieren" -Passed $deactivate.ok -Details "status=$($deactivate.status), isActive=$($deactivate.json.isActive)"

$activeAfterDeactivate = Invoke-Api -Method "Get" -Path "/admin/events/active" -ExpectedStatus 409 -Token $masterToken
Add-Result -Name "Aktives Event nach Deaktivierung" -Passed $activeAfterDeactivate.ok -Details "status=$($activeAfterDeactivate.status)"

  $waiterLoginNoActive = Invoke-Api -Method "Post" -Path "/auth/login" -ExpectedStatus 409 -Body @{
    username = $waiterUsername
    eventPasscode = $eventPasscode
  }
  Add-Result -Name "Waiter-Login ohne aktives Event" -Passed $waiterLoginNoActive.ok -Details "status=$($waiterLoginNoActive.status)"
} catch {
  if ($_.Exception.Message -notlike "ABORT_SMOKE:*") {
    Add-Result -Name "Unerwarteter Laufzeitfehler" -Passed $false -Details $_.Exception.Message
  }
}

$failed = @($Results | Where-Object { -not $_.passed })
$passedCount = @($Results | Where-Object { $_.passed }).Count
$status = if ($failed.Count -eq 0) { "bereit" } else { "nicht bereit" }

$report = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString("s")
  baseUrl = $BaseUrl
  eventId = $eventId
  eventName = $eventName
  status = $status
  passed = $passedCount
  failed = $failed.Count
  checks = $Results
}

$report | ConvertTo-Json -Depth 8

if ($failed.Count -gt 0) {
  exit 1
}

