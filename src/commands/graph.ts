import { spawnSync } from 'child_process'
import * as fs from 'fs'

import { LinearClient } from '@linear/sdk'

import { GraphBuilder } from '../lib/graph-builder'
import { findRelatedIssues } from '../lib/queries'
import { GraphOptions } from '../types/cli'
import { die } from '../utils'

export default async function graph(options: GraphOptions) {
  const linearClient = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY,
  })
  const api = linearClient.client

  const [issues, projects] = await findRelatedIssues(api, options.project)
  if (!issues) return
  const builder = new GraphBuilder(issues, projects, options)

  const dot = builder.toDot()
  if (options.svg) {
    renderToFile(dot, 'svg', options.svg)
  }
  if (options.png) {
    renderToFile(dot, 'png', options.png)
  }
  if (!(options.svg || options.png)) {
    console.log(dot)
  }
}

function renderToFile(dot: string, format: 'png' | 'svg', outFile: string) {
  // console.debug(`dot -T ${format} -o ${outFile}`)
  const result = spawnSync('dot', ['-T', format, '-o', outFile], {
    input: dot,
  })
  if (!outFile.endsWith(format)) {
    die(`Output file ${outFile} extension doesn't match format ${format}`)
  }
  if (result.status === 0) {
    console.log(`Wrote ${outFile}`)
  } else {
    const dotFileToDebug = outFile.replace(
      new RegExp(`\\.${format}$`),
      '-debug.dot',
    )
    if (outFile === dotFileToDebug) {
      die(`Failed to generate debug filename for ${outFile}`)
    }
    fs.writeFileSync(dotFileToDebug, dot)
    die(
      `Failed to convert DOT file to image! Wrote DOT in ${dotFileToDebug} to debug`,
    )
  }
}
