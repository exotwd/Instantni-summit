package validator

func PIN(pin string) bool {
	return len(pin) >= 4
}
