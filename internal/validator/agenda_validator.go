package validator

func AgendaTitle(title string) bool {
	return RequiredText(title)
}
