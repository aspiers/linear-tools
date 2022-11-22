import { spawnSync } from 'child_process'

import { GluegunToolbox, GluegunCommand } from 'gluegun'
import {
  LinearClient,
  LinearGraphQLClient,
  LinearRawResponse,
} from '@linear/sdk'
import * as Color from 'color'

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
const WRAP_WIDTH = 25
const WRAP_REGEXP = new RegExp(
  `(?![^\n]{1,${WRAP_WIDTH}}$)([^\n]{1,${WRAP_WIDTH}})\\s`,
  'g'
)
const wrap = (s: string) => s.replace(WRAP_REGEXP, '$1\n')

type Api = LinearGraphQLClient

type Options = {
  canceled?: boolean
  cancelled?: boolean
  dupes?: boolean
  svg?: string
  png?: string
}

type Project = {
  id: string
  slugId: string
  name: string
  description: string
}

type PageInfo = {
  hasNextPage: boolean
  endCursor: string
}

type Relation = {
  type: string
  relatedIssue: Issue
}

type Issue = {
  identifier: string
  title: string
  description: string
  assignee?: {
    displayName: string
  }
  state?: {
    name: string
    color: string
  }
  priority: number
  cycle: {
    id: string
    number: number
    name: string
  }
  children?: {
    nodes: Issue[]
  }
  relations?: {
    nodes: Relation[]
  }
  pageInfo?: PageInfo
}

type Subgraphs = Record<string, Subgraph>
type Issues = Record<string, Issue>
type Nodes = Record<string, Node>
type Labels = Record<string, string>
type Titles = Record<string, string>

const PRIORITIES = {
  0: ['#555555', 'No priority'],
  1: ['red', 'Urgent'],
  2: ['orange', 'High'],
  3: ['yellow', 'Medium'],
  4: ['blue', 'Low'],
}

type ProjectsData = {
  projects?: {
    nodes?: Project[]
  }
}

async function findProjectsMatchingSubstring(
  api: Api,
  projectSubstring?: string
): Promise<Array<Project> | null> {
  const { status, data }: LinearRawResponse<ProjectsData> =
    await api.rawRequest(
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
  api: Api,
  projectSubstring?: string
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

async function findRelatedIssues(
  api: Api,
  projectId: string
): Promise<Issue[]> {
  const nodes = [] as Issue[]
  let after: string | null = null
  let page = 1
  let pageInfo: PageInfo
  do {
    const afterText = after ? `after ${after}` : 'at start'
    console.warn(`Doing issue query page ${page} ${afterText} ...`)
    let newNodes: Issue[] | null
    ;[newNodes, pageInfo] = await findRelatedIssuesPaginated(
      api,
      projectId,
      after
    )
    if (!newNodes) {
      break
    }
    nodes.push(...newNodes)
    console.warn(
      `  Got ${newNodes.length} new node(s); total now ${nodes.length}; hasNextPage=${pageInfo.hasNextPage}`
    )
    after = pageInfo?.endCursor
    page++
  } while (pageInfo?.hasNextPage)

  return nodes
}

type DependenciesData = {
  project?: {
    issues?: {
      nodes?: Issues[]
      pageInfo?: {
        hasNextPage: boolean
        endCursor: string
      }
    }
  }
}

async function findRelatedIssuesPaginated(
  api: Api,
  projectId: string,
  after: string | null
): Promise<[any[] | null, any]> {
  const afterFilter = after ? `, after: "${after}"` : ''
  const { status, data }: LinearRawResponse<DependenciesData> =
    await api.rawRequest(
      `
      query Dependencies($projectId: String!) {
        project(id: $projectId) {
          name
          issues(first: 50${afterFilter}) {
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
              cycle {
                id
                number
                name
              }
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
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `,
      { projectId }
    )

  if (status !== 200) {
    console.error(data)
    return [null, null]
  }
  if (!data?.project?.issues?.nodes) {
    console.error(`Couldn't find data.project.issues.nodes field in response`)
    console.error(data)
    return [null, null]
  }

  return [data.project.issues.nodes, data.project.issues.pageInfo]
}

function createNode(
  nodes: Nodes,
  labels: Labels,
  idTitles: Titles,
  issue: Issue
) {
  const idTitle = `${issue.identifier}: ${issue.title}`
  idTitles[issue.identifier] = idTitle

  const nodeAttrs = getNodeAttrs(labels, issue)
  const node = new Node(issue.identifier, nodeAttrs)
  nodes[issue.identifier] = node
  return node
}

// We decouple the creation of the node from the addition of it to the
// graph, because it may be created during the first phase of issues
// returned from queries, but only added to the graph in the second
// phase due to relationships involving it, and the first phase has a
// richer set of data available than the second.  If we created it in
// the second phase, we'd miss out on some of this extra data.
function registerNode(
  subgraph: Subgraph,
  nodes: Nodes,
  labels: Labels,
  idTitles: Titles,
  issue: Issue
) {
  const node =
    nodes[issue.identifier] || createNode(nodes, labels, idTitles, issue)
  subgraph.addNode(node)
  // console.warn(`+ New graph node for ${issue.identifier}`)
  return node
}

// For some reason entities like &apos; are not decoded, so roll our
// own here instead of using the html-entities package.
function encode(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function getNodeAttrs(labels: Labels, issue: Issue): NodeAttributesObject {
  const assignee = issue.assignee?.displayName || '??'
  const title = `${issue.identifier} (${assignee})`
  const label = title + '\n' + wrap(issue.title)
  labels[issue.identifier] = label
  const url = `https://linear.app/toucan/issue/${issue.identifier}`

  const nodeAttrs: NodeAttributesObject = {
    [_.label]: label,
    [_.URL]: url,
  }
  const state = issue?.state?.name || 'Unknown state'
  const priority =
    issue.priority !== undefined ? PRIORITIES[issue.priority][1] : 'unknown'
  const cycle = issue.cycle
  const tooltipHeader = `${state}     Priority: ${priority}    Cycle: ${cycle?.number}\n\n`

  nodeAttrs[_.tooltip] =
    tooltipHeader + encode(issue.description || 'No description.')

  if (issue.state) {
    nodeAttrs[_.fillcolor] = issue.state.color
    nodeAttrs[_.style] = 'filled'
    if (Color(issue.state.color).isDark()) {
      nodeAttrs[_.fontcolor] = 'white'
    }
    if (issue.title.match(/\bepic\b/i)) {
      nodeAttrs[_.shape] = 'doublecircle'
    }
  } else {
    nodeAttrs[_.shape] = 'doubleoctagon'
  }

  if (issue.priority !== undefined) {
    nodeAttrs[_.penwidth] = 5
    nodeAttrs[_.color] = PRIORITIES[issue.priority][0]
  }
  return nodeAttrs
}

function addEdge(
  subgraph: Subgraph,
  relType: string,
  node: Node,
  relatedNode: Node
) {
  let label = relType
  let endpoints: EdgeTargetTuple = [node, relatedNode]
  const attrs = { [_.label]: label }
  if (relType === 'duplicate') {
    endpoints = [relatedNode, node]
    label = 'duplicate of'
    attrs[_.color] = 'red'
    attrs[_.fontcolor] = 'red'
  } else if (relType === 'has parent') {
    attrs[_.color] = 'blue'
    attrs[_.fontcolor] = 'blue'
  }

  const edge = new Edge(endpoints, attrs)
  subgraph.addEdge(edge)
}

function isNodeHidden(issue: Issue, options: Options): boolean {
  if (
    issue.state?.name === 'Canceled' &&
    !(options.canceled || options.cancelled)
  ) {
    return true
  }
  return false
}

function ensureSubgraph(
  graph: Digraph,
  subgraphs: Subgraphs,
  name: string
): Subgraph {
  if (subgraphs[name]) {
    return subgraphs[name]
  }
  const subgraphName = 'cluster_' + name
  const subgraph = new Subgraph(subgraphName)
  graph.addSubgraph(subgraph)
  subgraphs[name] = subgraph
  return subgraph
}

function buildGraph(projectName: string, issues: Issue[], options: Options) {
  const graph = new Digraph(projectName, {
    [_.overlap]: false,
    [_.ranksep]: 2,
  })
  const subgraphs = {}
  const noCycleSubgraph = ensureSubgraph(graph, subgraphs, 'no_cycle')

  const nodes: Nodes = {}
  const idTitles: Titles = {}
  const labels = {}

  for (const issue of issues) {
    if (isNodeHidden(issue, options)) {
      continue
    }
    const subgraph = issue.cycle
      ? ensureSubgraph(graph, subgraphs, issue.cycle.number.toString())
      : noCycleSubgraph
    registerNode(subgraph, nodes, labels, idTitles, issue)
  }
  console.warn(`Registered issues in project`)

  for (const issue of issues) {
    if (isNodeHidden(issue, options)) {
      continue
    }

    console.warn(idTitles[issue.identifier])
    const node = nodes[issue.identifier]
    addChildren(
      noCycleSubgraph,
      nodes,
      labels,
      idTitles,
      node,
      issue.children.nodes,
      options
    )
    addRelations(
      noCycleSubgraph,
      nodes,
      labels,
      idTitles,
      node,
      issue.relations.nodes,
      options
    )
  }

  return graph
}

function addChildren(
  subgraphs: Subgraphs,
  nodes: Nodes,
  labels: Labels,
  idTitles: Titles,
  children: Node[],
  issue: Issue,
  options: Options
) {
  for (const child of children) {
    if (isNodeHidden(child, options)) {
      continue
    }
    const childId = child.identifier
    let childNode = nodes[childId]
    if (!childNode) {
      // Child issue wasn't registered yet; must be outside this project.
      childNode = registerNode(subgraph, nodes, labels, idTitles, child)
    }
    addEdge(subgraph, 'has parent', childNode, node)
    console.warn(`  has child ${idTitles[childId]}`)
  }
}

function addRelations(
  subgraphs: Subgraphs,
  nodes: Nodes,
  labels: Labels,
  idTitles: Titles,
  node: Node,
  relations: Relation[],
  options: Options
) {
  for (const rel of relations) {
    if (isNodeHidden(rel.relatedIssue, options)) {
      continue
    }
    const relatedId = rel.relatedIssue.identifier
    const relatedDescr = idTitles[relatedId] || relatedId
    if (ignoreRelation(rel.type, options)) {
      console.warn(`  ignoring: ${rel.type} ${relatedDescr}`)
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
    console.warn(`  ${rel.type} ${relatedDescr}`)
  }
}

function ignoreRelation(relType: string, options: Options): boolean {
  if (relType === 'duplicate') {
    return !options.dupes
  }
  if (relType === 'blocks') {
    return false
  }
  return true
}

function renderToFile(dot: string, format: 'png' | 'svg', outFile: string) {
  const result = spawnSync('dot', ['-T', format, '-o', outFile], {
    input: dot,
  })
  if (result.status === 0) {
    console.log(`Wrote ${outFile}`)
  }
}

const command: GluegunCommand = {
  name: 'graph',
  run: async (toolbox: GluegunToolbox) => {
    const linearClient = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY,
    })
    const api = linearClient.client
    const params = toolbox.parameters

    const project = await findProjectMatchingSubstring(api, params.first)
    if (!project) return
    console.warn(`Found project '${project.name}' with id ${project.id}`)

    const issues = await findRelatedIssues(api, project.id)
    const options = params.options
    const graph = buildGraph(project.name, issues, options)

    const dot = toDot(graph)
    if (options.svg) {
      renderToFile(dot, 'svg', options.svg)
    } else if (options.png) {
      renderToFile(dot, 'png', options.png)
    } else {
      console.log(dot)
    }
  },
}

module.exports = command
