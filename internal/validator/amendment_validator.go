package validator

import "strings"

func AmendmentType(value string) bool {
	return value == "add" || value == "update" || value == "remove"
}

func RequiredText(value string) bool {
	return strings.TrimSpace(value) != ""
}
