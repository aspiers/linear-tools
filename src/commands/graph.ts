import { GluegunCommand } from 'gluegun'
import { LinearClient } from '@linear/sdk'

import {
  attribute as _,
  Digraph,
  Subgraph,
  Node,
  Edge,
  toDot,
} from 'ts-graphviz'

// The most 1337 c0d3rZ all copy and paste from stackoverflow
// https://stackoverflow.com/questions/14484787/wrap-text-in-javascript
const wrap = (s) => s.replace(/(?![^\n]{1,32}$)([^\n]{1,32})\s/g, '$1\n')

type Project = {
  id: string
  slugId: string
  name: string
  description: string
}

async function findProjectsMatchingSubstring(
  api,
  projectSubstring
): Promise<Array<Project> | null> {
  const { status, data } = await api.rawRequest(
    `
      query Projects($filter: ProjectFilter) {
        projects(filter: $filter) {
          nodes {
            id
            slugId
            name
            description
          }
        }
      }
    `,
    {
      filter: {
        name: {
          contains: projectSubstring,
        },
      },
    }
  )

  if (status !== 200) {
    console.error(data)
    return null
  }

  if (!data?.projects?.nodes) {
    console.error(`Couldn't find data.projects.nodes field in response`)
    console.error(data)
    return null
  }

  return data.projects.nodes
}

async function findProjectMatchingSubstring(
  api,
  projectSubstring
): Promise<Project | null> {
  const projects = await findProjectsMatchingSubstring(api, projectSubstring)
  if (!projects) {
    return null
  }

  if (projects.length != 1) {
    console.warn(`Found ${projects.length} projects:`)
    for (const project of projects) {
      console.warn(`  ${project.name}`)
    }
    return null
  }

  return projects[0]
}

async function findRelatedIssues(api, projectId) {
  const { status, data } = await api.rawRequest(
    `
      query Dependencies($projectId: String!) {
        project(id: $projectId) {
          name
          issues {
            nodes {
              identifier
              title
              description
              state {
                name
                color
              }
              children {
                nodes {
                  identifier
                }
              }
              relations {
                nodes {
                  type
                  relatedIssue {
                    identifier
                  }
                }
              }
            }
          }
        }
      }
    `,
    { projectId }
  )

  if (status !== 200) {
    console.error(data)
    return null
  }
  if (!data?.project?.issues?.nodes) {
    console.error(`Couldn't find data.project.issues.nodes field in response`)
    console.error(data)
    return null
  }

  return data.project.issues.nodes
}

function buildGraph(issues) {
  const graph = new Digraph('G', {
    [_.overlap]: false,
    [_.ranksep]: 4,
  })
  const subgraph = new Subgraph('Celo')
  graph.addSubgraph(subgraph)

  const nodes = {}
  const stitles = {}
  const titles = {}

  for (const issue of issues) {
    const stitle = `${issue.identifier}: ${issue.title}`
    const title = `${issue.identifier}:\n${wrap(issue.title)}`
    stitles[issue.identifier] = stitle
    titles[issue.identifier] = title
    const url = `https://linear.app/toucan/issue/${issue.identifier}`
    const node = new Node(issue.identifier, {
      [_.label]: title,
      [_.tooltip]: issue.description,
      [_.URL]: url,
      [_.fillcolor]: issue.state.color,
      [_.style]: 'filled',
    })
    nodes[issue.identifier] = node
    subgraph.addNode(node)
    // console.log(`new graph node for ${issue.identifier}`)
  }

  for (const issue of issues) {
    console.warn(stitles[issue.identifier])
    const node = nodes[issue.identifier]
    const children = issue.children.nodes
    const relations = issue.relations.nodes
    if (!children.length && !relations.length) {
      continue
    }

    for (const child of children) {
      const childIssue = child.identifier
      const childNode = nodes[childIssue]
      if (!titles[childIssue]) {
        // Related issue must be outside this project; ignore.
        continue
      }
      const edge = new Edge([node, childNode], {
        [_.label]: 'has child',
      })
      subgraph.addEdge(edge)
      console.warn(`  has child ${stitles[childIssue]}`)
    }

    for (const rel of relations) {
      const relatedIssue = rel.relatedIssue.identifier
      const relatedNode = nodes[relatedIssue]
      if (!titles[relatedIssue]) {
        // Related issue must be outside this project; ignore.
        continue
      }
      if (rel.type === 'blocks') {
        const edge = new Edge([node, relatedNode], {
          [_.label]: rel.type,
        })
        subgraph.addEdge(edge)
        console.warn(`  ${rel.type} ${stitles[relatedIssue]}`)
      }
    }
  }

  return graph
}

const command: GluegunCommand = {
  name: 'linear-deps',
  run: async () => {
    const linearClient = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY,
    })
    const api = linearClient.client

    const project = await findProjectMatchingSubstring(api, 'Celo Retirements')
    if (!project) return
    console.warn(`Found project '${project.name}' with id ${project.id}`)

    const issues = await findRelatedIssues(api, project.id)
    const graph = buildGraph(issues)
    console.log(toDot(graph))
  },
}

module.exports = command
