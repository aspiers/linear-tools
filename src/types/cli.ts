export interface GraphOptions {
  project: string[]
  completed?: boolean
  cancelled?: boolean
  duplicates?: boolean
  clusterCycles?: boolean
  hideExternal?: boolean
  svg?: string
  png?: string
}
