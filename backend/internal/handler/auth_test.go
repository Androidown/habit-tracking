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
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/middleware"
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
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
func setupTestHandler(t *testing.T) (*AuthHandler, *sql.DB) {
	t.Helper()
	db := setupTestDB(t)
	userModel := model.NewUserModel(db)
	sessionModel := model.NewSessionModel(db)
	authService := service.NewAuthService(userModel, sessionModel)
	return NewAuthHandler(authService), db
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

// insertTestUser creates a user with a known password hash.
func insertTestUser(db *sql.DB, email, password string) *model.User {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	userModel := model.NewUserModel(db)
	user, err := userModel.Create(email, "testuser", string(hash))
	if err != nil {
		panic(err)
	}
	return user
}

// --- Register tests (existing) ---

func TestRegisterSuccess(t *testing.T) {
	handler, _ := setupTestHandler(t)

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

func TestRegisterMissingFields(t *testing.T) {
	handler, _ := setupTestHandler(t)

	tests := []struct {
		name string
		body string
	}{
		{"missing email", `{"email":"","username":"testuser","password":"password123"}`},
		{"missing username", `{"email":"test@example.com","username":"","password":"password123"}`},
		{"missing password", `{"email":"test@example.com","username":"testuser","password":""}`},
		{"all fields empty", `{"email":"","username":"","password":""}`},
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

func TestRegisterInvalidEmail(t *testing.T) {
	handler, _ := setupTestHandler(t)

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

func TestRegisterShortPassword(t *testing.T) {
	handler, _ := setupTestHandler(t)

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

func TestRegisterInvalidUsername(t *testing.T) {
	handler, _ := setupTestHandler(t)

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

// --- Login tests ---

func TestLogin_Success(t *testing.T) {
	handler, db := setupTestHandler(t)
	insertTestUser(db, "user@example.com", "secret123")

	body := `{"email":"user@example.com","password":"secret123"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Login(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Check Set-Cookie header
	cookies := w.Result().Cookies()
	var sessionCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "session_id" {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("expected session cookie")
	}
	if !sessionCookie.HttpOnly {
		t.Error("expected HttpOnly cookie")
	}
	if sessionCookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("expected SameSite=Lax, got %v", sessionCookie.SameSite)
	}
	if sessionCookie.Path != "/" {
		t.Errorf("expected Path=/, got %s", sessionCookie.Path)
	}
	if sessionCookie.MaxAge <= 0 {
		t.Errorf("expected positive MaxAge, got %d", sessionCookie.MaxAge)
	}
	if sessionCookie.Value == "" {
		t.Error("expected non-empty session cookie value")
	}

	// Verify response body
	resp := parseResponse(t, w)
	if code := resp["code"].(float64); int(code) != service.CodeSuccess {
		t.Errorf("expected code %d, got %d", service.CodeSuccess, int(code))
	}
	if msg := resp["message"].(string); msg != "SUCCESS" {
		t.Errorf("expected message 'SUCCESS', got %q", msg)
	}
	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data object in response")
	}
	if data["email"] != "user@example.com" {
		t.Errorf("expected email user@example.com, got %v", data["email"])
	}
}

func TestLogin_InvalidPassword(t *testing.T) {
	handler, db := setupTestHandler(t)
	insertTestUser(db, "user@example.com", "secret123")

	body := `{"email":"user@example.com","password":"wrong-password"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Login(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}

	resp := parseResponse(t, w)
	if code := resp["code"].(float64); int(code) != service.CodeInvalidCredentials {
		t.Errorf("expected code %d, got %d", service.CodeInvalidCredentials, int(code))
	}
	if msg := resp["message"].(string); msg != "INVALID_CREDENTIALS" {
		t.Errorf("expected message 'INVALID_CREDENTIALS', got %q", msg)
	}
}

func TestLogin_UnregisteredEmail(t *testing.T) {
	handler, _ := setupTestHandler(t)

	body := `{"email":"unknown@example.com","password":"some-password"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Login(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}

	resp := parseResponse(t, w)
	if code := resp["code"].(float64); int(code) != service.CodeInvalidCredentials {
		t.Errorf("expected code %d, got %d", service.CodeInvalidCredentials, int(code))
	}
	if msg := resp["message"].(string); msg != "INVALID_CREDENTIALS" {
		t.Errorf("expected message 'INVALID_CREDENTIALS', got %q", msg)
	}
}

func TestLogin_EmptyFields(t *testing.T) {
	handler, _ := setupTestHandler(t)

	tests := []struct {
		name     string
		email    string
		password string
	}{
		{"empty email", "", "password123"},
		{"empty password", "user@example.com", ""},
		{"both empty", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := fmt.Sprintf(`{"email":"%s","password":"%s"}`, tt.email, tt.password)
			req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			handler.Login(w, req)

			if w.Code != http.StatusUnprocessableEntity {
				t.Errorf("expected 422, got %d: %s", w.Code, w.Body.String())
			}

			resp := parseResponse(t, w)
			if code := resp["code"].(float64); int(code) != service.CodeValidationError {
				t.Errorf("expected code %d, got %d", service.CodeValidationError, int(code))
			}
		})
	}
}

// --- Me tests ---

func TestMe_ValidSession(t *testing.T) {
	handler, db := setupTestHandler(t)
	user := insertTestUser(db, "user@example.com", "secret123")

	sessionModel := model.NewSessionModel(db)
	sess, err := sessionModel.Create(user.ID, time.Now().Add(24*time.Hour))
	if err != nil {
		t.Fatalf("Create session failed: %v", err)
	}

	userModel := model.NewUserModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	authMw := middleware.NewAuthMiddleware(authSvc)

	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sess.ID})
	w := httptest.NewRecorder()

	authMw.Authenticate(http.HandlerFunc(handler.Me)).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	resp := parseResponse(t, w)
	if code := resp["code"].(float64); int(code) != service.CodeSuccess {
		t.Errorf("expected code %d, got %d", service.CodeSuccess, int(code))
	}
	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data object")
	}
	if data["email"] != "user@example.com" {
		t.Errorf("expected email user@example.com, got %v", data["email"])
	}
}

func TestMe_NoCookie(t *testing.T) {
	handler, db := setupTestHandler(t)
	userModel := model.NewUserModel(db)
	sessionModel := model.NewSessionModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	authMw := middleware.NewAuthMiddleware(authSvc)

	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	w := httptest.NewRecorder()

	authMw.Authenticate(http.HandlerFunc(handler.Me)).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMe_ExpiredSession(t *testing.T) {
	handler, db := setupTestHandler(t)
	user := insertTestUser(db, "user@example.com", "secret123")

	sessionModel := model.NewSessionModel(db)
	sess, err := sessionModel.Create(user.ID, time.Now().Add(-1*time.Hour))
	if err != nil {
		t.Fatalf("Create session failed: %v", err)
	}

	userModel := model.NewUserModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	authMw := middleware.NewAuthMiddleware(authSvc)

	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sess.ID})
	w := httptest.NewRecorder()

	authMw.Authenticate(http.HandlerFunc(handler.Me)).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}

// --- Logout tests ---

func TestLogout_ClearsSession(t *testing.T) {
	handler, db := setupTestHandler(t)
	user := insertTestUser(db, "user@example.com", "secret123")

	sessionModel := model.NewSessionModel(db)
	sess, err := sessionModel.Create(user.ID, time.Now().Add(24*time.Hour))
	if err != nil {
		t.Fatalf("Create session failed: %v", err)
	}

	userModel := model.NewUserModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	authMw := middleware.NewAuthMiddleware(authSvc)

	req := httptest.NewRequest("POST", "/api/v1/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sess.ID})
	w := httptest.NewRecorder()

	authMw.Authenticate(http.HandlerFunc(handler.Logout)).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Session should be deleted from store
	deletedSess, err := sessionModel.GetByID(sess.ID)
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}
	if deletedSess != nil {
		t.Error("expected session to be deleted after logout")
	}

	// Cookie should be cleared
	cookies := w.Result().Cookies()
	var sessionCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "session_id" {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("expected session cookie in response")
	}
	if sessionCookie.MaxAge != -1 {
		t.Errorf("expected MaxAge=-1, got %d", sessionCookie.MaxAge)
	}
	if sessionCookie.Value != "" {
		t.Errorf("expected empty value, got %s", sessionCookie.Value)
	}
}

func TestLogoutThenAccessDenied(t *testing.T) {
	handler, db := setupTestHandler(t)
	user := insertTestUser(db, "user@example.com", "secret123")

	sessionModel := model.NewSessionModel(db)
	sess, err := sessionModel.Create(user.ID, time.Now().Add(24*time.Hour))
	if err != nil {
		t.Fatalf("Create session failed: %v", err)
	}

	userModel := model.NewUserModel(db)
	authSvc := service.NewAuthService(userModel, sessionModel)
	authMw := middleware.NewAuthMiddleware(authSvc)

	// Logout
	logoutReq := httptest.NewRequest("POST", "/api/v1/auth/logout", nil)
	logoutReq.AddCookie(&http.Cookie{Name: "session_id", Value: sess.ID})
	logoutW := httptest.NewRecorder()
	authMw.Authenticate(http.HandlerFunc(handler.Logout)).ServeHTTP(logoutW, logoutReq)

	if logoutW.Code != http.StatusOK {
		t.Fatalf("logout failed: %d", logoutW.Code)
	}

	// Now try GET /me with the same cookie
	meReq := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	meReq.AddCookie(&http.Cookie{Name: "session_id", Value: sess.ID})
	meW := httptest.NewRecorder()
	authMw.Authenticate(http.HandlerFunc(handler.Me)).ServeHTTP(meW, meReq)

	if meW.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 after logout, got %d: %s", meW.Code, meW.Body.String())
	}
}
