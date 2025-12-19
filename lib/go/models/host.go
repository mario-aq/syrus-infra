package models

// Host represents a whitelisted Discord user
type Host struct {
	ID     string `json:"id" dynamodbav:"id"`
	Source string `json:"source" dynamodbav:"source"`
	Name   string `json:"name,omitempty" dynamodbav:"name,omitempty"`
}
