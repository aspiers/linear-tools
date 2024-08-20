import * as process from 'process'

export function die(...args: string[]): never {
  console.error(...args)
  process.exit(1)
}
