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

export class GraphBuilder {
  graph: Digraph
  subgraphs: Subgraphs = {}
  noCycleGraph?: Digraph | Subgraph
  issuesById: Issues = {} // FIXME: not used by anything any more?
  nodes: Nodes = {}
  idTitles: Titles = {}
  labels: Labels = {} // FIXME: not used?
  projects: Projects = {}
  options: GraphOptions = {
    project: [],
    completed: false,
    cancelled: false,
    duplicates: false,
    clusterCycles: false,
    hideExternal: false,
  }

  constructor(issues: Issue[], _projects: Projects, _options: GraphOptions) {
    this.projects = _projects
    this.options = _options
    this.graph = new Digraph('Dependency graph', {
      [_.overlap]: false,
      [_.ranksep]: 2,
    })
    this.build(issues)
  }

  build(issues: Issue[]): void {
    this.noCycleGraph = this.options.clusterCycles
      ? this.ensureSubgraph('no_cycle')
      : this.graph

    for (const issue of issues) {
      this.issuesById[issue.identifier] = issue

      if (this.isNodeHidden(issue)) {
        continue
      }
      const nodeGraph = this.options.clusterCycles
        ? issue.cycle
          ? this.ensureSubgraph(issue.cycle.number.toString())
          : this.noCycleGraph
        : this.graph
      this.registerNode(nodeGraph, issue)
    }
    console.warn(`Registered issues`)

    for (const issue of issues) {
      if (this.isNodeHidden(issue)) {
        continue
      }

      console.warn(
        this.idTitles[issue.identifier] + ' ' + this.getIssueInfo(issue),
      )
      const node = this.nodes[issue.identifier]
      this.addChildren(node, issue)
      this.addRelations(node, issue)
    }
  }

  ensureSubgraph(name: string): Subgraph {
    if (this.subgraphs[name]) {
      return this.subgraphs[name]
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
    this.graph.addSubgraph(subgraph)
    this.subgraphs[name] = subgraph
    return subgraph
  }

  addChildren(node: Node, issue: Issue) {
    if (!issue.children) {
      return
    }
    const children = issue.children.nodes
    for (const child of children) {
      if (this.isNodeHidden(child)) {
        continue
      }
      const childId = child.identifier
      let childNode = this.nodes[childId]
      if (!childNode) {
        // Child issue wasn't registered yet; must be outside this project.
        childNode = this.registerNode(
          this.options.clusterCycles ? this.subgraphs['no_cycle'] : this.graph,
          child,
        )
      }
      const edgeGraph = this.getEdgeGraph(issue, childId)
      this.addEdge(edgeGraph, 'has parent', childNode, node)
      console.warn(`  has child ${this.idTitles[childId]}`)
    }
  }

  addRelations(node: Node, issue: Issue) {
    if (!issue.relations) {
      return
    }
    const relations = issue.relations.nodes
    for (const rel of relations) {
      if (this.isNodeHidden(rel.relatedIssue)) {
        continue
      }
      const relatedId = rel.relatedIssue.identifier
      const relatedDescr = this.idTitles[relatedId] || relatedId
      if (this.ignoreRelation(rel.type)) {
        console.warn(`  ignoring: ${rel.type} ${relatedDescr}`)
        continue
      }
      let relatedNode = this.nodes[relatedId]
      let external = false
      if (!relatedNode) {
        // Related issue wasn't registered yet; must be outside this project.
        external = true
        if (!this.options.hideExternal) {
          relatedNode = this.registerNode(
            this.options.clusterCycles
              ? this.subgraphs['no_cycle']
              : this.graph,
            rel.relatedIssue,
          )
        }
      }
      if (!external || !this.options.hideExternal) {
        const edgeGraph = this.getEdgeGraph(issue, relatedId)
        this.addEdge(edgeGraph, rel.type, node, relatedNode)
        console.warn(`  ${rel.type} ${relatedDescr}`)
      }
      if (external) {
        console.warn(`  ${rel.type} ${relatedDescr} (hiding external issue)`)
      }
    }
  }

  ignoreRelation(relType: string): boolean {
    if (relType === 'duplicate') {
      return !this.options.duplicates
    }
    if (relType === 'blocks') {
      return false
    }
    return true
  }

  // We decouple the creation of the node from the addition of it to the
  // graph, because it may be created during the first phase of issues
  // returned from queries, but only added to the graph in the second
  // phase due to relationships involving it, and the first phase has a
  // richer set of data available than the second.  If we created it in
  // the second phase, we'd miss out on some of this extra data.
  registerNode(graph: Digraph | Subgraph, issue: Issue) {
    const node = this.nodes[issue.identifier] || this.createNode(issue)
    graph.addNode(node)
    // console.warn(`+ New graph node for ${issue.identifier}`)
    return node
  }

  createNode(issue: Issue) {
    const idTitle = `${issue.identifier}: ${issue.title}`
    this.idTitles[issue.identifier] = idTitle

    const nodeAttrs = this.getNodeAttrs(issue)
    const node = new Node(issue.identifier, nodeAttrs)
    this.nodes[issue.identifier] = node
    return node
  }

  getIssueInfo(issue: Issue): string {
    const assignee = issue.assignee?.displayName || '??'
    const cycleLabel = issue.cycle?.number || '-'
    return `[${assignee} / C${cycleLabel} / E${issue.estimate || '?'}]`
  }

  getNodeAttrs(issue: Issue): NodeAttributesObject {
    if (CENSOR_CONTENT) {
      issue.title = 'Issue name hidden due to confidentiality'
      issue.description = 'Issue description hidden due to confidentiality'
    }
    const info = this.getIssueInfo(issue)
    const title = issue.identifier + ' ' + info
    const label = title + '\n' + wrap(issue.title)
    this.labels[issue.identifier] = label
    const url = `https://linear.app/toucan/issue/${issue.identifier}`

    const nodeAttrs: NodeAttributesObject = {
      [_.label]: label,
      [_.URL]: url,
    }
    const state = issue?.state?.name || 'Unknown state'
    const priority =
      issue.priority !== undefined ? PRIORITIES[issue.priority][1] : 'unknown'
    const cycleLabel = issue.cycle?.number || '-'
    const project = this.projects[issue.projectId] || issue.projectId
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

  isNodeHidden(issue: Issue): boolean {
    if (issue.state?.type === 'canceled' && !this.options.cancelled) {
      return true
    }
    if (issue.state?.type === 'completed' && !this.options.completed) {
      return true
    }
    return false
  }

  // Figure out which graph or subgraph and edge belongs.
  // If we're not clustering into subgraphs, or if the edge spans
  // subgraphs, it will be placed in the main top-level graph.
  getEdgeGraph(issue1: Issue, issue2Id: string): Digraph | Subgraph {
    if (!this.options.clusterCycles) return this.graph

    const issue2 = this.issuesById[issue2Id]
    const issue1Cycle = issue1.cycle?.number.toString() || 'no_cycle'
    const issue2Cycle = issue2?.cycle?.number.toString() || 'no_cycle'
    if (issue1Cycle === issue2Cycle) {
      // Issues are in same subgraph
      return this.subgraphs[issue1Cycle]
    }
    // Edge spans subgraphs
    return this.graph
  }

  addEdge(
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

  toDot(): string {
    if (!this.graph) {
      throw new Error('BUG: somehow called toDot() before graph was built')
    }
    return toDot(this.graph)
  }
}
