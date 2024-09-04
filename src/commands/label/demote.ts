import { LinearClient, Issue, IssueLabel, Team } from '@linear/sdk'

import { LabelDemoteOptions } from '../../types/cli'
import { die } from '../../utils'

export default async function demote(
  options: LabelDemoteOptions,
): Promise<void> {
  try {
    const client = await getLinearClient()

    const workspaceLabel = await fetchWorkspaceLabelByName(
      client,
      options.label,
    )
    const workspaceParentLabel = await getWorkspaceParentLabel(
      client,
      workspaceLabel,
    )
    const team = await fetchTeam(client, options.team)
    const teamParentLabel =
      workspaceParentLabel &&
      (await ensureTeamParentLabel(client, workspaceParentLabel, team))
    const teamLabel = await ensureTeamLabel(
      client,
      workspaceLabel,
      team,
      teamParentLabel,
    )

    await migrateIssues(client, workspaceLabel, teamLabel)

    await deleteLabel(client, workspaceLabel)
    await renameLabel(client, teamLabel, workspaceLabel.name)
  } catch (error: unknown) {
    die(String(error))
  }
}

async function migrateIssues(
  client: LinearClient,
  workspaceLabel: IssueLabel,
  teamLabel: IssueLabel,
) {
  while (true) {
    const issues = await fetchIssuesWithLabel(client, workspaceLabel)
    if (issues.length === 0) return

    console.log(
      `${issues.length} issue(s) still have workspace label ${workspaceLabel.name}.`,
    )

    const { added, removed } = await migrateIssuesToTeamLabel(
      client,
      issues,
      workspaceLabel,
      teamLabel,
    )
    console.log(
      `Team label added to ${added} issues; workspace label ${workspaceLabel.name} removed from ${removed} issues`,
    )
  }
}

async function getLinearClient(): Promise<LinearClient> {
  return new LinearClient({ apiKey: process.env.LINEAR_API_KEY })
}

async function fetchWorkspaceLabelByName(
  client: LinearClient,
  labelName: string,
): Promise<IssueLabel> {
  const labels = await client.issueLabels({
    filter: {
      name: { eq: labelName },
      team: { null: true }, // Workspace labels don't belong to a specific team
    },
  })

  if (labels.nodes.length === 0) {
    die(`Workspace label "${labelName}" not found`)
  }
  return labels.nodes[0]
}

async function fetchLabelById(
  client: LinearClient,
  labelId: string,
): Promise<IssueLabel> {
  const labels = await client.issueLabels({
    filter: {
      id: { eq: labelId },
    },
  })

  if (labels.nodes.length === 0) {
    die(`Label ${labelId} not found`)
  }
  return labels.nodes[0]
}

async function fetchTeam(
  client: LinearClient,
  teamName: string,
): Promise<Team> {
  const teams = await client.teams({
    filter: {
      name: { eq: teamName },
    },
  })

  if (teams.nodes.length === 0) {
    die(`Team "${teamName}" not found`)
  }
  return teams.nodes[0]
}

async function getWorkspaceParentLabel(
  client: LinearClient,
  workspaceLabel: IssueLabel,
): Promise<IssueLabel | null> {
  const parent = await workspaceLabel.parent
  if (!parent) {
    console.log(
      `Workspace label "${workspaceLabel.name}" doesn't have a parent`,
    )
    return null
  }
  const workspaceParentLabel = await fetchLabelById(client, parent.id)
  return workspaceParentLabel
}

// If workspaceLabel has a parent, make sure there is a corresponding
// team parent label.
async function ensureTeamParentLabel(
  client: LinearClient,
  workspaceParentLabel: IssueLabel,
  team: Team,
): Promise<IssueLabel | null> {
  const teamParentLabelName = getTeamLabelName(
    workspaceParentLabel.name,
    team.name,
  )
  const teamParentLabel = await fetchTeamLabel(
    client,
    teamParentLabelName,
    team,
  )
  if (teamParentLabel) {
    console.log(
      `Team parent label "${teamParentLabel.name}" already exists: `,
      teamParentLabel.id,
    )
    return teamParentLabel
  }
  const newTeamParentLabel = await createTeamLabel(
    client,
    workspaceParentLabel,
    team,
  )
  console.log(`Created new team parent label "${newTeamParentLabel.name}"`)
  return newTeamParentLabel
}

async function ensureTeamLabel(
  client: LinearClient,
  workspaceLabel: IssueLabel,
  team: Team,
  teamParentLabel: IssueLabel | null,
): Promise<IssueLabel> {
  const teamLabelName = getTeamLabelName(workspaceLabel.name, team.name)
  const teamLabel = await fetchTeamLabel(client, teamLabelName, team)
  if (teamLabel) {
    console.log('Team label already exists: ', teamLabel.id)
    return teamLabel
  }
  return await createTeamLabel(client, workspaceLabel, team, teamParentLabel)
}

async function fetchTeamLabel(
  client: LinearClient,
  labelName: string,
  team: Team,
): Promise<IssueLabel | null> {
  const labels = await client.issueLabels({
    filter: {
      name: { eq: labelName },
      team: { id: { eq: team.id } },
    },
  })

  if (labels.nodes.length === 0) {
    return null
  }
  if (labels.nodes.length > 1) {
    die(
      `Found ${labels.nodes.length} labels called ${labelName} in team ${team.id}`,
    )
  }
  return labels.nodes[0]
}

async function createTeamLabel(
  client: LinearClient,
  workspaceLabel: IssueLabel,
  team: Team,
  teamParentLabel?: IssueLabel | null,
): Promise<IssueLabel> {
  const newLabelName = getTeamLabelName(workspaceLabel.name, team.name)
  const payload = await client.createIssueLabel({
    name: newLabelName,
    teamId: team.id,
    color: workspaceLabel.color,
    parentId: teamParentLabel?.id,
  })
  const newLabel = payload.issueLabel
  if (!newLabel) {
    die(`Failed to create label ${newLabelName} for team ${team.name}`)
  }
  console.log(`Team label "${newLabelName}" created for team ${team.name}`)
  return newLabel
}

async function deleteLabel(
  client: LinearClient,
  label: IssueLabel,
): Promise<void> {
  const payload = await client.deleteIssueLabel(label.id)
  if (payload.success) {
    console.log(`Deleted label "${label.name}" (${label.id})`)
  } else {
    die(`Failed to delete label "${label.name}"`)
  }
}

async function renameLabel(
  client: LinearClient,
  label: IssueLabel,
  newName: string,
): Promise<void> {
  const payload = await client.updateIssueLabel(label.id, { name: newName })
  if (payload.success) {
    console.log(`Renamed label "${label.name}" (${label.id}) to "${newName}"`)
  } else {
    die(`Failed to rename label "${label.name}" (${label.id}) to "${newName}"`)
  }
}

function getTeamLabelName(
  workspaceLabelName: string,
  teamName: string,
): string {
  return `${workspaceLabelName} (${teamName})`
}

async function fetchIssuesWithLabel(
  client: LinearClient,
  label: IssueLabel,
): Promise<Issue[]> {
  const issues = await client.issues({
    filter: {
      labels: { some: { id: { eq: label.id } } },
    },
  })
  return issues.nodes
}

async function migrateIssuesToTeamLabel(
  client: LinearClient,
  issues: Issue[],
  workspaceLabel: IssueLabel,
  teamLabel: IssueLabel,
): Promise<{ added: number; removed: number }> {
  console.log(`Issues to add to label ${teamLabel.name}:`)
  let added = 0
  let removed = 0
  for (const issue of issues) {
    console.log(`   ${issue.identifier} ${issue.title}`)
    let desiredlabelIds = issue.labelIds
    if (issue.labelIds.includes(teamLabel.id)) {
      console.log(`      Already contains label ${teamLabel.name}`)
    } else {
      console.log(`      Will add label ${teamLabel.name}`)
      desiredlabelIds.push(teamLabel.id)
      added += 1
    }

    if (issue.labelIds.includes(workspaceLabel.id)) {
      console.log(`      Will remove label ${workspaceLabel.name}`)
      desiredlabelIds = desiredlabelIds.filter((id) => id !== workspaceLabel.id)
      removed += 1
    } else {
      console.log(`      Doesn't have label ${workspaceLabel.name}`)
    }
    await updateIssueLabels(client, issue, desiredlabelIds)
  }
  return { added, removed }
}

async function updateIssueLabels(
  client: LinearClient,
  issue: Issue,
  newLabelIds: string[],
): Promise<void> {
  const payload = await client.updateIssue(issue.id, {
    labelIds: newLabelIds,
  })
  if (!payload.success) {
    die(`Failed to update labels for ${issue.identifier}`)
  }
}
