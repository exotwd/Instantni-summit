export const revisions = {
  voting: 0,
  speaker: 0,
  resolution: 0,
  attendance: 0,
  layout: 0,
  break: 0,
  debate: 0,
  settings: 0,
  agenda: 0
};

const eventToKey = {
  "voting.updated": "voting",
  "voting.closed": "voting",
  "voting.reopened": "voting",
  "voting.saved": "voting",
  "voting.cancelled": "voting",
  "speaker.updated": "speaker",
  "resolution.updated": "resolution",
  "attendance.updated": "attendance",
  "layout.updated": "layout",
  "break.started": "break",
  "break.ended": "break",
  "debate.updated": "debate",
  "settings.updated": "settings",
  "agenda.updated": "agenda",
  "reset.performed": "settings"
};

export function acceptEvent(event) {
  const key = eventToKey[event.type];
  if (!key) return true;
  if (event.revision <= (revisions[key] || 0)) return false;
  revisions[key] = event.revision;
  return true;
}
