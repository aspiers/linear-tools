import * as process from 'process';

export function die(...args: string[]): void {
  console.error(...args);
  process.exit(1);
}
