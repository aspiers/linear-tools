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
    print.error(`Got no data field in response: ${data}`)
    return null
  }

  if (!data.data.projects) {
    print.error(`Got no data.projects field in response: ${data}`)
    return null
  }

  if (!data.data.projects.nodes) {
    print.error(`Got no data.projects.nodes field in response: ${data}`)
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
    print.info(project)
  },
}

module.exports = command
