package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/model"
)

// contextKey is used for storing values in request context.
type contextKey string

const (
	// UserIDKey is the context key for the authenticated user's ID.
	UserIDKey contextKey = "user_id"
)

// AuthMiddleware creates HTTP middleware that validates the session cookie and
// injects the user ID into the request context. Unauthenticated requests
// receive a 401 response.
func AuthMiddleware(sessionModel *model.SessionModel) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session_id")
			if err != nil {
				writeUnauthorized(w)
				return
			}

			session, err := sessionModel.FindByID(cookie.Value)
			if err != nil {
				writeUnauthorized(w)
				return
			}
			if session == nil || time.Now().UTC().After(session.ExpiresAt) {
				writeUnauthorized(w)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, session.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID extracts the authenticated user ID from the request context.
// Returns empty string if not present.
func GetUserID(r *http.Request) string {
	userID, _ := r.Context().Value(UserIDKey).(string)
	return userID
}

// writeUnauthorized responds with a 401 Unauthorized JSON payload.
func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"code":401,"message":"UNAUTHORIZED"}`))
}
