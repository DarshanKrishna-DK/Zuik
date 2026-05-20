import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export async function waitForUrl(url: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok || res.status === 200) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`)
}

export function startDevServer(): ChildProcess {
  const isWin = process.platform === 'win32'
  const child = spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: FRONTEND_ROOT,
    stdio: 'pipe',
    env: { ...process.env, BROWSER: 'none' },
    shell: isWin,
  })
  child.stdout?.on('data', (d) => {
    const line = String(d)
    if (line.includes('Local:') || line.includes('ready')) {
      process.stdout.write(`[demo] ${line}`)
    }
  })
  child.stderr?.on('data', (d) => process.stderr.write(`[demo] ${String(d)}`))
  return child
}

export async function stopDevServer(child: ChildProcess | null): Promise<void> {
  if (!child || child.killed) return
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    child.on('exit', () => resolve())
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      resolve()
    }, 3000)
  })
}
