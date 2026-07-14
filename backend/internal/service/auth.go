package service

import (
	"errors"
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/model"
	"golang.org/x/crypto/bcrypt"
)

const (
	bcryptCost      = 12
	sessionDuration = 24 * time.Hour // Session valid for 24 hours
)

// Error codes for authentication.
const (
	CodeSuccess            = 0
	CodeValidationError    = 1001
	CodeEmailAlreadyExists = 1002
	CodeInvalidCredentials = 1003
	CodeUnauthorized       = 1004
)

// Predefined auth errors.
var (
	ErrInvalidCredentials = &ServiceError{Code: CodeInvalidCredentials, Message: "INVALID_CREDENTIALS"}
	ErrUnauthorized       = &ServiceError{Code: CodeUnauthorized, Message: "UNAUTHORIZED"}
)

// RegisterOutput is the result of a successful registration.
type RegisterOutput struct {
	User    *model.User
	Session *model.Session
}

// LoginOutput is the result of a successful login.
type LoginOutput struct {
	User    *model.User
	Session *model.Session
}

// AuthService handles authentication business logic.
type AuthService struct {
	userModel    *model.UserModel
	sessionModel *model.SessionModel
}

// NewAuthService creates a new AuthService.
func NewAuthService(userModel *model.UserModel, sessionModel *model.SessionModel) *AuthService {
	return &AuthService{
		userModel:    userModel,
		sessionModel: sessionModel,
	}
}

// Register performs user registration: validates input, checks email uniqueness,
// hashes password, creates user and session records.
func (s *AuthService) Register(req *RegisterRequest) (*RegisterOutput, error) {
	// 1. Validate request parameters
	if errs := ValidateRegister(req); len(errs) > 0 {
		return nil, &ServiceError{
			Code:    CodeValidationError,
			Message: "VALIDATION_ERROR",
			Data:    errs,
		}
	}

	// 2. Check email uniqueness
	existing, err := s.userModel.FindByEmail(req.Email)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}
	if existing != nil {
		return nil, &ServiceError{
			Code:    CodeEmailAlreadyExists,
			Message: "EMAIL_ALREADY_EXISTS",
		}
	}

	// 3. Hash password with bcrypt
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcryptCost)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}

	// 4. Create user
	user, err := s.userModel.Create(req.Email, req.Username, string(passwordHash))
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}

	// 5. Create session
	session, err := s.sessionModel.Create(user.ID, time.Now().UTC().Add(sessionDuration))
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}

	return &RegisterOutput{
		User:    user,
		Session: session,
	}, nil
}

// Login authenticates a user by email and password. Returns the user and a new session.
// Returns ErrInvalidCredentials for wrong email or password (indistinguishable).
func (s *AuthService) Login(email, password string) (*LoginOutput, error) {
	user, err := s.userModel.FindByEmail(email)
	if err != nil {
		return nil, &ServiceError{Code: 9999, Message: "INTERNAL_ERROR"}
	}
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	session, err := s.sessionModel.Create(user.ID, time.Now().UTC().Add(sessionDuration))
	if err != nil {
		return nil, &ServiceError{Code: 9999, Message: "INTERNAL_ERROR"}
	}

	return &LoginOutput{
		User:    user,
		Session: session,
	}, nil
}

// Logout deletes the session with the given ID.
func (s *AuthService) Logout(sessionID string) error {
	return s.sessionModel.Delete(sessionID)
}

// ValidateSession checks if the session is valid (exists and not expired)
// and returns the associated user. Returns ErrUnauthorized if the session
// is missing, expired, or the user is not found.
func (s *AuthService) ValidateSession(sessionID string) (*model.User, error) {
	sess, err := s.sessionModel.GetByID(sessionID)
	if err != nil {
		return nil, &ServiceError{Code: 9999, Message: "INTERNAL_ERROR"}
	}
	if sess == nil || time.Now().UTC().After(sess.ExpiresAt) {
		return nil, ErrUnauthorized
	}

	user, err := s.userModel.FindByID(sess.UserID)
	if err != nil {
		return nil, &ServiceError{Code: 9999, Message: "INTERNAL_ERROR"}
	}
	if user == nil {
		return nil, ErrUnauthorized
	}

	return user, nil
}

// ServiceError represents a structured service-level error.
type ServiceError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func (e *ServiceError) Error() string {
	return e.Message
}

// IsServiceError checks if an error is a *ServiceError.
func IsServiceError(err error) bool {
	var se *ServiceError
	return errors.As(err, &se)
}

// AsServiceError unwraps a *ServiceError from an error.
func AsServiceError(err error) *ServiceError {
	var se *ServiceError
	if errors.As(err, &se) {
		return se
	}
	return nil
}

// ensure *ServiceError implements error.
var _ error = (*ServiceError)(nil)
