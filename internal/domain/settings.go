package domain

import "time"

type Setting struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type SettingsSnapshot struct {
	Revision        int64             `json:"revision"`
	Values          map[string]string `json:"values"`
	DefaultsWarning bool              `json:"defaultsWarning"`
}
