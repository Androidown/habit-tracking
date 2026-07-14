package handler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Androidown/habit-tracking/backend/internal/model"
	"github.com/Androidown/habit-tracking/backend/internal/service"
	_ "modernc.org/sqlite"
)

// setupTestDB creates an in-memory SQLite database with the required schema.
func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory database: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	migrations := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			username TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			expires_at DATETIME NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
	}
	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			t.Fatalf("migration failed: %v", err)
		}
	}
	return db
}

// setupTestHandler creates an AuthHandler wired to an in-memory database.
func setupTestHandler(t *testing.T) *AuthHandler {
	t.Helper()
	db := setupTestDB(t)
	userModel := model.NewUserModel(db)
	sessionModel := model.NewSessionModel(db)
	authService := service.NewAuthService(userModel, sessionModel)
	return NewAuthHandler(authService)
}

// executeRequest is a helper to perform an HTTP test request.
func executeRequest(handler *AuthHandler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Register(w, req)
	return w
}

// parseResponse decodes the JSON response body.
func parseResponse(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	return resp
}

// TestRegisterSuccess verifies a successful registration returns 201 with user info and Set-Cookie.
func TestRegisterSuccess(t *testing.T) {
	handler := setupTestHandler(t)

	body := `{"email":"test@example.com","username":"testuser","password":"password123"}`
	w := executeRequest(handler, http.MethodPost, "/api/v1/auth/register", body)

	if w.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d", w.Code)
	}

	resp := parseResponse(t, w)
	if code := resp["code"].(float64); code != 0 {
		t.Errorf("expected code 0, got %v", code)
	}
	if msg := resp["message"].(string); msg != "ok" {
		t.Errorf("expected message 'ok', got %q", msg)
	}

	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data object in response")
	}

	if data["user_id"] == nil || data["user_id"].(string) == "" {
		t.Error("expected non-empty user_id")
	}
	if data["email"] != "test@example.com" {
		t.Errorf("expected email 'test@example.com', got %v", data["email"])
	}
	if data["username"] != "testuser" {
		t.Errorf("expected username 'testuser', got %v", data["username"])
	}
	if data["created_at"] == nil || data["created_at"].(string) == "" {
		t.Error("expected non-empty created_at")
	}

	// Verify Set-Cookie header
	cookies := w.Result().Header["Set-Cookie"]
	if len(cookies) == 0 {
		t.Fatal("expected Set-Cookie header")
	}
	cookieStr := cookies[0]
	if !strings.Contains(cookieStr, "session_id=") {
		t.Errorf("expected session_id cookie, got %q", cookieStr)
	}
	if !strings.Contains(cookieStr, "HttpOnly") {
		t.Errorf("expected HttpOnly cookie, got %q", cookieStr)
	}
	if !strings.Contains(cookieStr, "SameSite=Lax") {
		t.Errorf("expected SameSite=Lax, got %q", cookieStr)
	}
}

// TestRegisterMissingFields verifies that empty fields return 422.
func TestRegisterMissingFields(t *testing.T) {
	handler := setupTestHandler(t)

	tests := []struct {
		name     string
		body     string
		field    string
		reason   string
	}{
		{"missing email", `{"email":"","username":"testuser","password":"password123"}`, "email", "required"},
		{"missing username", `{"email":"test@example.com","username":"","password":"password123"}`, "username", "required"},
		{"missing password", `{"email":"test@example.com","username":"testuser","password":""}`, "password", "required"},
		{"all fields empty", `{"email":"","username":"","password":""}`, "email", "required"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := executeRequest(handler, http.MethodPost, "/api/v1/auth/register", tt.body)
			if w.Code != http.StatusUnprocessableEntity {
				t.Errorf("expected status 422, got %d", w.Code)
			}

			resp := parseResponse(t, w)
			if code := resp["code"].(float64); code != 1001 {
				t.Errorf("expected code 1001, got %v", code)
			}
			if msg := resp["message"].(string); msg != "VALIDATION_ERROR" {
				t.Errorf("expected message 'VALIDATION_ERROR', got %q", msg)
			}
		})
	}
}

// TestRegisterInvalidEmail verifies that invalid email formats return 422.
func TestRegisterInvalidEmail(t *testing.T) {
	handler := setupTestHandler(t)

	tests := []struct {
		name  string
		email string
	}{
		{"no @ symbol", "testexample.com"},
		{"no domain", "test@"},
		{"no local part", "@example.com"},
		{"no dot in domain", "test@example"},
		{"empty string", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := fmt.Sprintf(`{"email":"%s","username":"testuser","password":"password123"}`, tt.email)
			w := executeRequest(handler, http.MethodPost, "/api/v1/auth/register", body)
			if w.Code != http.StatusUnprocessableEntity {
				t.Errorf("expected status 422 for email %q, got %d", tt.email, w.Code)
			}

			resp := parseResponse(t, w)
			if code := resp["code"].(float64); code != 1001 {
				t.Errorf("expected code 1001, got %v", code)
			}
		})
	}
}

// TestRegisterShortPassword verifies that short passwords return 422.
func TestRegisterShortPassword(t *testing.T) {
	handler := setupTestHandler(t)

	body := `{"email":"test@example.com","username":"testuser","password":"short"}`
	w := executeRequest(handler, http.MethodPost, "/api/v1/auth/register", body)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected status 422, got %d", w.Code)
	}

	resp := parseResponse(t, w)
	if code := resp["code"].(float64); code != 1001 {
		t.Errorf("expected code 1001, got %v", code)
	}
}

// TestRegisterInvalidUsername verifies invalid usernames return 422.
func TestRegisterInvalidUsername(t *testing.T) {
	handler := setupTestHandler(t)

	tests := []struct {
		name     string
		username string
	}{
		{"too short", "ab"},
		{"too long", strings.Repeat("a", 21)},
		{"special chars", "user@name"},
		{"spaces", "user name"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := fmt.Sprintf(`{"email":"test@example.com","username":"%s","password":"password123"}`, tt.username)
			w := executeRequest(handler, http.MethodPost, "/api/v1/auth/register", body)
			if w.Code != http.StatusUnprocessableEntity {
				t.Errorf("expected status 422 for username %q, got %d", tt.username, w.Code)
			}

			resp := parseResponse(t, w)
			if code := resp["code"].(float64); code != 1001 {
				t.Errorf("expected code 1001, got %v", code)
			}
		})
	}
}

// TestRegisterDuplicateEmail verifies that a duplicate email returns 409.
func TestRegisterDuplicateEmail(t *testing.T) {
	handler := setupTestHandler(t)

	// First registration — should succeed
	body1 := `{"email":"dupe@example.com","username":"user1","password":"password123"}`
	w1 := executeRequest(handler, http.MethodPost, "/api/v1/auth/register", body1)
	if w1.Code != http.StatusCreated {
		t.Errorf("first registration: expected 201, got %d", w1.Code)
	}

	// Second registration with same email — should fail with 409
	body2 := `{"email":"dupe@example.com","username":"user2","password":"anotherPass1"}`
	w2 := executeRequest(handler, http.MethodPost, "/api/v1/auth/register", body2)
	if w2.Code != http.StatusConflict {
		t.Errorf("expected status 409 for duplicate email, got %d", w2.Code)
	}

	resp := parseResponse(t, w2)
	if code := resp["code"].(float64); code != 1002 {
		t.Errorf("expected code 1002, got %v", code)
	}
	if msg := resp["message"].(string); msg != "EMAIL_ALREADY_EXISTS" {
		t.Errorf("expected message 'EMAIL_ALREADY_EXISTS', got %q", msg)
	}

	// Verify no user info is leaked in the 409 response
	if _, ok := resp["data"]; ok {
		t.Error("expected no data field in 409 response to avoid leaking user info")
	}
}

// TestRegisterInvalidJSON verifies that non-JSON requests return 422.
func TestRegisterInvalidJSON(t *testing.T) {
	handler := setupTestHandler(t)

	body := `this is not json`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Register(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected status 422 for invalid JSON, got %d", w.Code)
	}

	resp := parseResponse(t, w)
	if code := resp["code"].(float64); code != 1001 {
		t.Errorf("expected code 1001, got %v", code)
	}
}

// TestRegisterPasswordStoredAsHash verifies that passwords are bcrypt-hashed, not plaintext.
func TestRegisterPasswordStoredAsHash(t *testing.T) {
	db := setupTestDB(t)
	userModel := model.NewUserModel(db)
	sessionModel := model.NewSessionModel(db)
	authService := service.NewAuthService(userModel, sessionModel)
	handler := NewAuthHandler(authService)

	body := `{"email":"hashcheck@example.com","username":"hashcheck","password":"securePass123"}`
	w := executeRequest(handler, http.MethodPost, "/api/v1/auth/register", body)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}

	// Directly query the database to verify the stored hash
	var passwordHash string
	err := db.QueryRow(`SELECT password_hash FROM users WHERE email = ?`, "hashcheck@example.com").Scan(&passwordHash)
	if err != nil {
		t.Fatalf("failed to query user: %v", err)
	}

	// Verify it's not plaintext
	if passwordHash == "securePass123" {
		t.Error("password is stored as plaintext!")
	}

	// Verify it starts with bcrypt prefix
	if !strings.HasPrefix(passwordHash, "$2a$") && !strings.HasPrefix(passwordHash, "$2b$") {
		t.Errorf("password hash does not look like bcrypt: %q", passwordHash)
	}

	// Verify bcrypt hash is at least 50 chars (bcrypt hash is typically 60)
	if len(passwordHash) < 50 {
		t.Errorf("bcrypt hash seems too short: %d chars", len(passwordHash))
	}
}

// TestRegisterWrongMethod verifies that non-POST requests are rejected.
func TestRegisterWrongMethod(t *testing.T) {
	handler := setupTestHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/register", nil)
	w := httptest.NewRecorder()
	handler.Register(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}
