import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { Violation } from '../domain/validation'

export function PlacementIssuesPanel({ issues }: { issues: Violation[] }) {
  const [expanded, setExpanded] = useState(true)

  if (issues.length === 0) return null

  return (
    <section className={`placement-issues${expanded ? '' : ' is-collapsed'}`} role="status" aria-label="Placement issues">
      <button
        className="placement-issues-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <strong><AlertTriangle size={14} /> Placement issues ({issues.length})</strong>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="placement-issues-list">
          {issues.slice(0, 4).map((issue, index) => <p key={`${issue.itemId}-${index}`}>{issue.message}</p>)}
          {issues.length > 4 && <p className="placement-issues-more">And {issues.length - 4} more</p>}
        </div>
      )}
    </section>
  )
}
