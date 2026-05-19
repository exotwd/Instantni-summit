export {}
export async function api(path, options = {}) {
  const init = { ...options };
  init.headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (init.body && typeof init.body !== "string") init.body = JSON.stringify(init.body);
  const res = await fetch(path, init);
  let data = null;
  const text = await res.text();
  if (text) data = JSON.parse(text);
  if (!res.ok) {
    const message = data?.error?.message || "Požadavek selhal.";
    throw new Error(message);
  }
  return data;
}

export function events(role, onEvent, onStatus) {
  let source;
  const connect = () => {
    onStatus?.("connecting");
    source = new EventSource(`/api/events?role=${role}`);
    source.onopen = () => onStatus?.("connected");
    source.onerror = () => onStatus?.("disconnected");
    const types = ["voting.updated","voting.closed","voting.reopened","voting.saved","voting.cancelled","speaker.updated","resolution.updated","attendance.updated","layout.updated","break.started","break.ended","debate.updated","settings.updated","agenda.updated","reset.performed"];
    types.forEach((type) => source.addEventListener(type, (event) => onEvent(JSON.parse(event.data))));
  };
  connect();
  return () => source?.close();
}
