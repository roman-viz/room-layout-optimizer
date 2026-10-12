import { AlertTriangle, Check, X } from 'lucide-react'
import { roomAreaCm2 } from '../domain/geometry'
import type { FurnitureItem, Room, WallOpening, Placement } from '../domain/models'
import type { LayoutSuggestion, OptimizationMode, OptimizationResult } from '../optimizer/types'
import { modeLabels } from '../optimizer/scoring'
import { SuggestionPreview } from './SuggestionPreview'
import { OptimizationGoal } from '../domain/enums'

const optimizerModes: OptimizationMode[] = [OptimizationGoal.Balanced, OptimizationGoal.Natural, OptimizationGoal.FreeSpace]

export function OptimizerDialog({
  busy,
  progress,
  result,
  room,
  furniture,
  openings,
  selectedSuggestion,
  onSelectSuggestion,
  onApply,
  onClose,
  onCancel,
}: {
  busy: boolean
  progress: number
  result: OptimizationResult | null
  room: Room
  furniture: FurnitureItem[]
  openings: WallOpening[]
  selectedSuggestion: string | null
  onSelectSuggestion: (suggestion: LayoutSuggestion) => void
  onApply: (placements: Placement[]) => void
  onClose: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="app-modal optimizer-modal" role="dialog" aria-modal="true" aria-labelledby="optimizer-title">
        <header className="modal-header">
          <div><p className="eyebrow">ROOMIZE OPTIMIZER</p><h2 id="optimizer-title">Find a better layout</h2></div>
          <button className="icon-button" aria-label="Close optimizer" disabled={busy} onClick={onClose}><X size={17} /></button>
        </header>
        <div className="optimizer-content">
          <p className="optimizer-description">Compare balanced, natural, and open-floor plans. Roomize searches all three goals at once and shows only the distinct layouts it can find.</p>
          {busy && (
            <div className="optimizer-actions">
              <span className="optimizer-progress-label">Finding layouts for all goals…</span>
              <div className="progress-track" role="progressbar" aria-label="Optimization progress" aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${Math.max(4, progress * 100)}%` }} /></div>
            </div>
          )}
          {result && (
            <div className="optimizer-results" aria-live="polite">
              {result.conflicts.map((conflict, index) => <p className="optimizer-warning" key={index}><AlertTriangle size={14} /> {conflict}</p>)}
              {result.suggestions.length > 0 ? (
                <>
                  <p className="suggestion-legend-title">OBJECTS IN LAYOUTS</p>
                  <div className="suggestion-preview-legend" aria-label="Furniture in suggested layouts">
                    {furniture.map((item) => (
                      <span className="suggestion-preview-name" key={item.id} title={item.name}>
                        <span className="suggestion-preview-swatch" style={{ backgroundColor: item.color ?? '#aab5aa' }} />
                        <span>{item.name}</span>
                      </span>
                    ))}
                  </div>
                  <div className="suggestion-scroll" aria-label="Suggested layouts">
                    <div className="suggestion-columns">
                      {optimizerModes.map((mode) => {
                        const suggestions = result.suggestions.filter((suggestion) => suggestion.mode === mode)
                        if (suggestions.length === 0) return null
                        return (
                          <section className="optimizer-mode-column" key={mode} aria-label={`${modeLabels[mode].name} layouts`}>
                            <header className="optimizer-mode-heading">
                              <strong>{modeLabels[mode].name}</strong>
                              <span>{modeLabels[mode].description}</span>
                              <small>{suggestions.length} {suggestions.length === 1 ? 'layout' : 'layouts'}</small>
                            </header>
                            <div className="suggestion-list">
                              {suggestions.map((suggestion, index) => {
                                const rank = index + 1
                                return (
                                  <article
                                    key={suggestion.id}
                                    data-mode={suggestion.mode}
                                    className={`suggestion-card${selectedSuggestion === suggestion.id ? ' is-selected' : ''}`}
                                  >
                                    <button
                                      type="button"
                                      className="suggestion-preview-button"
                                      aria-label={`Preview layout ${rank}: ${suggestion.rating}, ${modeLabels[suggestion.mode].name}`}
                                      aria-pressed={selectedSuggestion === suggestion.id}
                                      onClick={() => onSelectSuggestion(suggestion)}
                                    >
                                      <span className="suggestion-card-heading">
                                        <strong>Layout {String(rank).padStart(2, '0')}</strong>
                                        {rank === 1 && <span className="suggestion-recommended">TOP PICK</span>}
                                      </span>
                                      <SuggestionPreview room={room} furniture={furniture} openings={openings} suggestion={suggestion} />
                                      <span className="suggestion-rating">
                                        <span>{suggestion.rating}</span>
                                        <strong>{Math.round(suggestion.total * 100)}%</strong>
                                        <span className="suggestion-stars" aria-label={`${suggestion.stars} out of 5 stars`}>{'★'.repeat(suggestion.stars)}{'☆'.repeat(5 - suggestion.stars)}</span>
                                      </span>
                                      <span className="suggestion-metrics">
                                        <span><strong>{suggestion.freeSpacePercent.toFixed(0)}%</strong><small>floor free</small></span>
                                        <span><strong>{(roomAreaCm2(room) * suggestion.freeSpacePercent / 1000000).toFixed(1)} m²</strong><small>open area</small></span>
                                        <span><strong>{suggestion.movedCount}</strong><small>moved</small></span>
                                      </span>
                                    </button>
                                    <button type="button" className="suggestion-apply-button" onClick={() => onApply(suggestion.placements)}>
                                      <Check size={14} /> Apply layout
                                    </button>
                                  </article>
                                )
                              })}
                            </div>
                          </section>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="optimizer-empty">
                  <AlertTriangle size={17} />
                  <p>{result.conflicts[0] ?? result.notes.join(' ') ?? 'No valid alternative layout was found.'}</p>
                </div>
              )}
            </div>
          )}
        </div>
        <footer className="optimizer-modal-footer">
          {result?.suggestions.length ? (
            <>
              <div className="optimizer-selected-details">
                {result.suggestions.find((suggestion) => suggestion.id === selectedSuggestion)?.advantages.slice(0, 1).map((advantage) => <p className="suggestion-detail" key={advantage}><Check size={13} /> {advantage}</p>)}
                {result.suggestions.find((suggestion) => suggestion.id === selectedSuggestion)?.tradeoffs.slice(0, 1).map((tradeoff) => <p className="optimizer-note" key={tradeoff}>{tradeoff}</p>)}
              </div>
              <div className="modal-actions">
                <button className="secondary-button" onClick={onClose}>Discard preview</button>
                <button
                  className="primary-button"
                  disabled={!selectedSuggestion}
                  onClick={() => {
                    const chosen = result.suggestions.find((suggestion) => suggestion.id === selectedSuggestion)
                    if (chosen) onApply(chosen.placements)
                  }}
                ><Check size={15} /> Apply layout</button>
              </div>
            </>
          ) : busy ? (
            <button className="secondary-button" onClick={onCancel}>Cancel</button>
          ) : (
            <button className="secondary-button" onClick={onClose}>Close</button>
          )}
        </footer>
      </section>
    </div>
  )
}
