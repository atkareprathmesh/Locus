import { Component, type ErrorInfo, type ReactNode } from 'react'
import { store } from '../lib/storage'
import { LocusLogo } from './Logo'

type Props = { children: ReactNode }
type S = { error: Error | null }

/** Includes the pre-rename `jarvis.*` names so a reset also clears data that
 *  crashed before the Locus migration had a chance to run. */
const RESET_KEYS = [
  'locus.v1',
  'locus.bg',
  'locus.devBoards',
  'jarvis.v1',
  'jarvis.bg',
  'jarvis.devBoards',
]

export class ErrorBoundary extends Component<Props, S> {
  state: S = { error: null }

  static getDerivedStateFromError(error: Error): S {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Locus crashed:', error, info.componentStack)
  }

  private reset = async (withData: boolean) => {
    if (withData) {
      for (const key of RESET_KEYS) await store.remove(key)
    }
    location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(120% 90% at 18% 8%, #21405e 0%, #16283c 42%, #0f1a26 72%, #0b1119 100%)',
          fontFamily: "'Manrope', system-ui, sans-serif",
          color: '#fff',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 440,
            background: 'rgba(18,23,32,.8)',
            backdropFilter: 'blur(30px)',
            border: '1px solid rgba(255,255,255,.13)',
            borderRadius: 20,
            padding: '26px 28px',
            boxShadow: '0 28px 70px rgba(0,0,0,.5)',
          }}
        >
          <div style={{ marginBottom: 16, opacity: 0.85 }}>
            <LocusLogo size={22} color="#fff" />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Locus hit an error loading your data</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.7)', marginBottom: 18 }}>
            Usually a bad import file. Reset clears Locus's notes, tasks, habits, journal and background — your Chrome
            bookmarks are never touched.
          </div>
          <pre
            style={{
              fontSize: 11,
              lineHeight: 1.5,
              color: 'rgba(255,180,170,.9)',
              background: 'rgba(0,0,0,.25)',
              borderRadius: 10,
              padding: '10px 12px',
              overflow: 'auto',
              maxHeight: 120,
              marginBottom: 18,
              whiteSpace: 'pre-wrap',
            }}
          >
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => this.reset(false)}
              style={{
                border: '1px solid rgba(255,255,255,.16)',
                background: 'rgba(255,255,255,.06)',
                color: '#fff',
                borderRadius: 10,
                padding: '9px 16px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <button
              onClick={() => this.reset(true)}
              style={{
                border: 0,
                background: 'rgba(239,80,72,.9)',
                color: '#fff',
                borderRadius: 10,
                padding: '9px 16px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset Locus data
            </button>
          </div>
        </div>
      </div>
    )
  }
}
