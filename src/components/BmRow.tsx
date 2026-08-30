import { useState } from 'react'
import { Favicon } from './Favicon'
import { css } from '../lib/css'
import type { Bookmark } from '../types'

type Props = {
  bm: Bookmark
  dragging: boolean
  over: boolean
  canDrag: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}

const iconSx =
  "font-family:'Material Symbols Rounded'; line-height:1; font-size:15px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:6px; cursor:pointer; color:rgba(255,255,255,.45);"

export function BmRow({
  bm,
  dragging,
  over,
  canDrag,
  onOpen,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const [hot, setHot] = useState(false)
  return (
    <div
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onClick={onOpen}
      onDragOver={(e) => {
        if (!canDrag) return
        e.preventDefault()
        e.stopPropagation()
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop()
      }}
      style={{
        ...css('display:flex; align-items:center; gap:10px; border-radius:9px; padding:7px 8px; cursor:pointer; min-width:0; flex-shrink:0;'),
        background: over ? 'rgba(130,175,255,.18)' : hot ? 'rgba(255,255,255,.08)' : 'transparent',
        opacity: dragging ? 0.4 : 1,
        transition: 'background .12s, opacity .12s',
      }}
    >
      {canDrag && (
        <span
          title="Drag to reorder"
          draggable
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.stopPropagation()
            e.dataTransfer.effectAllowed = 'move'
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          style={{
            ...css(iconSx + ' cursor:grab; margin-left:-2px;'),
            opacity: hot ? 0.7 : 0.25,
            transition: 'opacity .12s',
          }}
        >
          drag_indicator
        </span>
      )}
      <Favicon
        url={bm.url}
        title={bm.title}
        size={32}
        sx="width:19px;height:19px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;background:rgba(255,255,255,.14);color:rgba(255,255,255,.85);"
      />
      <span
        style={css(
          'flex:1; min-width:0; font-size:clamp(11px,1.42vh,12.5px); font-weight:500; color:rgba(255,255,255,.8); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;',
        )}
      >
        {bm.title}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexShrink: 0,
          opacity: hot ? 1 : 0,
          transition: 'opacity .12s',
        }}
      >
        <span
          title="Edit"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          style={css(iconSx)}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.45)')}
        >
          edit
        </span>
        <span
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          style={css(iconSx)}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,140,130,.95)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.45)')}
        >
          delete_outline
        </span>
      </span>
    </div>
  )
}
