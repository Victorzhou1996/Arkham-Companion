param(
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeEnv = Join-Path $RootDir 'game\config\runtime.env'
$PortFile = Join-Path $RootDir 'game\config\ports.env'
$LanInfoFile = Join-Path $RootDir 'game\config\lan.env'
$LanHelper = Join-Path $RootDir 'Configure-ArkhamHorror-LAN.ps1'
$script:ResolvedWslDistro = $null

function Show-Info {
    param(
        [string]$Message,
        [string]$Title = 'Arkham Horror LCG',
        [System.Windows.Forms.IWin32Window]$Owner = $null
    )

    if ($null -ne $Owner) {
        [System.Windows.Forms.MessageBox]::Show(
            $Owner,
            $Message,
            $Title,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        return
    }

    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
}

function Show-ErrorDialog {
    param(
        [string]$Message,
        [string]$Title = 'Arkham Horror LCG - 错误',
        [System.Windows.Forms.IWin32Window]$Owner = $null
    )

    if ($null -ne $Owner) {
        [System.Windows.Forms.MessageBox]::Show(
            $Owner,
            $Message,
            $Title,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        return
    }

    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

function Confirm-Action([string]$Message, [string]$Title = 'Arkham Horror LCG') {
    $result = [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Question
    )
    return $result -eq [System.Windows.Forms.DialogResult]::Yes
}

function Get-WslDistroName {
    if ($script:ResolvedWslDistro) {
        return $script:ResolvedWslDistro
    }

    $candidates = New-Object System.Collections.Generic.List[string]
    if (Test-Path -LiteralPath $RuntimeEnv) {
        foreach ($line in Get-Content -LiteralPath $RuntimeEnv -Encoding UTF8) {
            if ($line -match '^ARKHAM_WSL_DISTRO=(.+)$') {
                $configured = $matches[1].Trim()
                if (-not [string]::IsNullOrWhiteSpace($configured)) {
                    $candidates.Add($configured)
                }
            }
        }
    }

    # Keep this order identical to Start-ArkhamHorror.bat. Otherwise a PC with
    # multiple Ubuntu distributions can start the game in one distro while the
    # manager edits an unrelated database in another.
    foreach ($candidate in @('Ubuntu', 'Ubuntu-24.04', 'Ubuntu-22.04', 'Ubuntu-20.04', 'Ubuntu-18.04')) {
        if (-not $candidates.Contains($candidate)) {
            $candidates.Add($candidate)
        }
    }

    foreach ($candidate in $candidates) {
        & wsl.exe -d $candidate -- echo ok *> $null
        if ($LASTEXITCODE -eq 0) {
            $script:ResolvedWslDistro = $candidate
            return $candidate
        }
    }

    throw '未检测到可用的 WSL 运行时，请先运行 Start-ArkhamHorror.bat 完成环境准备。'
}

function Ensure-WslEnvironment {
    Get-Command wsl.exe -ErrorAction Stop | Out-Null

    $distro = Get-WslDistroName

    & wsl.exe -d $distro -- echo ok *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "$distro 不可用，请先运行 Start-ArkhamHorror.bat 完成环境准备。"
    }

    & wsl.exe -d $distro -u root -- id arkham *> $null
    if ($LASTEXITCODE -ne 0) {
        & wsl.exe -d $distro -u root -- useradd -m -s /bin/bash arkham *> $null
        if ($LASTEXITCODE -ne 0) {
            throw '创建 arkham 用户失败。'
        }
    }
}

function Convert-ToWslPath([string]$WindowsPath) {
    $resolved = [System.IO.Path]::GetFullPath($WindowsPath)
    if ($resolved -notmatch '^(?<drive>[A-Za-z]):\\(?<rest>.*)$') {
        throw "无法转换路径到 WSL: $WindowsPath"
    }

    $drive = $matches.drive.ToLowerInvariant()
    $rest = $matches.rest -replace '\\', '/'
    if ([string]::IsNullOrWhiteSpace($rest)) {
        return "/mnt/$drive"
    }

    return "/mnt/$drive/$rest"
}

function Quote-BashArg([string]$Value) {
    $singleQuote = [string][char]39
    $doubleQuote = [string][char]34
    $escapedQuote = $singleQuote + $doubleQuote + $singleQuote + $doubleQuote + $singleQuote
    return $singleQuote + $Value.Replace($singleQuote, $escapedQuote) + $singleQuote
}

function Invoke-StartSh {
    param(
        [string[]]$Arguments = @(),
        [switch]$CaptureOutput
    )

    Ensure-WslEnvironment
    $distro = Get-WslDistroName
    $wslRoot = Convert-ToWslPath $RootDir
    $quotedRoot = Quote-BashArg $wslRoot
    $quotedArgs = @('bash', 'start.sh') + $Arguments
    $command = 'cd ' + $quotedRoot + '/game && ' + (($quotedArgs | ForEach-Object { Quote-BashArg $_ }) -join ' ')

    if ($CaptureOutput) {
        $output = & wsl.exe -d $distro -u arkham -- bash -lc $command 2>&1
        return [pscustomobject]@{
            Output = @($output)
            ExitCode = $LASTEXITCODE
        }
    }

    & wsl.exe -d $distro -u arkham -- bash -lc $command
    if ($LASTEXITCODE -ne 0) {
        throw "命令执行失败，退出码: $LASTEXITCODE"
    }
}

function Get-StartShCommand {
    param(
        [string[]]$Arguments = @()
    )

    Ensure-WslEnvironment
    $wslRoot = Convert-ToWslPath $RootDir
    $quotedRoot = Quote-BashArg $wslRoot
    $quotedArgs = @('bash', 'start.sh') + $Arguments
    return 'cd ' + $quotedRoot + '/game && ' + (($quotedArgs | ForEach-Object { Quote-BashArg $_ }) -join ' ')
}

function Read-PortConfig {
    $ports = [ordered]@{
        ARKHAM_PORT = '4000'
        ARKHAM_API_PORT = '4002'
        ARKHAM_PG_PORT = '5433'
    }

    if (Test-Path $PortFile) {
        foreach ($line in Get-Content $PortFile -Encoding UTF8) {
            if ($line -match '^(ARKHAM_PORT|ARKHAM_API_PORT|ARKHAM_PG_PORT)=(.+)$') {
                $ports[$matches[1]] = $matches[2].Trim()
            }
        }
    }

    return $ports
}

function Save-FrontendPort([string]$FrontendPort) {
    $ports = Read-PortConfig
    $parsedPort = 0
    if (-not [int]::TryParse($FrontendPort, [ref]$parsedPort)) {
        throw '前端端口必须是数字。'
    }
    if ($parsedPort -lt 1024 -or $parsedPort -gt 65535) {
        throw '前端端口必须在 1024-65535 之间。'
    }
    $apiPort = 0
    $pgPort = 0
    [void][int]::TryParse($ports.ARKHAM_API_PORT, [ref]$apiPort)
    [void][int]::TryParse($ports.ARKHAM_PG_PORT, [ref]$pgPort)
    if (($apiPort -gt 0 -and $parsedPort -eq $apiPort) -or ($pgPort -gt 0 -and $parsedPort -eq $pgPort)) {
        throw "前端端口不能与内部服务端口冲突（API: $($ports.ARKHAM_API_PORT)，PostgreSQL: $($ports.ARKHAM_PG_PORT)）。"
    }
    if ($parsedPort -ne [int]$ports.ARKHAM_PORT) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $parsedPort -ErrorAction SilentlyContinue
        if ($listener) {
            throw "Windows 端口 $parsedPort 已被其他程序占用。"
        }
    }

    $portConfigLines = @(
        '# Arkham Horror LCG 本地离线包端口配置'
        '# 修改后重新启动服务即可生效。'
        ''
        "ARKHAM_PORT=$parsedPort"
        "ARKHAM_API_PORT=$($ports.ARKHAM_API_PORT)"
        "ARKHAM_PG_PORT=$($ports.ARKHAM_PG_PORT)"
    )

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($PortFile, $portConfigLines, $utf8NoBom)
}

function Show-TextInputDialog {
    param(
        [string]$Title,
        [string]$Prompt,
        [string]$DefaultValue = '',
        [switch]$Password
    )

    $form = New-Object System.Windows.Forms.Form
    $form.Text = $Title
    $form.StartPosition = 'CenterParent'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ClientSize = New-Object System.Drawing.Size(430, 150)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Prompt
    $label.AutoSize = $true
    $label.Location = New-Object System.Drawing.Point(16, 18)
    $form.Controls.Add($label)

    $textBox = New-Object System.Windows.Forms.TextBox
    $textBox.Text = $DefaultValue
    $textBox.UseSystemPasswordChar = $Password.IsPresent
    $textBox.Location = New-Object System.Drawing.Point(16, 52)
    $textBox.Size = New-Object System.Drawing.Size(394, 24)
    $form.Controls.Add($textBox)

    $okButton = New-Object System.Windows.Forms.Button
    $okButton.Text = '确定'
    $okButton.Location = New-Object System.Drawing.Point(244, 96)
    $okButton.Size = New-Object System.Drawing.Size(80, 30)
    $okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($okButton)

    $cancelButton = New-Object System.Windows.Forms.Button
    $cancelButton.Text = '取消'
    $cancelButton.Location = New-Object System.Drawing.Point(330, 96)
    $cancelButton.Size = New-Object System.Drawing.Size(80, 30)
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($cancelButton)

    $form.AcceptButton = $okButton
    $form.CancelButton = $cancelButton

    $result = $form.ShowDialog()
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        return $textBox.Text
    }

    return $null
}

function Invoke-UiTask {
    param(
        [System.Windows.Forms.Form]$Owner,
        [scriptblock]$Action
    )

    $previousCursor = $Owner.Cursor
    $Owner.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    $Owner.Enabled = $false
    [System.Windows.Forms.Application]::DoEvents()

    try {
        & $Action
    } catch {
        Show-ErrorDialog $_.Exception.Message
    } finally {
        $Owner.Enabled = $true
        $Owner.Cursor = $previousCursor
        [System.Windows.Forms.Application]::DoEvents()
    }
}

function Invoke-UiTaskWithProgress {
    param(
        [System.Windows.Forms.Form]$Owner,
        [string]$Title,
        [string]$Message,
        [scriptblock]$Action
    )

    $progressForm = New-Object System.Windows.Forms.Form
    $progressForm.Text = $Title
    $progressForm.StartPosition = 'CenterParent'
    $progressForm.FormBorderStyle = 'FixedDialog'
    $progressForm.ControlBox = $false
    $progressForm.MaximizeBox = $false
    $progressForm.MinimizeBox = $false
    $progressForm.ClientSize = New-Object System.Drawing.Size(420, 130)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Message
    $label.AutoSize = $false
    $label.Location = New-Object System.Drawing.Point(16, 18)
    $label.Size = New-Object System.Drawing.Size(388, 32)
    $progressForm.Controls.Add($label)

    $progressBar = New-Object System.Windows.Forms.ProgressBar
    $progressBar.Location = New-Object System.Drawing.Point(16, 62)
    $progressBar.Size = New-Object System.Drawing.Size(388, 20)
    $progressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
    $progressBar.Minimum = 0
    $progressBar.Maximum = 100
    $progressBar.Value = 8
    $progressForm.Controls.Add($progressBar)

    $detailLabel = New-Object System.Windows.Forms.Label
    $detailLabel.Text = '请勿关闭窗口，任务完成后会自动返回。'
    $detailLabel.AutoSize = $true
    $detailLabel.Location = New-Object System.Drawing.Point(16, 94)
    $progressForm.Controls.Add($detailLabel)

    $worker = New-Object System.ComponentModel.BackgroundWorker
    $resultHolder = [pscustomobject]@{
        ErrorMessage = $null
    }

    $worker.WorkerReportsProgress = $false
    $worker.WorkerSupportsCancellation = $false
    $worker.add_DoWork({
        param($sender, $eventArgs)
        try {
            & $Action
        } catch {
            $resultHolder.ErrorMessage = $_.Exception.Message
        }
    })
    $worker.add_RunWorkerCompleted({
        param($sender, $eventArgs)
        $progressBar.Value = 100
        $progressForm.Close()
    })
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 180
    $timer.Add_Tick({
        if ($progressBar.Value -lt 92) {
            $progressBar.Value += 2
        }
    })
    $progressForm.add_Shown({
        $timer.Start()
        $worker.RunWorkerAsync()
    })

    $previousCursor = $Owner.Cursor
    $Owner.Enabled = $false
    $Owner.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    try {
        [void]$progressForm.ShowDialog($Owner)
    } finally {
        $timer.Stop()
        $timer.Dispose()
        $Owner.Enabled = $true
        $Owner.Cursor = $previousCursor
    }

    if ($resultHolder.ErrorMessage) {
        Show-ErrorDialog $resultHolder.ErrorMessage
    }
}

function Invoke-StartShWithStatusDialog {
    param(
        [System.Windows.Forms.Form]$Owner,
        [string]$Title,
        [string]$InitialMessage,
        [string[]]$Arguments = @(),
        [string]$SuccessMessage
    )

    $statusForm = New-Object System.Windows.Forms.Form
    $statusForm.Text = $Title
    $statusForm.StartPosition = 'CenterParent'
    $statusForm.FormBorderStyle = 'FixedDialog'
    $statusForm.ControlBox = $false
    $statusForm.MaximizeBox = $false
    $statusForm.MinimizeBox = $false
    $statusForm.ClientSize = New-Object System.Drawing.Size(560, 220)

    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = $InitialMessage
    $titleLabel.Location = New-Object System.Drawing.Point(16, 16)
    $titleLabel.Size = New-Object System.Drawing.Size(528, 36)
    $titleLabel.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Bold)
    $statusForm.Controls.Add($titleLabel)

    $progressBar = New-Object System.Windows.Forms.ProgressBar
    $progressBar.Location = New-Object System.Drawing.Point(16, 58)
    $progressBar.Size = New-Object System.Drawing.Size(528, 20)
    $progressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
    $progressBar.Minimum = 0
    $progressBar.Maximum = 100
    $progressBar.Value = 6
    $statusForm.Controls.Add($progressBar)

    $stageLabel = New-Object System.Windows.Forms.Label
    $stageLabel.Text = '准备开始...'
    $stageLabel.Location = New-Object System.Drawing.Point(16, 88)
    $stageLabel.Size = New-Object System.Drawing.Size(528, 20)
    $statusForm.Controls.Add($stageLabel)

    $logBox = New-Object System.Windows.Forms.TextBox
    $logBox.Location = New-Object System.Drawing.Point(16, 116)
    $logBox.Size = New-Object System.Drawing.Size(528, 58)
    $logBox.Multiline = $true
    $logBox.ReadOnly = $true
    $logBox.ScrollBars = 'Vertical'
    $logBox.BackColor = [System.Drawing.Color]::White
    $statusForm.Controls.Add($logBox)

    $resultLabel = New-Object System.Windows.Forms.Label
    $resultLabel.Text = ''
    $resultLabel.Location = New-Object System.Drawing.Point(16, 180)
    $resultLabel.Size = New-Object System.Drawing.Size(420, 24)
    $statusForm.Controls.Add($resultLabel)

    $closeButton = New-Object System.Windows.Forms.Button
    $closeButton.Text = '关闭'
    $closeButton.Location = New-Object System.Drawing.Point(468, 176)
    $closeButton.Size = New-Object System.Drawing.Size(76, 28)
    $closeButton.Enabled = $false
    $closeButton.Visible = $false
    $closeButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $statusForm.Controls.Add($closeButton)
    $statusForm.CancelButton = $closeButton
    $closeButton.Add_Click({
        $statusForm.Close()
    })

    $state = [ordered]@{
        Lines = New-Object System.Collections.ArrayList
        LastStage = '准备开始...'
        ExitCode = $null
        StartedAt = [DateTime]::UtcNow
    }

    $stdoutFile = Join-Path $env:TEMP ('arkham-import-' + [guid]::NewGuid().ToString('N') + '.out.log')
    $stderrFile = Join-Path $env:TEMP ('arkham-import-' + [guid]::NewGuid().ToString('N') + '.err.log')

    $distro = Get-WslDistroName
    $command = Get-StartShCommand -Arguments $Arguments
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = 'wsl.exe'
    $escapedDistro = $distro.Replace('"', '\"')
    $escapedCommand = $command.Replace('"', '\"')
    $processInfo.Arguments = '-d "' + $escapedDistro + '" -u arkham -- bash -lc "' + $escapedCommand + '"'
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo

    $stdoutWriter = $null
    $stderrWriter = $null

    function Update-StatusSnapshot {
        param(
            [hashtable]$State,
            [System.Windows.Forms.Label]$StageLabel,
            [System.Windows.Forms.TextBox]$LogBox,
            [System.Windows.Forms.ProgressBar]$ProgressBar
        )

        $elapsed = [DateTime]::UtcNow - $State.StartedAt
        if ($elapsed.TotalSeconds -lt 2) {
            $State.LastStage = '正在停止现有服务...'
            if ($ProgressBar.Value -lt 18) { $ProgressBar.Value = 18 }
        } elseif ($elapsed.TotalSeconds -lt 5) {
            $State.LastStage = '正在准备数据库引擎...'
            if ($ProgressBar.Value -lt 38) { $ProgressBar.Value = 38 }
        } elseif ($elapsed.TotalSeconds -lt 8) {
            $State.LastStage = '正在重建数据库...'
            if ($ProgressBar.Value -lt 62) { $ProgressBar.Value = 62 }
        } else {
            $State.LastStage = '正在导入 SQL 存档，请稍候...'
            if ($ProgressBar.Value -lt 90) {
                $ProgressBar.Value = [Math]::Min(90, $ProgressBar.Value + 1)
            }
        }

        $StageLabel.Text = $State.LastStage
        $visibleLines = @($State.Lines | Select-Object -Last 6)
        $LogBox.Lines = $visibleLines
        $LogBox.SelectionStart = $LogBox.TextLength
        $LogBox.ScrollToCaret()
    }

    $Owner.Enabled = $false
    try {
        if (-not $process.Start()) {
            throw '无法启动导入进程。'
        }

        $stdoutWriter = [System.IO.StreamWriter]::new($stdoutFile, $false, [System.Text.UTF8Encoding]::new($false))
        $stderrWriter = [System.IO.StreamWriter]::new($stderrFile, $false, [System.Text.UTF8Encoding]::new($false))

        $outPump = [System.ComponentModel.BackgroundWorker]::new()
        $outPump.add_DoWork({
            while (-not $process.StandardOutput.EndOfStream) {
                $line = $process.StandardOutput.ReadLine()
                $stdoutWriter.WriteLine($line)
                $stdoutWriter.Flush()
            }
        })

        $errPump = [System.ComponentModel.BackgroundWorker]::new()
        $errPump.add_DoWork({
            while (-not $process.StandardError.EndOfStream) {
                $line = $process.StandardError.ReadLine()
                $stderrWriter.WriteLine($line)
                $stderrWriter.Flush()
            }
        })

        $outPump.RunWorkerAsync()
        $errPump.RunWorkerAsync()

        $statusForm.Show($Owner)
        while (-not $process.HasExited) {
            $combined = @()
            if (Test-Path $stdoutFile) { $combined += Get-Content -Path $stdoutFile -ErrorAction SilentlyContinue }
            if (Test-Path $stderrFile) { $combined += Get-Content -Path $stderrFile -ErrorAction SilentlyContinue }
            $state.Lines.Clear()
            foreach ($line in ($combined | Select-Object -Last 20)) {
                if (-not [string]::IsNullOrWhiteSpace($line)) {
                    [void]$state.Lines.Add($line)
                }
            }
            Update-StatusSnapshot -State $state -StageLabel $stageLabel -LogBox $logBox -ProgressBar $progressBar
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 250
        }

        $process.WaitForExit()
        $state.ExitCode = $process.ExitCode

        $combined = @()
        if (Test-Path $stdoutFile) { $combined += Get-Content -Path $stdoutFile -ErrorAction SilentlyContinue }
        if (Test-Path $stderrFile) { $combined += Get-Content -Path $stderrFile -ErrorAction SilentlyContinue }
        $state.Lines.Clear()
        foreach ($line in ($combined | Select-Object -Last 20)) {
            if (-not [string]::IsNullOrWhiteSpace($line)) {
                [void]$state.Lines.Add($line)
            }
        }

        $progressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Blocks
        $progressBar.Value = 100
        $closeButton.Enabled = $true
        $closeButton.Visible = $true
        $statusForm.ControlBox = $true

        if ($state.ExitCode -eq 0) {
            $titleLabel.Text = 'SQL 存档导入完成'
            $resultLabel.Text = '导入成功。请重新启动服务后再进入游戏。'
            $resultLabel.ForeColor = [System.Drawing.Color]::FromArgb(0, 128, 0)
            $stageLabel.Text = '导入完成，数据库已经写入。'
            if ($state.Lines.Count -eq 0) {
                [void]$state.Lines.Add('导入已完成。')
            }
        } else {
            $titleLabel.Text = 'SQL 存档导入失败'
            $resultLabel.Text = '导入失败。请查看上方最后几行日志。'
            $resultLabel.ForeColor = [System.Drawing.Color]::FromArgb(192, 0, 0)
        }

        $logBox.Lines = @($state.Lines | Select-Object -Last 6)
        while ($statusForm.Visible) {
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 100
        }
    } finally {
        if ($stdoutWriter) { $stdoutWriter.Dispose() }
        if ($stderrWriter) { $stderrWriter.Dispose() }
        if (Test-Path $stdoutFile) { Remove-Item -LiteralPath $stdoutFile -Force -ErrorAction SilentlyContinue }
        if (Test-Path $stderrFile) { Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue }
        if ($statusForm -and -not $statusForm.IsDisposed) { $statusForm.Close() }
        $Owner.Enabled = $true
    }

    if ($null -eq $state.ExitCode) {
        throw '导入进程状态未知，请查看日志。'
    }
    if ($state.ExitCode -ne 0) {
        return
    }
}

function Backup-SaveDialog([System.Windows.Forms.Form]$Owner) {
    $documentsDir = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)
    if ([string]::IsNullOrWhiteSpace($documentsDir)) {
        $documentsDir = $env:USERPROFILE
    }
    $backupDir = Join-Path $documentsDir 'Arkham Horror Local\Backups'
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }

    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Title = '选择备份文件保存位置'
    $dialog.Filter = 'Tar GZip (*.tar.gz)|*.tar.gz|所有文件 (*.*)|*.*'
    $dialog.InitialDirectory = $backupDir
    $dialog.FileName = 'arkham-save-{0}.tar.gz' -f (Get-Date -Format 'yyyyMMdd-HHmmss')

    if ($dialog.ShowDialog($Owner) -ne [System.Windows.Forms.DialogResult]::OK) {
        return
    }

    Invoke-UiTask -Owner $Owner -Action {
        Invoke-StartSh -Arguments @('--backup-save', (Convert-ToWslPath $dialog.FileName))
        Show-Info "备份完成：`r`n$($dialog.FileName)"
    }
}

function Restore-SaveDialog([System.Windows.Forms.Form]$Owner) {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = '选择要恢复的 tar.gz 备份'
    $dialog.Filter = 'Tar GZip (*.tar.gz)|*.tar.gz|所有文件 (*.*)|*.*'
    $dialog.CheckFileExists = $true

    if ($dialog.ShowDialog($Owner) -ne [System.Windows.Forms.DialogResult]::OK) {
        return
    }

    if (-not (Confirm-Action "恢复会覆盖当前存档。`r`n`r`n$($dialog.FileName)" '恢复存档')) {
        return
    }

    Invoke-UiTask -Owner $Owner -Action {
        Invoke-StartSh -Arguments @('--restore-save', (Convert-ToWslPath $dialog.FileName))
        Show-Info '存档恢复完成。'
    }
}

function Import-SqlDialog([System.Windows.Forms.Form]$Owner) {
    Show-Info -Owner $Owner -Message '可导入纯 .sql 或 PostgreSQL custom dump。若是程序内导出的 tar.gz，请使用“恢复存档”。'

    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = '选择 SQL 存档'
    $dialog.Filter = '数据库存档 (*.sql;*.dump;*.backup)|*.sql;*.dump;*.backup|SQL 文件 (*.sql)|*.sql|所有文件 (*.*)|*.*'
    $dialog.CheckFileExists = $true

    if ($dialog.ShowDialog($Owner) -ne [System.Windows.Forms.DialogResult]::OK) {
        return
    }

    Invoke-StartShWithStatusDialog -Owner $Owner -Title '导入 SQL 存档' -InitialMessage '正在导入 SQL 存档并重建数据库，请稍候...' -Arguments @('--import-sql', (Convert-ToWslPath $dialog.FileName)) -SuccessMessage "SQL 存档导入完成。`r`n`r`n详细日志：$RootDir\game\data\import-sql.log"
}

function Reset-SqlDialog([System.Windows.Forms.Form]$Owner) {
    $confirmation = Show-TextInputDialog -Title '清空当前 SQL 存档' -Prompt '此操作会清空账号、牌组和游戏。请输入 RESET 确认：'
    if ($confirmation -cne 'RESET') {
        return
    }

    Invoke-UiTask -Owner $Owner -Action {
        Invoke-StartSh -Arguments @('--reset-db')
        Show-Info '当前 SQL 存档已清空并重建为初始状态。'
    }
}

function Get-Accounts {
    $result = Invoke-StartSh -Arguments @('--list-accounts') -CaptureOutput
    if ($result.ExitCode -ne 0) {
        throw (($result.Output | Out-String).Trim())
    }

    $accounts = @()
    foreach ($line in $result.Output) {
        if ($line -match '^\d+\t') {
            $parts = $line -split "`t"
            if ($parts.Count -ge 5) {
                $flags = @()
                if ($parts[3] -eq 't' -or $parts[3] -eq 'true') { $flags += 'admin' }
                if ($parts[4] -eq 't' -or $parts[4] -eq 'true') { $flags += 'beta' }
                $accounts += [pscustomobject]@{
                    Id = [int64]$parts[0]
                    Username = $parts[1]
                    Email = $parts[2]
                    Admin = ($parts[3] -eq 't' -or $parts[3] -eq 'true')
                    Beta = ($parts[4] -eq 't' -or $parts[4] -eq 'true')
                    Flags = ($flags -join ', ')
                }
            }
        }
    }

    return $accounts
}

function Show-AccountsDialog([System.Windows.Forms.Form]$Owner) {
    $dialog = New-Object System.Windows.Forms.Form
    $dialog.Text = '本地账号管理'
    $dialog.StartPosition = 'CenterParent'
    $dialog.FormBorderStyle = 'FixedDialog'
    $dialog.ClientSize = New-Object System.Drawing.Size(760, 430)
    $dialog.MaximizeBox = $false
    $dialog.MinimizeBox = $false

    $desc = New-Object System.Windows.Forms.Label
    $desc.Text = '可重置一个账号的密码，或删除勾选的账号。数据库操作会先停止当前服务。'
    $desc.AutoSize = $true
    $desc.Location = New-Object System.Drawing.Point(16, 16)
    $dialog.Controls.Add($desc)

    $list = New-Object System.Windows.Forms.CheckedListBox
    $list.CheckOnClick = $true
    $list.HorizontalScrollbar = $true
    $list.Location = New-Object System.Drawing.Point(16, 44)
    $list.Size = New-Object System.Drawing.Size(724, 294)
    $dialog.Controls.Add($list)

    $status = New-Object System.Windows.Forms.Label
    $status.AutoSize = $true
    $status.Location = New-Object System.Drawing.Point(16, 352)
    $dialog.Controls.Add($status)

    $refreshButton = New-Object System.Windows.Forms.Button
    $refreshButton.Text = '刷新'
    $refreshButton.Location = New-Object System.Drawing.Point(350, 380)
    $refreshButton.Size = New-Object System.Drawing.Size(84, 30)
    $dialog.Controls.Add($refreshButton)

    $passwordButton = New-Object System.Windows.Forms.Button
    $passwordButton.Text = '重置选中账号密码'
    $passwordButton.Location = New-Object System.Drawing.Point(440, 380)
    $passwordButton.Size = New-Object System.Drawing.Size(126, 30)
    $dialog.Controls.Add($passwordButton)

    $deleteButton = New-Object System.Windows.Forms.Button
    $deleteButton.Text = '删除选中账号'
    $deleteButton.Location = New-Object System.Drawing.Point(572, 380)
    $deleteButton.Size = New-Object System.Drawing.Size(100, 30)
    $dialog.Controls.Add($deleteButton)

    $closeButton = New-Object System.Windows.Forms.Button
    $closeButton.Text = '关闭'
    $closeButton.Location = New-Object System.Drawing.Point(678, 380)
    $closeButton.Size = New-Object System.Drawing.Size(62, 30)
    $closeButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $dialog.Controls.Add($closeButton)
    $dialog.CancelButton = $closeButton

    $loadAccounts = {
        Invoke-UiTask -Owner $dialog -Action {
            $accounts = @(Get-Accounts)
            $dialog.Tag = $accounts
            $list.Items.Clear()
            foreach ($account in $accounts) {
                $suffix = if ([string]::IsNullOrWhiteSpace($account.Flags)) { '' } else { ' [' + $account.Flags + ']' }
                [void]$list.Items.Add(('ID={0}  {1}  <{2}>{3}' -f $account.Id, $account.Username, $account.Email, $suffix))
            }
            $status.Text = '当前账号数：' + $accounts.Count
        }
    }

    $refreshButton.Add_Click($loadAccounts)
    $passwordButton.Add_Click({
        if ($list.CheckedIndices.Count -ne 1) {
            Show-Info '请只勾选一个要重置密码的账号。'
            return
        }
        $accounts = @($dialog.Tag)
        $account = $accounts[[int]$list.CheckedIndices[0]]
        $newPassword = Show-TextInputDialog -Title '重置本地账号密码' -Prompt ("请输入 {0} <{1}> 的新密码（至少 6 位）：" -f $account.Username, $account.Email) -Password
        if ($null -eq $newPassword) { return }
        if ($newPassword.Length -lt 6) {
            Show-ErrorDialog '新密码至少需要 6 个字符。'
            return
        }
        if (-not (Confirm-Action ("确定重置 {0} 的密码？" -f $account.Username) '重置密码')) { return }
        Invoke-UiTask -Owner $dialog -Action {
            Invoke-StartSh -Arguments @('--set-account-password', $account.Email, $newPassword)
            Show-Info '密码已重置。请使用新密码登录。'
        }
    })
    $deleteButton.Add_Click({
        if ($list.CheckedIndices.Count -eq 0) {
            Show-Info '请先勾选要删除的账号。'
            return
        }

        $accounts = @($dialog.Tag)
        $selectedAccounts = @()
        foreach ($index in $list.CheckedIndices) {
            $selectedAccounts += $accounts[[int]$index]
        }

        $summary = ($selectedAccounts | ForEach-Object { 'ID=' + $_.Id + ' ' + $_.Username }) -join "`r`n"
        if (-not (Confirm-Action "将删除以下账号：`r`n`r`n$summary" '删除账号')) {
            return
        }

        Invoke-UiTask -Owner $dialog -Action {
            $idList = ($selectedAccounts | ForEach-Object { $_.Id }) -join ','
            Invoke-StartSh -Arguments @('--delete-accounts', $idList)
            Show-Info '账号删除完成。'
            & $loadAccounts
        }
    })

    & $loadAccounts
    [void]$dialog.ShowDialog($Owner)
}

function Show-FrontendPortDialog([System.Windows.Forms.Form]$Owner) {
    $currentPort = (Read-PortConfig).ARKHAM_PORT
    $value = Show-TextInputDialog -Title '修改前端端口' -Prompt '请输入新的前端端口：' -DefaultValue $currentPort
    if ($null -eq $value) {
        return
    }

    Invoke-UiTask -Owner $Owner -Action {
        Save-FrontendPort $value
        Show-Info '前端端口已更新。重启服务后生效。'
    }
}

function Read-LanInfo {
    $info = [ordered]@{
        ARKHAM_LAN_READY = '0'
        ARKHAM_LAN_IP = ''
        ARKHAM_LAN_PORT = ''
        ARKHAM_WSL_IP = ''
        ARKHAM_LAN_MODE = ''
    }
    if (Test-Path -LiteralPath $LanInfoFile) {
        foreach ($line in Get-Content -LiteralPath $LanInfoFile -Encoding UTF8) {
            if ($line -match '^(ARKHAM_LAN_READY|ARKHAM_LAN_IP|ARKHAM_LAN_PORT|ARKHAM_WSL_IP|ARKHAM_LAN_MODE)=(.*)$') {
                $info[$matches[1]] = $matches[2].Trim()
            }
        }
    }
    return $info
}

function Get-CurrentWslIPv4 {
    Ensure-WslEnvironment
    $distro = Get-WslDistroName
    $routeOutput = & wsl.exe -d $distro -u arkham -- ip -4 route get 1.1.1.1 2>$null
    $routeText = @($routeOutput) -join ' '
    if ($LASTEXITCODE -eq 0 -and $routeText -match '\bsrc\s+(\d+\.\d+\.\d+\.\d+)') {
        return $matches[1]
    }
    $output = & wsl.exe -d $distro -u arkham -- hostname -I 2>$null
    foreach ($candidate in ((@($output) -join ' ') -split '\s+')) {
        $parsed = $null
        if ([Net.IPAddress]::TryParse($candidate, [ref]$parsed) -and
            $parsed.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and
            $candidate -ne '127.0.0.1') {
            return $candidate
        }
    }
    throw '没有找到可用的 WSL IPv4 地址。'
}

function Repair-LanAccess {
    if (-not (Test-Path -LiteralPath $LanHelper -PathType Leaf)) {
        throw "局域网修复脚本不存在：$LanHelper"
    }
    $port = [int](Read-PortConfig).ARKHAM_PORT
    $wslIp = Get-CurrentWslIPv4
    $powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$LanHelper`" -Port $port -WslIp `"$wslIp`" -InfoFile `"$LanInfoFile`" -Elevated"
    $process = Start-Process -FilePath $powerShell -Verb RunAs -Wait -PassThru -ArgumentList $arguments
    if ($process.ExitCode -ne 0) {
        throw "局域网配置失败，退出码：$($process.ExitCode)"
    }
}

function Show-LanAccessDialog([System.Windows.Forms.Form]$Owner) {
    $info = Read-LanInfo
    $port = (Read-PortConfig).ARKHAM_PORT
    $status = if ($info.ARKHAM_LAN_READY -eq '1') { '已配置' } else { '尚未配置或需要刷新' }
    $mode = switch ($info.ARKHAM_LAN_MODE) {
        'nat' { 'WSL2 NAT（Windows 端口转发）' }
        'mirrored' { 'WSL 镜像网络（直接访问）' }
        default { '未知' }
    }
    $lanUrl = if ($info.ARKHAM_LAN_READY -eq '1' -and $info.ARKHAM_LAN_IP) {
        "http://$($info.ARKHAM_LAN_IP):$port"
    } else {
        '配置完成后显示'
    }
    $message = "状态：$status`r`n模式：$mode`r`nWSL 地址：$($info.ARKHAM_WSL_IP)`r`n局域网地址：$lanUrl`r`n`r`n是否立即重新检测并修复局域网访问？"
    if (-not (Confirm-Action $message '局域网访问')) {
        return
    }
    Invoke-UiTask -Owner $Owner -Action {
        Repair-LanAccess
        $updated = Read-LanInfo
        if ($updated.ARKHAM_LAN_READY -ne '1') {
            throw '局域网脚本执行完成，但没有生成有效状态。'
        }
        Show-Info -Owner $Owner -Message "局域网访问已配置：`r`nhttp://$($updated.ARKHAM_LAN_IP):$($updated.ARKHAM_LAN_PORT)`r`n`r`n若 WSL 地址为 172.x，Windows 会自动转发到该地址，不需要手工设置。"
    }
}

function Get-LocalWebUrl {
    $port = (Read-PortConfig).ARKHAM_PORT
    return "http://127.0.0.1:$port"
}

function Start-LocalServices([System.Windows.Forms.Form]$Owner) {
    $launcher = Join-Path $RootDir 'Start-ArkhamHorror.bat'
    if (-not (Test-Path -LiteralPath $launcher)) { throw '找不到 Start-ArkhamHorror.bat。' }
    Start-Process -FilePath $launcher
    Show-Info -Owner $Owner -Message '启动窗口已经打开。请保持该窗口运行。'
}

function Stop-LocalServices([System.Windows.Forms.Form]$Owner) {
    Invoke-UiTask -Owner $Owner -Action {
        Invoke-StartSh -Arguments @('--stop')
        Show-Info -Owner $Owner -Message '本地服务已经停止。'
    }
}

function Restart-LocalServices([System.Windows.Forms.Form]$Owner) {
    Invoke-UiTask -Owner $Owner -Action {
        Invoke-StartSh -Arguments @('--stop')
        $launcher = Join-Path $RootDir 'Start-ArkhamHorror.bat'
        Start-Process -FilePath $launcher
        Show-Info -Owner $Owner -Message '旧服务已经停止，新的启动窗口已经打开。'
    }
}

function Show-ServiceStatus([System.Windows.Forms.Form]$Owner) {
    Invoke-UiTask -Owner $Owner -Action {
        $result = Invoke-StartSh -Arguments @('--status') -CaptureOutput
        $statusText = ($result.Output | Out-String).Trim()
        $lan = Read-LanInfo
        $lanUrl = if ($lan.ARKHAM_LAN_READY -eq '1') { "http://$($lan.ARKHAM_LAN_IP):$($lan.ARKHAM_LAN_PORT)" } else { '未配置或未验证' }
        $packageInfo = Join-Path $RootDir 'PACKAGE-INFO.txt'
        $version = Split-Path -Leaf $RootDir
        if (Test-Path -LiteralPath $packageInfo) {
            $versionLine = Get-Content -LiteralPath $packageInfo -Encoding UTF8 | Where-Object { $_ -match '^(Package|Version):' } | Select-Object -First 1
            if ($versionLine) { $version = $versionLine }
        }
        Show-Info -Owner $Owner -Title '版本与运行状态' -Message "$version`r`n`r`n$statusText`r`n局域网地址：$lanUrl"
    }
}

function Open-LocalWeb {
    Start-Process (Get-LocalWebUrl)
}

function Repair-Frontend([System.Windows.Forms.Form]$Owner) {
    Invoke-UiTask -Owner $Owner -Action {
        Invoke-StartSh -Arguments @('--repair-frontend')
        Show-Info -Owner $Owner -Message '前端入口文件、MIME 配置和关键资源检查通过。若浏览器仍显示旧内容，请关闭旧标签页后重新打开。'
    }
}

function Export-Diagnostics([System.Windows.Forms.Form]$Owner) {
    $documentsDir = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)
    if ([string]::IsNullOrWhiteSpace($documentsDir)) { $documentsDir = $env:USERPROFILE }
    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Title = '保存诊断报告'
    $dialog.Filter = 'Zip 文件 (*.zip)|*.zip'
    $dialog.InitialDirectory = $documentsDir
    $dialog.FileName = 'ArkhamHorror-diagnostics-{0}.zip' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
    if ($dialog.ShowDialog($Owner) -ne [System.Windows.Forms.DialogResult]::OK) { return }

    Invoke-UiTask -Owner $Owner -Action {
        $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
        $tempDir = Join-Path $tempRoot ('arkham-diagnostics-' + [guid]::NewGuid().ToString('N'))
        [System.IO.Directory]::CreateDirectory($tempDir) | Out-Null
        try {
            $status = Invoke-StartSh -Arguments @('--status') -CaptureOutput
            [System.IO.File]::WriteAllText((Join-Path $tempDir 'service-status.txt'), (($status.Output | Out-String).Trim()), [System.Text.UTF8Encoding]::new($false))
            $systemLines = @(
                'Generated: ' + (Get-Date -Format o)
                'Package: ' + (Split-Path -Leaf $RootDir)
                'Windows: ' + [Environment]::OSVersion.VersionString
                'PowerShell: ' + $PSVersionTable.PSVersion
                'WSL distro: ' + (Get-WslDistroName)
                'Local URL: ' + (Get-LocalWebUrl)
            )
            [System.IO.File]::WriteAllLines((Join-Path $tempDir 'system.txt'), $systemLines, [System.Text.UTF8Encoding]::new($false))
            $copyFiles = @(
                'PACKAGE-INFO.txt', 'game\config\ports.env', 'game\config\lan.env',
                'game\frontend\dist\local-runtime.json', 'game\frontend\dist\index.html',
                'game\build\index.html', 'game\config\nginx.conf',
                'game\data\arkham-api.log', 'game\data\pg.log', 'game\data\error.log',
                'game\data\access.log', 'game\data\pg_dump.log', 'game\data\pg_restore.log'
            )
            foreach ($relative in $copyFiles) {
                $source = Join-Path $RootDir $relative
                if (Test-Path -LiteralPath $source) {
                    $name = $relative.Replace('\', '__')
                    Copy-Item -LiteralPath $source -Destination (Join-Path $tempDir $name) -Force
                }
            }
            $hashTargets = @('game\bin\arkham-api', 'game\bin\nginx', 'game\frontend\dist\index.html', 'game\build\index.html', 'game\start.sh')
            $hashLines = foreach ($relative in $hashTargets) {
                $target = Join-Path $RootDir $relative
                if (Test-Path -LiteralPath $target) {
                    $hash = Get-FileHash -LiteralPath $target -Algorithm SHA256
                    "$($hash.Hash)  $relative"
                }
            }
            [System.IO.File]::WriteAllLines((Join-Path $tempDir 'sha256.txt'), $hashLines, [System.Text.UTF8Encoding]::new($false))
            Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $dialog.FileName -Force
        } finally {
            $resolvedTemp = [System.IO.Path]::GetFullPath($tempDir)
            if ($resolvedTemp.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
                [System.IO.Directory]::Delete($resolvedTemp, $true)
            }
        }
        Show-Info -Owner $Owner -Message "诊断报告已保存：`r`n$($dialog.FileName)`r`n`r`n报告不包含密码或登录令牌。"
    }
}

function Show-BackupHistory([System.Windows.Forms.Form]$Owner) {
    $documentsDir = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)
    if ([string]::IsNullOrWhiteSpace($documentsDir)) { $documentsDir = $env:USERPROFILE }
    $backupDir = Join-Path $documentsDir 'Arkham Horror Local\Backups'
    [System.IO.Directory]::CreateDirectory($backupDir) | Out-Null
    $files = @(Get-ChildItem -LiteralPath $backupDir -Filter '*.tar.gz' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    if ($files.Count -eq 0) {
        if (Confirm-Action "默认备份目录中还没有 tar.gz 备份。`r`n是否打开目录？" '备份历史') { Start-Process explorer.exe -ArgumentList @($backupDir) }
        return
    }
    $picker = New-Object System.Windows.Forms.Form
    $picker.Text = '备份历史'
    $picker.StartPosition = 'CenterParent'
    $picker.ClientSize = New-Object System.Drawing.Size(720, 390)
    $picker.FormBorderStyle = 'FixedDialog'
    $list = New-Object System.Windows.Forms.ListBox
    $list.Location = New-Object System.Drawing.Point(14, 14)
    $list.Size = New-Object System.Drawing.Size(692, 300)
    foreach ($file in $files) { [void]$list.Items.Add(('{0}  {1:N1} MB  {2}' -f $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm'), ($file.Length / 1MB), $file.Name)) }
    $list.SelectedIndex = 0
    $picker.Controls.Add($list)
    $restore = New-Object System.Windows.Forms.Button
    $restore.Text = '恢复选中备份'; $restore.Location = New-Object System.Drawing.Point(452, 334); $restore.Size = New-Object System.Drawing.Size(116, 32)
    $open = New-Object System.Windows.Forms.Button
    $open.Text = '打开目录'; $open.Location = New-Object System.Drawing.Point(574, 334); $open.Size = New-Object System.Drawing.Size(82, 32)
    $close = New-Object System.Windows.Forms.Button
    $close.Text = '关闭'; $close.Location = New-Object System.Drawing.Point(662, 334); $close.Size = New-Object System.Drawing.Size(44, 32); $close.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $picker.Controls.AddRange(@($restore, $open, $close)); $picker.CancelButton = $close
    $open.Add_Click({ Start-Process explorer.exe -ArgumentList @($backupDir) })
    $restore.Add_Click({
        if ($list.SelectedIndex -lt 0) { return }
        $file = $files[$list.SelectedIndex]
        if (-not (Confirm-Action "将恢复：`r`n$($file.FullName)`r`n`r`n当前存档会先自动备份。" '恢复备份')) { return }
        Invoke-UiTask -Owner $picker -Action {
            $wslPath = Convert-ToWslPath $file.FullName
            Invoke-StartSh -Arguments @('--restore-save', $wslPath)
            Show-Info -Owner $picker -Message '备份恢复完成。'
        }
    })
    [void]$picker.ShowDialog($Owner)
}

function New-MainButton([string]$Text, [int]$X, [int]$Y, [scriptblock]$Action, [int]$Width = 376) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $Text
    $button.Location = New-Object System.Drawing.Point($X, $Y)
    $button.Size = New-Object System.Drawing.Size($Width, 40)
    $button.Add_Click($Action)
    return $button
}

if ($SelfTest) {
    Ensure-WslEnvironment
    $converted = Convert-ToWslPath $RootDir
    if (-not $converted.StartsWith('/mnt/')) {
        throw 'SelfTest 失败：路径转换异常。'
    }
    $helpResult = Invoke-StartSh -Arguments @('--help') -CaptureOutput
    if ($helpResult.ExitCode -ne 0 -or (($helpResult.Output | Out-String) -notmatch '--backup-save')) {
        throw 'SelfTest 失败：game/start.sh 缺少管理工具命令。'
    }
    Write-Output 'selftest-ok'
    exit 0
}

$mainForm = New-Object System.Windows.Forms.Form
$mainForm.Text = 'Arkham Horror LCG - 管理工具'
$mainForm.StartPosition = 'CenterScreen'
$mainForm.FormBorderStyle = 'FixedDialog'
$mainForm.MaximizeBox = $false
$mainForm.MinimizeBox = $false
$mainForm.ClientSize = New-Object System.Drawing.Size(804, 560)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = 'Arkham Horror LCG 管理工具'
$titleLabel.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 12, [System.Drawing.FontStyle]::Bold)
$titleLabel.AutoSize = $true
$titleLabel.Location = New-Object System.Drawing.Point(16, 16)
$mainForm.Controls.Add($titleLabel)

$descLabel = New-Object System.Windows.Forms.Label
$descLabel.Text = '左侧为服务与排障，右侧为存档与账号。数据库相关操作会先停止当前服务。'
$descLabel.AutoSize = $true
$descLabel.Location = New-Object System.Drawing.Point(16, 50)
$mainForm.Controls.Add($descLabel)

$systemLabel = New-Object System.Windows.Forms.Label
$systemLabel.Text = '服务与排障'
$systemLabel.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Bold)
$systemLabel.AutoSize = $true
$systemLabel.Location = New-Object System.Drawing.Point(18, 82)
$mainForm.Controls.Add($systemLabel)

$dataLabel = New-Object System.Windows.Forms.Label
$dataLabel.Text = '存档与账号'
$dataLabel.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Bold)
$dataLabel.AutoSize = $true
$dataLabel.Location = New-Object System.Drawing.Point(410, 82)
$mainForm.Controls.Add($dataLabel)

$mainForm.Controls.Add((New-MainButton '启动服务' 18 108 { Start-LocalServices $mainForm }))
$mainForm.Controls.Add((New-MainButton '停止服务' 18 154 { Stop-LocalServices $mainForm }))
$mainForm.Controls.Add((New-MainButton '重启服务' 18 200 { Restart-LocalServices $mainForm }))
$mainForm.Controls.Add((New-MainButton '查看版本和运行状态' 18 246 { Show-ServiceStatus $mainForm }))
$mainForm.Controls.Add((New-MainButton '打开本地网页' 18 292 { Open-LocalWeb }))
$mainForm.Controls.Add((New-MainButton '检查/修复白屏与前端资源' 18 338 { Repair-Frontend $mainForm }))
$mainForm.Controls.Add((New-MainButton '检查/修复局域网访问' 18 384 { Show-LanAccessDialog $mainForm }))
$mainForm.Controls.Add((New-MainButton '修改前端端口' 18 430 { Show-FrontendPortDialog $mainForm }))
$mainForm.Controls.Add((New-MainButton '导出诊断包' 18 476 { Export-Diagnostics $mainForm }))

$mainForm.Controls.Add((New-MainButton '备份全部本地存档（tar.gz）' 410 108 { Backup-SaveDialog $mainForm }))
$mainForm.Controls.Add((New-MainButton '备份历史 / 快速恢复' 410 154 { Show-BackupHistory $mainForm }))
$mainForm.Controls.Add((New-MainButton '从其他文件恢复存档（tar.gz）' 410 200 { Restore-SaveDialog $mainForm }))
$mainForm.Controls.Add((New-MainButton '导入 SQL 存档' 410 246 { Import-SqlDialog $mainForm }))
$mainForm.Controls.Add((New-MainButton '本地账号管理 / 重置密码' 410 292 { Show-AccountsDialog $mainForm }))
$mainForm.Controls.Add((New-MainButton '清空当前 SQL 存档' 410 338 { Reset-SqlDialog $mainForm }))

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Text = '关闭'
$closeButton.Location = New-Object System.Drawing.Point(710, 518)
$closeButton.Size = New-Object System.Drawing.Size(76, 30)
$closeButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
$mainForm.Controls.Add($closeButton)
$mainForm.CancelButton = $closeButton

try {
    [void]$mainForm.ShowDialog()
} catch {
    Show-ErrorDialog $_.Exception.Message
    exit 1
}
