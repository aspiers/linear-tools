import { GluegunToolbox, GluegunCommand } from 'gluegun'
import { LinearClient } from '@linear/sdk'
import * as Color from 'color'
import { encode } from 'html-entities'

import {
  attribute as _,
  Digraph,
  Subgraph,
  Node,
  NodeAttributesObject,
  Edge,
  EdgeTargetTuple,
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

const PRIORITIES = {
  0: ['#555555', 'No priority'],
  1: ['red', 'Urgent'],
  2: ['orange', 'High'],
  3: ['yellow', 'Medium'],
  4: ['blue', 'Low'],
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
              assignee {
                displayName
              }
              state {
                name
                color
              }
              priority
              children {
                nodes {
                  identifier
                  title
                  description
                }
              }
              relations {
                nodes {
                  type
                  relatedIssue {
                    identifier
                    title
                    description
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

function registerNode(subgraph, nodes, labels, idTitles, issue) {
  const idTitle = `${issue.identifier}: ${issue.title}`
  const assignee = issue.assignee?.displayName || '??'
  const title = `${issue.identifier} (${assignee})`
  const label = title + '\n' + wrap(issue.title)
  idTitles[issue.identifier] = idTitle
  labels[issue.identifier] = label
  const url = `https://linear.app/toucan/issue/${issue.identifier}`
  const nodeAttrs: NodeAttributesObject = {
    [_.label]: label,
    [_.URL]: url,
  }
  const state = issue?.state?.name || 'Unknown state'
  const priority =
    issue.priority !== undefined ? PRIORITIES[issue.priority][1] : 'unknown'
  const tooltipHeader = `${state}     Priority: ${priority}\n\n`
  nodeAttrs[_.tooltip] =
    tooltipHeader + (encode(issue.description) || 'No description.')
  if (issue.state) {
    nodeAttrs[_.fillcolor] = issue.state.color
    nodeAttrs[_.style] = 'filled'
    if (Color(issue.state.color).isDark()) {
      nodeAttrs[_.fontcolor] = 'white'
    }
  } else {
    nodeAttrs[_.shape] = 'doubleoctagon'
  }
  if (issue.priority !== undefined) {
    nodeAttrs[_.penwidth] = 5
    nodeAttrs[_.color] = PRIORITIES[issue.priority][0]
  }
  const node = new Node(issue.identifier, nodeAttrs)
  nodes[issue.identifier] = node
  subgraph.addNode(node)
  // console.warn(`+ New graph node for ${issue.identifier}`)
  return node
}

function addEdge(subgraph, relType, node, relatedNode) {
  let label = relType
  let endpoints: EdgeTargetTuple = [node, relatedNode]
  if (relType === 'duplicate') {
    endpoints = [relatedNode, node]
    label = 'duplicate of'
  }
  const edge = new Edge(endpoints, { [_.label]: label })
  subgraph.addEdge(edge)
}

function buildGraph(issues) {
  const graph = new Digraph('G', {
    [_.overlap]: false,
    [_.ranksep]: 4,
  })
  const subgraph = new Subgraph('Celo')
  graph.addSubgraph(subgraph)

  const nodes = {}
  const idTitles = {}
  const labels = {}

  for (const issue of issues) {
    registerNode(subgraph, nodes, labels, idTitles, issue)
  }
  console.warn(`Registered all issues in project`)

  for (const issue of issues) {
    console.warn(idTitles[issue.identifier])
    const node = nodes[issue.identifier]
    const children = issue.children.nodes
    const relations = issue.relations.nodes
    if (!children.length && !relations.length) {
      continue
    }

    for (const child of children) {
      const childId = child.identifier
      let childNode = nodes[childId]
      if (!childNode) {
        // Child issue wasn't registered yet; must be outside this project.
        childNode = registerNode(subgraph, nodes, labels, idTitles, child)
      }
      addEdge(subgraph, 'has parent', childNode, node)
      console.warn(`  has child ${idTitles[childId]}`)
    }

    for (const rel of relations) {
      const relatedId = rel.relatedIssue.identifier
      if (!['blocks', 'duplicate'].includes(rel.type)) {
        continue
      }
      let relatedNode = nodes[relatedId]
      if (!relatedNode) {
        // Related issue wasn't registered yet; must be outside this project.
        relatedNode = registerNode(
          subgraph,
          nodes,
          labels,
          idTitles,
          rel.relatedIssue
        )
      }
      addEdge(subgraph, rel.type, node, relatedNode)
      console.warn(`  ${rel.type} ${idTitles[relatedId]}`)
    }
  }

  return graph
}

const command: GluegunCommand = {
  name: 'graph',
  run: async (toolbox: GluegunToolbox) => {
    const linearClient = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY,
    })
    const api = linearClient.client

    const project = await findProjectMatchingSubstring(
      api,
      toolbox.parameters.first
    )
    if (!project) return
    console.warn(`Found project '${project.name}' with id ${project.id}`)

    const issues = await findRelatedIssues(api, project.id)
    const graph = buildGraph(issues)
    console.log(toDot(graph))
  },
}

module.exports = command
