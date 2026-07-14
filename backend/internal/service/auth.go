package service

import (
	"errors"
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/middleware"
	"github.com/Androidown/habit-tracking/backend/internal/model"
	"golang.org/x/crypto/bcrypt"
)

const (
	bcryptCost       = 12
	sessionDuration  = 24 * time.Hour // Session valid for 24 hours
)


// RegisterOutput is the result of a successful registration.
type RegisterOutput struct {
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
func (s *AuthService) Register(req *middleware.RegisterRequest) (*RegisterOutput, error) {
	// 1. Validate request parameters
	if errs := middleware.ValidateRegister(req); len(errs) > 0 {
		return nil, &ServiceError{
			Code:    1001,
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
			Code:    1002,
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

