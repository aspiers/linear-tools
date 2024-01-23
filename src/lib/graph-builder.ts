import * as Color from 'color'

import {
  attribute as _,
  Digraph,
  Subgraph,
  Node,
  NodeAttributesObject,
  Edge,
  EdgeTargetTuple,
} from 'ts-graphviz'

import { encode, wrap } from './text-formatters'
import { GraphOptions } from '../types/cli'
import {
  Issue,
  Issues,
  Labels,
  Nodes,
  Projects,
  Titles,
  Subgraphs,
} from '../types/data'

const CENSOR_CONTENT = false

const SIZES = {
  0: [0.25, 10.0],
  1: [0.5, 12.0],
  2: [0.75, 14.0],
  3: [1.0, 18.0],
  5: [1.25, 22.0],
  8: [1.5, 26.0],
}

const PRIORITIES = {
  0: ['#555555', 'No priority'],
  1: ['red', 'Urgent'],
  2: ['orange', 'High'],
  3: ['yellow', 'Medium'],
  4: ['blue', 'Low'],
}

export function buildGraph(
  issues: Issue[],
  projects: Projects,
  options: GraphOptions,
) {
  const graph = new Digraph('Dependency graph', {
    [_.overlap]: false,
    [_.ranksep]: 2,
  })
  const subgraphs = {}
  const noCycleSubgraph = options.clusterCycles
    ? ensureSubgraph(graph, subgraphs, 'no_cycle')
    : graph

  const issuesById: Issues = {}
  const nodes: Nodes = {}
  const idTitles: Titles = {}
  const labels = {}

  for (const issue of issues) {
    issuesById[issue.identifier] = issue
    if (isNodeHidden(issue, options)) {
      continue
    }
    const nodeGraph = options.clusterCycles
      ? issue.cycle
        ? ensureSubgraph(graph, subgraphs, issue.cycle.number.toString())
        : noCycleSubgraph
      : graph
    registerNode(nodeGraph, nodes, labels, idTitles, projects, issue)
  }
  console.warn(`Registered issues`)

  for (const issue of issues) {
    if (isNodeHidden(issue, options)) {
      continue
    }

    console.warn(idTitles[issue.identifier] + ' ' + getIssueInfo(issue))
    const node = nodes[issue.identifier]
    addChildren(
      graph,
      subgraphs,
      issuesById,
      nodes,
      labels,
      idTitles,
      projects,
      node,
      issue,
      options,
    )
    addRelations(
      graph,
      subgraphs,
      issuesById,
      nodes,
      labels,
      idTitles,
      projects,
      node,
      issue,
      options,
    )
  }

  return graph
}

function getEdgeGraph(
  options: GraphOptions,
  graph: Digraph,
  subgraphs: Subgraphs,
  issues: Issues,
  issue1: Issue,
  issue2Id: string,
): Digraph | Subgraph {
  if (!options.clusterCycles) return graph

  const issue2 = issues[issue2Id]
  const issue1Cycle = issue1.cycle?.number.toString() || 'no_cycle'
  const issue2Cycle = issue2?.cycle?.number.toString() || 'no_cycle'
  if (issue1Cycle === issue2Cycle) {
    // Issues are in same subgraph
    return subgraphs[issue1Cycle]
  }
  // Edge spans subgraphs
  return graph
}

function addChildren(
  graph: Digraph,
  subgraphs: Subgraphs,
  issues: Issues,
  nodes: Nodes,
  labels: Labels,
  idTitles: Titles,
  projects: Projects,
  node: Node,
  issue: Issue,
  options: GraphOptions,
) {
  if (!issue.children) {
    return
  }
  const children = issue.children.nodes
  for (const child of children) {
    if (isNodeHidden(child, options)) {
      continue
    }
    const childId = child.identifier
    let childNode = nodes[childId]
    if (!childNode) {
      // Child issue wasn't registered yet; must be outside this project.
      childNode = registerNode(
        options.clusterCycles ? subgraphs['no_cycle'] : graph,
        nodes,
        labels,
        idTitles,
        projects,
        child,
      )
    }
    const edgeGraph = getEdgeGraph(
      options,
      graph,
      subgraphs,
      issues,
      issue,
      childId,
    )
    addEdge(edgeGraph, 'has parent', childNode, node)
    console.warn(`  has child ${idTitles[childId]}`)
  }
}

function addRelations(
  graph: Digraph,
  subgraphs: Subgraphs,
  issues: Issues,
  nodes: Nodes,
  labels: Labels,
  idTitles: Titles,
  projects: Projects,
  node: Node,
  issue: Issue,
  options: GraphOptions,
) {
  if (!issue.relations) {
    return
  }
  const relations = issue.relations.nodes
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
    let external = false
    if (!relatedNode) {
      // Related issue wasn't registered yet; must be outside this project.
      external = true
      if (!options.hideExternal) {
        relatedNode = registerNode(
          options.clusterCycles ? subgraphs['no_cycle'] : graph,
          nodes,
          labels,
          idTitles,
          projects,
          rel.relatedIssue,
        )
      }
    }
    if (!external || !options.hideExternal) {
      const edgeGraph = getEdgeGraph(
        options,
        graph,
        subgraphs,
        issues,
        issue,
        relatedId,
      )
      addEdge(edgeGraph, rel.type, node, relatedNode)
      console.warn(`  ${rel.type} ${relatedDescr}`)
    }
    if (external) {
      console.warn(`  ${rel.type} ${relatedDescr} (hiding external issue)`)
    }
  }
}

function ignoreRelation(relType: string, options: GraphOptions): boolean {
  if (relType === 'duplicate') {
    return !options.duplicates
  }
  if (relType === 'blocks') {
    return false
  }
  return true
}

function createNode(
  nodes: Nodes,
  labels: Labels,
  idTitles: Titles,
  projects: Projects,
  issue: Issue,
) {
  const idTitle = `${issue.identifier}: ${issue.title}`
  idTitles[issue.identifier] = idTitle

  const nodeAttrs = getNodeAttrs(labels, projects, issue)
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
  graph: Digraph | Subgraph,
  nodes: Nodes,
  labels: Labels,
  idTitles: Titles,
  projects: Projects,
  issue: Issue,
) {
  const node =
    nodes[issue.identifier] ||
    createNode(nodes, labels, idTitles, projects, issue)
  graph.addNode(node)
  // console.warn(`+ New graph node for ${issue.identifier}`)
  return node
}

function getIssueInfo(issue: Issue): string {
  const assignee = issue.assignee?.displayName || '??'
  const cycleLabel = issue.cycle?.number || '-'
  return `[${assignee} / C${cycleLabel} / E${issue.estimate || '?'}]`
}

function getNodeAttrs(
  labels: Labels,
  projects: Projects,
  issue: Issue,
): NodeAttributesObject {
  if (CENSOR_CONTENT) {
    issue.title = 'Issue name hidden due to confidentiality'
    issue.description = 'Issue description hidden due to confidentiality'
  }
  const info = getIssueInfo(issue)
  const title = issue.identifier + ' ' + info
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
  const cycleLabel = issue.cycle?.number || '-'
  const project = projects[issue.projectId] || issue.projectId
  const tooltipHeader = `${state}  Priority: ${priority}  Cycle: ${cycleLabel}  Estimate: ${issue.estimate}\nProject: ${project}\n\n`

  nodeAttrs[_.tooltip] =
    tooltipHeader + encode(issue.description || 'No description.')

  if (issue.state) {
    let estimate = issue.estimate
    if (issue.title.includes('EPIC')) {
      estimate = 5
    }
    const sizes = SIZES[estimate]
    if (sizes) {
      const [width, fontsize] = sizes
      nodeAttrs[_.width] = width
      nodeAttrs[_.fontsize] = fontsize
    }
    nodeAttrs[_.fillcolor] = issue.state.color
    nodeAttrs[_.style] = 'filled'
    if (Color(issue.state.color).isDark()) {
      nodeAttrs[_.fontcolor] = 'white'
    }
    if (issue.title.match(/\bepic\b/i)) {
      nodeAttrs[_.shape] = 'hexagon'
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
  graph: Digraph | Subgraph,
  relType: string,
  node: Node,
  relatedNode: Node,
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
  graph.addEdge(edge)
}

function isNodeHidden(issue: Issue, options: GraphOptions): boolean {
  if (issue.state?.type === 'canceled' && !options.cancelled) {
    return true
  }
  if (issue.state?.type === 'completed' && !options.completed) {
    return true
  }
  return false
}

function ensureSubgraph(
  graph: Digraph,
  subgraphs: Subgraphs,
  name: string,
): Subgraph {
  if (subgraphs[name]) {
    return subgraphs[name]
  }
  const subgraphName = 'cluster_' + name
  const label = name == 'no_cycle' ? 'No cycle' : `Cycle ${name}`
  const subgraph = new Subgraph(subgraphName, {
    [_.label]: label,
    [_.labeljust]: 'l',
    [_.fontsize]: 20,
    [_.fontcolor]: 'green',
    [_.penwidth]: 2,
    [_.pencolor]: 'green',
  })
  graph.addSubgraph(subgraph)
  subgraphs[name] = subgraph
  return subgraph
}
