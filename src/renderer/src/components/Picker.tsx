import { Combobox, Option } from '@fluentui/react-components'
import { useState } from 'react'

export interface PickItem {
  id: string
  label: string
  secondary?: string
}

/** Searchable single-select combobox. */
export function Picker(props: {
  items: PickItem[]
  value?: string | null
  placeholder?: string
  onChange(id: string | null): void
  clearable?: boolean
  style?: React.CSSProperties
}) {
  const current = props.items.find((i) => i.id === props.value)
  const [query, setQuery] = useState<string | null>(null)
  const text = query ?? current?.label ?? ''
  const q = (query ?? '').toLowerCase()
  const matches = props.items
    .filter((i) => !q || i.label.toLowerCase().includes(q) || i.secondary?.toLowerCase().includes(q))
    .slice(0, 50)
  return (
    <Combobox
      style={props.style}
      placeholder={props.placeholder}
      value={text}
      selectedOptions={props.value ? [props.value] : []}
      clearable={props.clearable}
      onChange={(e) => setQuery(e.target.value)}
      onOptionSelect={(_, d) => {
        setQuery(null)
        props.onChange(d.optionValue ?? null)
      }}
      onBlur={() => setQuery(null)}
    >
      {matches.map((i) => (
        <Option key={i.id} value={i.id} text={i.label}>
          <div>
            <div>{i.label}</div>
            {i.secondary && <div style={{ fontSize: 12, opacity: 0.7 }}>{i.secondary}</div>}
          </div>
        </Option>
      ))}
      {!matches.length && <Option disabled value="__none" text="">No matches</Option>}
    </Combobox>
  )
}
