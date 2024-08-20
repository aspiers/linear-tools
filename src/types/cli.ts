export interface GraphOptions {
  project: string[]
  completed?: boolean
  cancelled?: boolean
  duplicates?: boolean
  clusterBy?: 'cycle' | 'project'
  hideExternal?: boolean
  svg?: string
  png?: string
}

export interface LabelDemoteOptions {
  label: string
  team: string
}
