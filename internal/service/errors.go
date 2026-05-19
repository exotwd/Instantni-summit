package service

type UserError struct {
	Code    string
	Message string
}

func (e UserError) Error() string {
	return e.Message
}

func NewUserError(code, message string) error {
	return UserError{Code: code, Message: message}
}
