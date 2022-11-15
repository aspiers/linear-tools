import { GluegunCommand, print, http } from 'gluegun'

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
    print.error(data)
    return null
  }

  if (!data.data) {
    print.error(`Got no data field in response`)
    console.error(data)
    return null
  }

  if (!data.data.projects) {
    print.error(`Got no data.projects field in response`)
    console.error(data)
    return null
  }

  if (!data.data.projects.nodes) {
    print.error(`Got no data.projects.nodes field in response`)
    console.error(data)
    return null
  }

  const projects = data.data.projects.nodes
  if (projects.length != 1) {
    print.warning(`Found ${projects.length} projects:`)
    for (const project of projects) {
      print.warning(`  ${project.name}`)
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
    print.error(data)
    return null
  }

  if (!data.data) {
    print.error(`Got no data field in response`)
    console.error(data)
    return null
  }

  if (!data.data.project) {
    print.error(`Got no data.project field in response`)
    console.error(data)
    return null
  }

  if (!data.data.project.issues) {
    print.error(`Got no data.project.issues field in response`)
    console.error(data)
    return null
  }

  return data.data.project.issues
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
    print.info(`Found project '${project.name}' with id ${project.id}`)

    const issues = await findRelatedIssues(api, project.id)
    console.log(issues)
  },
}

module.exports = command
