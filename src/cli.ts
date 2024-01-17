import * as dotenv from 'dotenv'
import { Command } from '@commander-js/extra-typings'

import graph from './commands/graph'
import { GraphOptions } from './types/cli'

export function run() {
  dotenv.config()

  const program = new Command()
    .name('linear')
    .description('CLI for analysing issues from linear.app')
    .version('0.1.0')

  program
    .command('graph')
    .description('Generate a dependency graph')
    .option(
      '--cycles, --cluster-cycles',
      'Cluster issues by Linear cycle into subgraphs',
    )
    .option('--completed', 'Include completed issues')
    .option('--cancelled', 'Include cancelled issues')
    .option('--dupes, --duplicates', 'Include duplicate issues')
    .option(
      '--noext, --hide-external',
      'Hide issues external to the specified project(s), even if there are dependencies on them',
    )
    .requiredOption('--project <projects...>', 'Scope to the given project(s)')
    .option('--svg <file>', 'Output a SVG image to the file specified')
    .option('--png <file>', 'Output a PNG image to the file specified')
    .action(async (options: GraphOptions) => {
      await graph(options)
    })

  program.parse()
}
