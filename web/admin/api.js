export async function api(path, options = {}) {
  const init = { ...options };
  init.headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (init.body && typeof init.body !== "string") init.body = JSON.stringify(init.body);

  const res = await fetch(path, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Server vrátil neplatnou JSON odpověď.");
    }
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || `Požadavek selhal (${res.status}).`);
  }
  return data;
}

export function events(role, onEvent, onStatus) {
  const source = new EventSource(`/api/events?role=${encodeURIComponent(role)}`);
  source.onopen = () => onStatus?.("connected");
  source.onerror = () => onStatus?.("disconnected");
  [
    "voting.updated", "voting.closed", "voting.reopened", "voting.saved", "voting.cancelled",
    "speaker.updated", "resolution.updated", "attendance.updated", "layout.updated",
    "break.started", "break.ended", "debate.updated", "settings.updated", "agenda.updated",
    "reset.performed"
  ].forEach((type) => {
    source.addEventListener(type, (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        onEvent({ type, revision: Date.now() });
      }
    });
  });
  return () => source.close();
}
