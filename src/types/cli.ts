export interface GraphOptions {
  project: string[]
  completed?: boolean
  cancelled?: boolean
  duplicates?: boolean
  clusterBy?: 'cycle'
  hideExternal?: boolean
  svg?: string
  png?: string
}
