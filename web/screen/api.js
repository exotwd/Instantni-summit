export async function api(path, options = {}) {
  const init = { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } };
  if (init.body && typeof init.body !== "string") init.body = JSON.stringify(init.body);
  const res = await fetch(path, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const preview = text.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(`Server nevrátil JSON odpověď (${res.status}). ${preview || "Prázdná odpověď."}`);
    }
  }
  if (!res.ok) throw new Error(data?.error?.message || `Požadavek selhal (${res.status}).`);
  return data;
}

export function events(onEvent, onStatus) {
  const source = new EventSource("/api/events?role=screen");
  source.onopen = () => onStatus("connected");
  source.onerror = () => onStatus("disconnected");
  ["voting.updated","voting.closed","voting.reopened","voting.saved","voting.cancelled","speaker.updated","resolution.updated","layout.updated","break.started","break.ended","debate.updated","settings.updated","reset.performed"].forEach(type => {
    source.addEventListener(type, e => onEvent(JSON.parse(e.data)));
  });
  return () => source.close();
}
