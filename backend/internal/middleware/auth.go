package middleware

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/Androidown/habit-tracking/backend/internal/model"
	"github.com/Androidown/habit-tracking/backend/internal/service"
)

// contextKey is a private type to avoid context key collisions.
type contextKey int

const (
	// ContextKeyUser is the key for the authenticated user in the request context.
	ContextKeyUser contextKey = iota
	// ContextKeySessionID is the key for the session ID in the request context.
	ContextKeySessionID
)

// GetUser extracts the authenticated User from a context.
// Returns nil if the context does not carry a user.
func GetUser(ctx context.Context) *model.User {
	u, _ := ctx.Value(ContextKeyUser).(*model.User)
	return u
}

// GetSessionID extracts the session ID from a context.
func GetSessionID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(ContextKeySessionID).(string)
	return id, ok
}

// AuthMiddleware validates the session cookie and injects the user into the request context.
type AuthMiddleware struct {
	authService *service.AuthService
}

// NewAuthMiddleware creates a new AuthMiddleware.
func NewAuthMiddleware(authService *service.AuthService) *AuthMiddleware {
	return &AuthMiddleware{authService: authService}
}

// Authenticate is an HTTP middleware that checks for a valid session cookie.
func (m *AuthMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_id")
		if err != nil {
			writeError(w, http.StatusUnauthorized, service.ErrUnauthorized)
			return
		}

		sessionID := cookie.Value
		if sessionID == "" {
			writeError(w, http.StatusUnauthorized, service.ErrUnauthorized)
			return
		}

		user, err := m.authService.ValidateSession(sessionID)
		if err != nil {
			if se := service.AsServiceError(err); se != nil {
				writeError(w, statusCodeForServiceCode(se.Code), se)
				return
			}
			log.Printf("session validation error: %v", err)
			writeError(w, http.StatusUnauthorized, service.ErrUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), ContextKeyUser, user)
		ctx = context.WithValue(ctx, ContextKeySessionID, sessionID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func statusCodeForServiceCode(code int) int {
	switch code {
	case service.CodeInvalidCredentials:
		return http.StatusUnauthorized
	case service.CodeUnauthorized:
		return http.StatusUnauthorized
	default:
		return http.StatusInternalServerError
	}
}

func writeError(w http.ResponseWriter, status int, se *service.ServiceError) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    se.Code,
		"message": se.Message,
		"data":    nil,
	})
}
