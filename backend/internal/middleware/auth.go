package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

// contextKey is a private key type for context values to avoid collisions.
type contextKey string

const (
	// ContextUserID is the context key for the authenticated user ID.
	ContextUserID contextKey = "user_id"
)

// AuthMiddleware handles session-based authentication for API requests.
type AuthMiddleware struct {
	db *sql.DB
}

// NewAuthMiddleware creates a new AuthMiddleware.
func NewAuthMiddleware(db *sql.DB) *AuthMiddleware {
	return &AuthMiddleware{db: db}
}

// Authenticate is an HTTP middleware that extracts the user session from the
// session_id cookie or Authorization header (Bearer <session_id>) and injects
// the user_id into the request context.
// If authentication fails, it writes a 401 response and does not call next.
func (m *AuthMiddleware) Authenticate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionID := m.extractSessionID(r)
		if sessionID == "" {
			writeAuthError(w, http.StatusUnauthorized, "AUTH_REQUIRED", "authentication required")
			return
		}

		userID, err := m.validateSession(sessionID)
		if err != nil {
			log.Printf("auth middleware: session validation error: %v", err)
			writeAuthError(w, http.StatusUnauthorized, "AUTH_REQUIRED", "authentication required")
			return
		}
		if userID == "" {
			writeAuthError(w, http.StatusUnauthorized, "SESSION_EXPIRED", "session expired or invalid")
			return
		}

		// Inject user_id into context
		ctx := context.WithValue(r.Context(), ContextUserID, userID)
		next(w, r.WithContext(ctx))
	}
}

// GetUserID extracts the authenticated user ID from the request context.
// Returns empty string if not authenticated.
func GetUserID(r *http.Request) string {
	if userID, ok := r.Context().Value(ContextUserID).(string); ok {
		return userID
	}
	return ""
}

// extractSessionID attempts to retrieve the session ID from cookie or
// Authorization header.
func (m *AuthMiddleware) extractSessionID(r *http.Request) string {
	// Try cookie first
	cookie, err := r.Cookie("session_id")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}

	// Try Authorization header: Bearer <session_id>
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}

	return ""
}

// validateSession checks if the session exists and is not expired.
// Returns the user_id if valid, empty string if not found/expired.
func (m *AuthMiddleware) validateSession(sessionID string) (string, error) {
	var userID string
	var expiresAt time.Time

	err := m.db.QueryRow(
		`SELECT user_id, expires_at FROM sessions WHERE id = ?`,
		sessionID,
	).Scan(&userID, &expiresAt)

	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	// Check if session has expired
	if time.Now().UTC().After(expiresAt) {
		return "", nil
	}

	return userID, nil
}

// authErrorResponse is the JSON response for authentication failures.
type authErrorResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// writeAuthError writes a JSON authentication error response.
func writeAuthError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	resp := authErrorResponse{
		Code:    401,
		Message: code,
	}
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("failed to encode auth error response: %v", err)
	}
}
