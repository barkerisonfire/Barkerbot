// Runs PowerShell scripts with JSON in/out. Parameters are embedded as a
// base64 JSON blob (never string-interpolated into script text) so user input
// can't inject PowerShell. Scripts read them from `$p`.
import { spawn } from 'child_process'

export async function runPs<T = unknown>(script: string, params: Record<string, unknown> = {}): Promise<T> {
  const b64 = Buffer.from(JSON.stringify(params), 'utf8').toString('base64')
  const wrapped = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')) | ConvertFrom-Json
try {
  $result = & {
${script}
  }
  ConvertTo-Json -InputObject @{ ok = $true; data = $result } -Depth 8 -Compress
} catch {
  ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress
}
`
  const encoded = Buffer.from(wrapped, 'utf16le').toString('base64')
  const exe = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'

  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (e) => reject(new Error(`Could not start PowerShell: ${e.message}`)))
    child.on('close', () => {
      const line = out.trim().split(/\r?\n/).pop() ?? ''
      try {
        const res = JSON.parse(line)
        if (res.ok) resolve(res.data as T)
        else reject(new Error(res.error))
      } catch {
        reject(new Error(err.trim() || out.trim() || 'PowerShell returned no output'))
      }
    })
  })
}
