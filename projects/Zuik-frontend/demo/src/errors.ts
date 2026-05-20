export class DemoError extends Error {
  constructor(
    message: string,
    readonly recovery?: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DemoError'
  }
}

export function formatDemoFailure(err: unknown): string {
  if (err instanceof DemoError) {
    const hint = err.recovery ? `\n\nRecovery: ${err.recovery}` : ''
    return `${err.message}${hint}`
  }
  if (err instanceof Error) return err.message
  return String(err)
}
