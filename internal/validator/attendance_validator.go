package validator

func DelegationID(id int64) bool {
	return id > 0
}
