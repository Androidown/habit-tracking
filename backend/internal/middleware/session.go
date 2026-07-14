package middleware

import (
	"database/sql"
	"net/http"
	"time"
)

// SessionAuth holds the authenticated user's information.
type SessionAuth struct {
	UserID string
}

// SessionMiddleware authenticates requests via the session_id cookie.
// It looks up the session in the database and checks expiration.
type SessionMiddleware struct {
	db *sql.DB
}

// NewSessionMiddleware creates a new SessionMiddleware.
func NewSessionMiddleware(db *sql.DB) *SessionMiddleware {
	return &SessionMiddleware{db: db}
}

// Authenticate extracts and validates the session from the request.
// Returns nil if the session is missing, invalid, or expired.
// Returns a ServiceError-compatible map for error responses.
func (m *SessionMiddleware) Authenticate(r *http.Request) (*SessionAuth, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return nil, nil
	}

	sessionID := cookie.Value
	if sessionID == "" {
		return nil, nil
	}

	var userID string
	var expiresAt time.Time
	err = m.db.QueryRow(
		`SELECT user_id, expires_at FROM sessions WHERE id = ?`, sessionID,
	).Scan(&userID, &expiresAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if time.Now().UTC().After(expiresAt) {
		return nil, nil
	}

	return &SessionAuth{UserID: userID}, nil
}

// RequireAuth is an HTTP middleware that enforces authentication.
// It calls the next handler only if a valid session is present;
// otherwise it returns a 401 JSON response.
func (m *SessionMiddleware) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth, err := m.Authenticate(r)
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, "INTERNAL_ERROR")
			return
		}
		if auth == nil {
			writeAuthError(w, http.StatusUnauthorized, "UNAUTHORIZED")
			return
		}

		// Store user ID in request context for downstream handlers
		r.Header.Set("X-User-ID", auth.UserID)
		next(w, r)
	}
}

func writeAuthError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	// Manually write to avoid importing handler package (cyclic dep)
	body := `{"code":9999,"message":"` + message + `"}`
	w.Write([]byte(body))
}
