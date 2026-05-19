package validator

import "regexp"

func VoteChoice(choice string) bool {
	return choice == "for" || choice == "against" || choice == "abstain"
}

func DelegationCode(code string) bool {
	return regexp.MustCompile(`^\d{4}$`).MatchString(code)
}
