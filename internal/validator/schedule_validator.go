package validator

func AgendaType(value string) bool {
	switch value {
	case "session", "break", "caucus", "voting", "organizational", "other":
		return true
	default:
		return false
	}
}
