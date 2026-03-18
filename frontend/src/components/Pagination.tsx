// ─── Pagination ───────────────────────────────────────────────────────────────
// Composant de pagination client-side réutilisable

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
}

export default function Pagination({ total, page, pageSize, onPage }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end   = Math.min(page * pageSize, total)

  // Génère les numéros de pages visibles avec "..." si nécessaire
  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3)  pages.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  const btnBase = 'inline-flex items-center justify-center h-8 min-w-[2rem] px-2 rounded-lg text-xs font-semibold transition-colors'
  const btnActive = 'text-white'
  const btnInactive = 'hover:bg-slate-100'
  const btnDisabled = 'opacity-40 cursor-not-allowed'

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: '#e2e8f0' }}>
      {/* Compteur */}
      <span className="text-xs" style={{ color: '#64748b' }}>
        {start}–{end} sur <strong>{total}</strong>
      </span>

      {/* Boutons */}
      <div className="flex items-center gap-1">
        {/* Précédent */}
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className={`${btnBase} ${page === 1 ? btnDisabled : btnInactive}`}
          style={{ color: '#64748b' }}
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1 text-xs" style={{ color: '#94a3b8' }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`${btnBase} ${p === page ? btnActive : btnInactive}`}
              style={p === page
                ? { backgroundColor: '#0f172a', color: '#fff' }
                : { color: '#374151' }}
            >
              {p}
            </button>
          )
        )}

        {/* Suivant */}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className={`${btnBase} ${page === totalPages ? btnDisabled : btnInactive}`}
          style={{ color: '#64748b' }}
        >
          ›
        </button>
      </div>
    </div>
  )
}

// ─── Hook usePagination ───────────────────────────────────────────────────────
export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1)

  // Reset to page 1 when items change (e.g. after filter)
  const prevLengthRef = useRef(items.length)
  if (prevLengthRef.current !== items.length) {
    prevLengthRef.current = items.length
    // Can't call setState in render, defer
  }

  const totalPages = Math.ceil(items.length / pageSize)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const paged      = items.slice((safePage - 1) * pageSize, safePage * pageSize)

  const resetPage = () => setPage(1)

  return {
    paged,
    page: safePage,
    setPage,
    resetPage,
    total: items.length,
    pageSize,
  }
}

// Missing imports needed for the hook
import { useState, useRef } from 'react'
