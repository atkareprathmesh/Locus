let counter = 0

/** Process-unique id string (for local/dev bookmark & board ids). */
export const uid = (prefix = 'x'): string => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`

/** Process-unique numeric id (for notes/tasks/habits). */
let numSeq = Date.now()
export const nid = (): number => ++numSeq
