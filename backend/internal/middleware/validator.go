package middleware

import (
	"net/mail"
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	// usernameRegex validates: 3-20 characters, letters/digits/underscores.
	usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
)

// ValidationError describes a single field validation failure.
type ValidationError struct {
	Field  string `json:"field"`
	Reason string `json:"reason"`
}

// RegisterRequest is the expected JSON body for POST /api/v1/auth/register.
type RegisterRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// ValidateRegister checks all registration fields and returns validation errors.
// Returns nil if all fields are valid.
func ValidateRegister(req *RegisterRequest) []ValidationError {
	var errs []ValidationError

	// Email validation
	if strings.TrimSpace(req.Email) == "" {
		errs = append(errs, ValidationError{Field: "email", Reason: "required"})
	} else if !isValidEmail(req.Email) {
		errs = append(errs, ValidationError{Field: "email", Reason: "invalid format"})
	}

	// Username validation
	username := strings.TrimSpace(req.Username)
	if username == "" {
		errs = append(errs, ValidationError{Field: "username", Reason: "required"})
	} else {
		usernameLen := utf8.RuneCountInString(username)
		if usernameLen < 3 || usernameLen > 20 {
			errs = append(errs, ValidationError{Field: "username", Reason: "must be 3-20 characters"})
		} else if !usernameRegex.MatchString(username) {
			errs = append(errs, ValidationError{Field: "username", Reason: "only letters, digits, and underscores allowed"})
		}
	}

	// Password validation
	if req.Password == "" {
		errs = append(errs, ValidationError{Field: "password", Reason: "required"})
	} else if utf8.RuneCountInString(req.Password) < 8 {
		errs = append(errs, ValidationError{Field: "password", Reason: "must be at least 8 characters"})
	} else if utf8.RuneCountInString(req.Password) > 128 {
		errs = append(errs, ValidationError{Field: "password", Reason: "must be at most 128 characters"})
	}

	return errs
}

// isValidEmail checks if the string is a valid email address format.
func isValidEmail(email string) bool {
	addr, err := mail.ParseAddress(email)
	if err != nil {
		return false
	}
	// mail.ParseAddress accepts "Name <email>" format, so ensure it's just an email.
	if addr.Name != "" {
		return false
	}
	// Must contain @ and a domain part.
	parts := strings.SplitN(addr.Address, "@", 2)
	if len(parts) != 2 {
		return false
	}
	if strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return false
	}
	// Domain must contain at least one dot.
	if !strings.Contains(parts[1], ".") {
		return false
	}
	return true
}
