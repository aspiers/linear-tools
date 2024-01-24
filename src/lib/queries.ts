import { LinearRawResponse } from '@linear/sdk'

import {
  Api,
  DependenciesData,
  Issue,
  Issues,
  PageInfo,
  Project,
  ProjectsData,
  Projects,
} from '../types/data'

export async function findRelatedIssues(
  api: Api,
  projectSubstrings: string[],
): Promise<[Issue[], Projects]> {
  const issues: Issues = {}
  const projects: Projects = {}

  if (projectSubstrings.length == 0) {
    throw new Error('findRelatedIssues() called with no project names')
  }
  for await (const projectSubstring of projectSubstrings) {
    const project = await findProjectMatchingSubstring(api, projectSubstring)
    if (!project) {
      console.error(
        `Couldn't find a unique project matching '${projectSubstring}'`,
      )
      process.exit(1)
    }
    console.warn(`Found project '${project.name}' with id ${project.id}`)
    projects[project.id] = project.name
    const relatedIssues = await findIssuesRelatedToProject(api, project.id)
    for (const issue of relatedIssues) {
      // relatedIssues can span projects, so we need to deal with potential
      // duplicates here.  If we get an issue twice from different projects,
      // make sure we save the one with the most information.
      if (!issues[issue.identifier] || issue.children) {
        issues[issue.identifier] = issue
      }
    }
  }
  return [Object.values(issues), projects]
}

async function findProjectsMatchingSubstring(
  api: Api,
  projectSubstring?: string,
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
      },
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
  projectSubstring?: string,
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

async function findIssuesRelatedToProject(
  api: Api,
  projectId: string,
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
      after,
    )
    if (!newNodes) {
      break
    }
    for (const node of newNodes) {
      node.projectId = projectId
    }
    nodes.push(...newNodes)
    console.warn(
      `  Got ${newNodes.length} new node(s); total now ${nodes.length}; hasNextPage=${pageInfo.hasNextPage}`,
    )
    after = pageInfo?.endCursor
    page++
  } while (pageInfo?.hasNextPage)

  return nodes
}

async function findRelatedIssuesPaginated(
  api: Api,
  projectId: string,
  after: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                type
                color
              }
              priority
              estimate
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
                  estimate
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
      { projectId },
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
