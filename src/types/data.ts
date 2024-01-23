import { LinearGraphQLClient } from '@linear/sdk'

import { Node } from 'ts-graphviz'

export type Subgraphs = Record<string, Subgraph>
export type Issues = Record<string, Issue>
export type Nodes = Record<string, Node>
export type Labels = Record<string, string>
export type Titles = Record<string, string>
export type Projects = Record<string, string>

export type ProjectsData = {
  projects?: {
    nodes?: Project[]
  }
}

export type Api = LinearGraphQLClient

export type Project = {
  id: string
  slugId: string
  name: string
  description: string
}

export type PageInfo = {
  hasNextPage: boolean
  endCursor: string
}

export type Relation = {
  type: string
  relatedIssue: Issue
}

export type Issue = {
  identifier: string
  title: string
  description: string
  projectId: string
  assignee?: {
    displayName: string
  }
  state?: {
    name: string
    color: string
    type: string
  }
  priority: number
  estimate: number
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

export type DependenciesData = {
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
