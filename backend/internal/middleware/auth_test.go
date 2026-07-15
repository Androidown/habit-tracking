package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/model"
	"github.com/Androidown/habit-tracking/backend/internal/service"
	_ "modernc.org/sqlite"
	"golang.org/x/crypto/bcrypt"
)

// setupTestDB creates an in-memory SQLite database with the required schema.
func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory database: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			username TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);
		CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
		CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
	`)
	if err != nil {
		t.Fatalf("failed to create schema: %v", err)
	}
	return db
}

// addTestUser inserts a user with a bcrypt-hashed password and returns it.
func addTestUser(db *sql.DB, email, password string) *model.User {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	userModel := model.NewUserModel(db)
	user, err := userModel.Create(email, "testuser", string(hash))
	if err != nil {
		panic(err)
	}
	return user
}

// spyHandler records whether it was called and the context user.
type spyHandler struct {
	called bool
}

func (s *spyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.called = true
	user := GetUser(r.Context())
	if user == nil {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "no user in context"})
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user_id": user.ID,
		"email":   user.Email,
	})
}

func TestAuthMiddleware_ValidSession(t *testing.T) {
	db := setupTestDB(t)
	user := addTestUser(db, "user@example.com", "password")

	sessionModel := model.NewSessionModel(db)
	sess, err := sessionModel.Create(user.ID, time.Now().Add(24*time.Hour))
	if err != nil {
		t.Fatalf("Create session failed: %v", err)
	}

	userModel := model.NewUserModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	mw := NewAuthMiddleware(authSvc)
	spy := &spyHandler{}
	handler := mw.Authenticate(spy)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sess.ID})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if !spy.called {
		t.Error("expected handler to be called")
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["user_id"] != user.ID {
		t.Errorf("expected user_id %s, got %v", user.ID, resp["user_id"])
	}
}

func TestAuthMiddleware_NoCookie(t *testing.T) {
	db := setupTestDB(t)
	userModel := model.NewUserModel(db)
	sessionModel := model.NewSessionModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	mw := NewAuthMiddleware(authSvc)

	spy := &spyHandler{}
	handler := mw.Authenticate(spy)

	req := httptest.NewRequest("GET", "/protected", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
	if spy.called {
		t.Error("handler should not be called for unauthorized requests")
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if code, ok := resp["code"]; !ok || int(code.(float64)) != 1004 {
		t.Errorf("expected code 1004, got %v", resp["code"])
	}
}

func TestAuthMiddleware_ExpiredSession(t *testing.T) {
	db := setupTestDB(t)
	user := addTestUser(db, "user@example.com", "password")

	sessionModel := model.NewSessionModel(db)
	sess, err := sessionModel.Create(user.ID, time.Now().Add(-1*time.Hour))
	if err != nil {
		t.Fatalf("Create session failed: %v", err)
	}

	userModel := model.NewUserModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	mw := NewAuthMiddleware(authSvc)

	spy := &spyHandler{}
	handler := mw.Authenticate(spy)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sess.ID})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
	if spy.called {
		t.Error("handler should not be called for expired sessions")
	}
}

func TestAuthMiddleware_DeletedSession(t *testing.T) {
	db := setupTestDB(t)
	user := addTestUser(db, "user@example.com", "password")

	sessionModel := model.NewSessionModel(db)
	sess, err := sessionModel.Create(user.ID, time.Now().Add(24*time.Hour))
	if err != nil {
		t.Fatalf("Create session failed: %v", err)
	}

	// Delete the session
	if err := sessionModel.Delete(sess.ID); err != nil {
		t.Fatalf("Delete session failed: %v", err)
	}

	userModel := model.NewUserModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	mw := NewAuthMiddleware(authSvc)

	spy := &spyHandler{}
	handler := mw.Authenticate(spy)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sess.ID})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
	if spy.called {
		t.Error("handler should not be called after session deletion")
	}
}

func TestAuthMiddleware_NonExistentSession(t *testing.T) {
	db := setupTestDB(t)
	userModel := model.NewUserModel(db)
	sessionModel := model.NewSessionModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	mw := NewAuthMiddleware(authSvc)

	spy := &spyHandler{}
	handler := mw.Authenticate(spy)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: "nonexistent-session-id"})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
	if spy.called {
		t.Error("handler should not be called")
	}
}

func TestContextHelpers(t *testing.T) {
	user := &model.User{ID: "test-user-id", Email: "test@example.com"}
	sessionID := "test-session-id"

	ctx := context.WithValue(context.Background(), ContextKeyUser, user)
	ctx = context.WithValue(ctx, ContextKeySessionID, sessionID)

	gotUser := GetUser(ctx)
	if gotUser == nil || gotUser.ID != user.ID {
		t.Error("GetUser returned wrong user")
	}

	gotSessionID, ok := GetSessionID(ctx)
	if !ok || gotSessionID != sessionID {
		t.Error("GetSessionID returned wrong value")
	}

	// Empty context should return nil/zero values
	gotUser = GetUser(context.Background())
	if gotUser != nil {
		t.Error("GetUser on empty context should return nil")
	}

	_, ok = GetSessionID(context.Background())
	if ok {
		t.Error("GetSessionID on empty context should be false")
	}
}
