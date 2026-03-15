export function createSSEStream(
  url: string,
  token: string,
  onMessage: (data: string) => void,
  onDone?: () => void,
): () => void {
  const source = new EventSource(`${url}?token=${encodeURIComponent(token)}`)

  source.onmessage = (e) => {
    onMessage(e.data)
  }

  source.onerror = () => {
    source.close()
    onDone?.()
  }

  return () => source.close()
}
