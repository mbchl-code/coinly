const paths: Record<string, string> = {
  coins: 'M9 7.5c3.6 0 6.5-1.3 6.5-3S12.6 1.5 9 1.5 2.5 2.8 2.5 4.5 5.4 7.5 9 7.5Zm-6.5-3v4c0 1.7 2.9 3 6.5 3m-6.5-3v4c0 1.7 2.9 3 6.5 3m6.5-6.5c3.6 0 6.5 1.3 6.5 3s-2.9 3-6.5 3-6.5-1.3-6.5-3 2.9-3 6.5-3Zm-6.5 3v4c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3v-4m-13 4v4c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3v-4',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  chart: 'M12 3v9l6.4 6.4M12 3a9 9 0 1 0 6.4 15.4M12 3a9 9 0 0 1 9 9h-9',
  debt: 'M16 3.5a3.5 3.5 0 1 1 0 7M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9.5c0-3.3 2.7-6 6-6s6 2.7 6 6m4-6c2.2.4 4 2.7 4 6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3c0-.5 0-1-.1-1.4l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.4-1.4L14 2h-4l-.4 2.6c-.9.3-1.7.8-2.4 1.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2.8l-2 1.6 2 3.4 2.4-.9c.7.6 1.5 1.1 2.4 1.4L10 22h4l.4-2.6c.9-.3 1.7-.8 2.4-1.4l2.4.9 2-3.4-2-1.6c.1-.4.2-.9.2-1.4Z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  up: 'M18 15l-6-6-6 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm0 4h16M8 2v4M16 2v4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  pencil: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4',
}

export function Icon({ name, size = 22, stroke = 1.8 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
