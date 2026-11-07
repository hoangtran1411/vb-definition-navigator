<#
.SYNOPSIS
    Quickly registers the VB Definition Navigator MCP Server for AI Agents.
    Supports Antigravity, Claude Desktop, Cursor, and custom MCP clients.

.PARAMETER WorkspacePath
    The directory of the VB6, VBA, or VB.NET project you want the AI to index.
    Defaults to the current working directory.

.PARAMETER Client
    Target MCP client to configure: 'Antigravity', 'Claude', 'Cursor', 'All', or 'ExportOnly'.
    Default: 'Auto' (auto-detects existing installed clients).

.PARAMETER DryRun
    Displays the generated configuration without modifying any files.

.EXAMPLE
    .\register-mcp.ps1 -WorkspacePath "D:\Projects\LegacyVB"
    .\register-mcp.ps1 -Client Antigravity
    .\register-mcp.ps1 -DryRun
#>

[CmdletBinding()]
param(
    [string]$WorkspacePath = "",
    [ValidateSet("Auto", "Antigravity", "Claude", "Cursor", "All", "ExportOnly")]
    [string]$Client = "Auto",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " VB Definition Navigator - MCP Auto-Registration Utility " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Resolve paths
$scriptDir = $PSScriptRoot
$mcpServerScript = Join-Path $scriptDir "out\mcp\index.js"

if (-not (Test-Path $mcpServerScript)) {
    Write-Host "[!] MCP server script not found at: $mcpServerScript" -ForegroundColor Yellow
    Write-Host "[*] Compiling TypeScript project..." -ForegroundColor Gray
    npm run compile
    if (-not (Test-Path $mcpServerScript)) {
        Write-Error "Failed to compile MCP server script. Please run 'npm run compile' first."
        return
    }
}

# 2. Resolve Workspace Path
if ([string]::IsNullOrWhiteSpace($WorkspacePath)) {
    $WorkspacePath = (Get-Location).Path
} else {
    $WorkspacePath = (Resolve-Path $WorkspacePath).Path
}

# Normalize paths with forward slashes for JSON compatibility
$mcpScriptNormalized = ($mcpServerScript -replace '\\', '/')
$workspaceNormalized = ($WorkspacePath -replace '\\', '/')

$geminiToolPath = Join-Path $env:USERPROFILE ".gemini\tools\vb-navigator\index.js"
if (Test-Path $geminiToolPath) {
    $geminiScriptNormalized = ($geminiToolPath -replace '\\', '/')
} else {
    $geminiScriptNormalized = $mcpScriptNormalized
}

Write-Host "`n[*] Local Server : " -NoNewline -ForegroundColor Gray
Write-Host $mcpScriptNormalized -ForegroundColor Green
if (Test-Path $geminiToolPath) {
    Write-Host "[*] Gemini Tool  : " -NoNewline -ForegroundColor Gray
    Write-Host $geminiScriptNormalized -ForegroundColor Cyan
}
Write-Host "[*] Target VB Dir: " -NoNewline -ForegroundColor Gray
Write-Host $workspaceNormalized -ForegroundColor Green

# 3. Build MCP server configuration object
$serverConfig = [ordered]@{
    "command" = "node"
    "args" = @(
        $mcpScriptNormalized,
        $workspaceNormalized
    )
}

$geminiServerConfig = [ordered]@{
    "command" = "node"
    "args" = @(
        $geminiScriptNormalized,
        $workspaceNormalized
    )
}

# 4. Define known client configuration paths
$knownClients = @{
    "Antigravity" = Join-Path $env:USERPROFILE ".gemini\config\mcp_config.json"
    "Claude"      = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
    "Cursor"      = Join-Path $env:USERPROFILE ".cursor\mcp.json"
}

# 5. Helper function to update JSON config safely
function Update-McpConfig {
    param(
        [string]$ClientName,
        [string]$FilePath,
        [hashtable]$NewServerConfig
    )

    Write-Host "`n--> Configuring for $ClientName..." -ForegroundColor Yellow
    Write-Host "    Target file: $FilePath" -ForegroundColor Gray

    $parentDir = Split-Path $FilePath -Parent
    if (-not (Test-Path $parentDir)) {
        if (-not $DryRun) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }
    }

    $jsonObj = [ordered]@{}
    if (Test-Path $FilePath) {
        try {
            $content = Get-Content $FilePath -Raw -Encoding UTF8
            if (-not [string]::IsNullOrWhiteSpace($content)) {
                $jsonObj = $content | ConvertFrom-Json -AsHashtable
            }
        } catch {
            Write-Warning "Could not parse existing $FilePath. Creating fresh config."
            $jsonObj = [ordered]@{}
        }
    }

    if (-not $jsonObj.ContainsKey("mcpServers")) {
        $jsonObj["mcpServers"] = [ordered]@{}
    }

    # Inject or update vb-navigator entry
    $jsonObj["mcpServers"]["vb-navigator"] = $NewServerConfig

    $jsonText = $jsonObj | ConvertTo-Json -Depth 10

    if ($DryRun) {
        Write-Host "    [DRY RUN] Would write to $FilePath :" -ForegroundColor Magenta
        Write-Host $jsonText -ForegroundColor DarkGray
    } else {
        # Backup if exists
        if (Test-Path $FilePath) {
            Copy-Item $FilePath "$FilePath.bak" -Force
        }
        $jsonText | Set-Content $FilePath -Encoding UTF8
        Write-Host "    [SUCCESS] Registered 'vb-navigator' in $ClientName!" -ForegroundColor Green
    }
}

# 6. Apply configuration based on Client parameter
if ($Client -eq "ExportOnly") {
    Write-Host "`n[*] Exporting snippet only (no files modified)..." -ForegroundColor Yellow
} else {
    foreach ($entry in $knownClients.GetEnumerator()) {
        $clientName = $entry.Key
        $configPath = $entry.Value

        $shouldUpdate = $false
        if ($Client -eq "All") {
            $shouldUpdate = $true
        } elseif ($Client -eq "Auto") {
            # In Auto mode, update if client directory or config file already exists
            $clientDir = Split-Path $configPath -Parent
            if ((Test-Path $clientDir) -or (Test-Path $configPath)) {
                $shouldUpdate = $true
            }
        } elseif ($Client -eq $clientName) {
            $shouldUpdate = $true
        }

        if ($shouldUpdate) {
            $cfg = if ($clientName -eq "Antigravity") { $geminiServerConfig } else { $serverConfig }
            Update-McpConfig -ClientName $clientName -FilePath $configPath -NewServerConfig $cfg
        }
    }
}

# 7. Always generate a local snippet file for quick copy/pasting
$snippetPath = Join-Path $scriptDir "mcp-config.snippet.json"
$standaloneJson = [ordered]@{
    "mcpServers" = [ordered]@{
        "vb-navigator" = $serverConfig
    }
} | ConvertTo-Json -Depth 5

$standaloneJson | Set-Content $snippetPath -Encoding UTF8

Write-Host "`n----------------------------------------------------------" -ForegroundColor Gray
Write-Host " [OK] Configuration snippet saved to: $snippetPath" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor Gray
Write-Host $standaloneJson -ForegroundColor DarkYellow
Write-Host "`n[*] Quick Verification Test:" -ForegroundColor Cyan
Write-Host "    node out/mcp/index.js --vni `"Tie\u00e0n l\u00f6\u00f4ng`"" -ForegroundColor Gray
Write-Host "    node out/mcp/index.js --def CalculateSalary `"$workspaceNormalized`"" -ForegroundColor Gray
Write-Host "`n[+] Setup completed successfully!`n" -ForegroundColor Green
