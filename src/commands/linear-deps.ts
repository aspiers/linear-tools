import { GluegunCommand, http } from 'gluegun'

import { digraph } from 'graphviz'

async function findProject(api, projectSubstring) {
  const { ok, data } = await api.post('/graphql', {
    query: `
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
    variables: {
      filter: {
        name: {
          contains: projectSubstring,
        },
      },
    },
  })

  if (!ok) {
    console.error(data)
    return null
  }

  if (!data?.data?.projects?.nodes) {
    console.error(`Couldn't find data.projects.nodes field in response`)
    console.error(data)
    return null
  }

  const projects = data.data.projects.nodes
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
  const { ok, data } = await api.post('/graphql', {
    query: `
      query Dependencies($projectId: String!) {
        project(id: $projectId) {
          name
          issues {
            nodes {
              identifier
              title
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
    variables: { projectId },
  })

  if (!ok) {
    console.error(data)
    return null
  }
  if (!data?.data?.project?.issues?.nodes) {
    console.error(`Couldn't find data.project.issues.nodes field in response`)
    console.error(data)
    return null
  }

  return data.data.project.issues.nodes
}

function buildGraph(issues) {
  const graph = digraph('G')
  const nodes = {}
  const titles = {}

  for (const issue of issues) {
    const title = `${issue.identifier}: ${issue.title}`
    titles[issue.identifier] = title
    const node = graph.addNode(issue.identifier, { label: title })
    nodes[title] = node
    // console.log(issue.identifier)
  }

  for (const issue of issues) {
    if (!issue.relations.nodes) {
      continue
    }
    console.warn(titles[issue.identifier])
    for (const rel of issue.relations.nodes) {
      const relatedIssue = rel.relatedIssue.identifier
      if (!titles[relatedIssue]) {
        // Related issue must be outside this project; ignore.
        continue
      }
      if (rel.type === 'blocks') {
        graph.addEdge(issue.identifier, relatedIssue)
        console.warn(`  ${rel.type} ${titles[relatedIssue]}`)
      }
    }
  }

  return graph
}

const command: GluegunCommand = {
  name: 'linear-deps',
  run: async () => {
    const api = http.create({
      baseURL: 'https://api.linear.app',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.LINEAR_API_KEY,
      },
    })

    const project = await findProject(api, 'Celo Retirements')
    if (!project) return
    console.warn(`Found project '${project.name}' with id ${project.id}`)

    const issues = await findRelatedIssues(api, project.id)
    const graph = buildGraph(issues)
    console.log(graph.to_dot())
  },
}

module.exports = command
