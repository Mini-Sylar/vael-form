/** An issue as the schema said it: the message may still be an i18n key. */
export interface RawIssue {
  path: string
  message: string
  /** The schema library's own issue and its name, to find the catalog key from. */
  source?: object
  vendor?: string
}

export type IssueMap = ReadonlyMap<string, readonly RawIssue[]>

export const EMPTY_ISSUES: IssueMap = new Map()

/** Groups issues by path, reusing the previous arrays (and map) when nothing changed. */
export function groupIssues(issues: readonly RawIssue[], previous: IssueMap): IssueMap {
  if (!issues.length) return previous.size ? EMPTY_ISSUES : previous
  const next = new Map<string, RawIssue[]>()
  for (const issue of issues) {
    const list = next.get(issue.path)
    if (list) list.push(issue)
    else next.set(issue.path, [issue])
  }
  let same = next.size === previous.size
  for (const [path, list] of next) {
    const old = previous.get(path)
    if (old && old.length === list.length && old.every((o, i) => o.message === list[i]!.message))
      next.set(path, old as RawIssue[])
    else same = false
  }
  return same ? previous : next
}

/** The lists joined; the one list itself when the others are empty, so a cutoff can see no change. */
export function joinIssues(...lists: (readonly RawIssue[] | undefined)[]): readonly RawIssue[] {
  const filled = lists.filter((list): list is readonly RawIssue[] => !!list?.length)
  return filled.length > 1 ? filled.flat() : (filled[0] ?? NO_ISSUES)
}

const NO_ISSUES: readonly RawIssue[] = []

/** A rule's error: its text, or a schema's issue kept whole so the app's catalog can name it. */
export type Message = string | { message: string; source: object; vendor: string }

/** The messages a rule's result stands for: `true`, `false` and nothing are a pass. */
export function messagesOf(result: unknown): Message[] {
  const list =
    typeof result === 'string' ? [result] : Array.isArray(result) ? (result as unknown[]) : []
  return list.filter(
    (message): message is Message =>
      (typeof message === 'string' && message !== '') ||
      (typeof message === 'object' && message !== null && 'source' in message),
  )
}
