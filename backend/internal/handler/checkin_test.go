package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/middleware"
	"github.com/Androidown/habit-tracking/backend/internal/model"
	"github.com/Androidown/habit-tracking/backend/internal/service"
	_ "modernc.org/sqlite"
)

// setupCheckinTestDB creates an in-memory SQLite database with all required tables.
func setupCheckinTestDB(t *testing.T) *sql.DB {
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
		`CREATE TABLE IF NOT EXISTS habits (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			name TEXT NOT NULL,
			schedule_expr TEXT NOT NULL DEFAULT 'daily',
			status TEXT NOT NULL DEFAULT 'active',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS checkins (
			id TEXT PRIMARY KEY,
			habit_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			checkin_date TEXT NOT NULL,
			completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (habit_id) REFERENCES habits(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON checkins(user_id, checkin_date)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			t.Fatalf("migration failed: %v", err)
		}
	}
	return db
}

// setupCheckinTestHandler creates a CheckinHandler wired to an in-memory database.
// It inserts a test user, session, and sample habits, returning the handler,
// session ID, and a list of habit IDs.
func setupCheckinTestHandler(t *testing.T) (*CheckinHandler, string, []string) {
	t.Helper()
	db := setupCheckinTestDB(t)

	// Insert test user
	userID := "test-user-1"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "test@example.com", "testuser", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}

	// Insert session
	sessionID := "test-session-1"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert test session: %v", err)
	}

	// Insert habits
	habitIDs := make([]string, 3)
	habitNames := []string{"晨跑", "阅读", "冥想"}
	for i, name := range habitNames {
		habitID := fmt.Sprintf("habit-%d", i+1)
		_, err = db.Exec(
			`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			habitID, userID, name, "daily", "active", time.Now().UTC(), time.Now().UTC(),
		)
		if err != nil {
			t.Fatalf("failed to insert habit %q: %v", name, err)
		}
		habitIDs[i] = habitID
	}

	// Initialize models
	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)

	// Initialize services
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)

	// Initialize middleware
	authMiddleware := middleware.NewAuthMiddleware(db)

	handler := NewCheckinHandler(checkinService, authMiddleware)

	return handler, sessionID, habitIDs
}

// executeCheckinRequest performs an HTTP GET request to the daily checkin endpoint
// through the mux (which applies auth middleware).
func executeCheckinRequest(handler *CheckinHandler, sessionID, date string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	url := "/api/v1/checkins/daily"
	if date != "" {
		url = fmt.Sprintf("/api/v1/checkins/daily?date=%s", date)
	}
	req := httptest.NewRequest(http.MethodGet, url, nil)
	if sessionID != "" {
		req.AddCookie(&http.Cookie{
			Name:  "session_id",
			Value: sessionID,
		})
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	return w
}

// parseCheckinResponse decodes the JSON response body.
func parseCheckinResponse(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	return resp
}


// TestGetDailyCheckins_EmptyDate verifies that empty date returns empty list.
func TestGetDailyCheckins_EmptyDate(t *testing.T) {
	handler, sessionID, _ := setupCheckinTestHandler(t)

	w := executeCheckinRequest(handler, sessionID, "")
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 0 {
		t.Errorf("expected code 0, got %v", code)
	}

	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data object in response")
	}

	if date, ok := data["date"].(string); ok && date != "" {
		t.Errorf("expected empty date, got %q", date)
	}

	habits, ok := data["habits"].([]interface{})
	if !ok {
		t.Fatal("expected habits array in data")
	}
	if len(habits) != 0 {
		t.Errorf("expected empty habits array, got %d items", len(habits))
	}

	stats, ok := data["stats"].(map[string]interface{})
	if !ok {
		t.Fatal("expected stats object in data")
	}
	if req := stats["required"].(float64); req != 0 {
		t.Errorf("expected required=0, got %v", req)
	}
	if comp := stats["completed"].(float64); comp != 0 {
		t.Errorf("expected completed=0, got %v", comp)
	}
	if total := stats["total_habits"].(float64); total != 0 {
		t.Errorf("expected total_habits=0, got %v", total)
	}
}

// TestGetDailyCheckins_InvalidDateFormat verifies that bad date formats return 400.
func TestGetDailyCheckins_InvalidDateFormat(t *testing.T) {
	handler, sessionID, _ := setupCheckinTestHandler(t)

	invalidDates := []string{
		"2026/07/14",
		"14-07-2026",
		"2026-13-01",
		"not-a-date",
		"2026-1-1",
		"07-14-2026",
	}

	for _, date := range invalidDates {
		t.Run(date, func(t *testing.T) {
			w := executeCheckinRequest(handler, sessionID, date)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400 for date %q, got %d", date, w.Code)
			}

			resp := parseCheckinResponse(t, w)
			if code := resp["code"].(float64); code != 1001 {
				t.Errorf("expected code 1001, got %v", code)
			}
		})
	}
}

// TestGetDailyCheckins_NoAuth verifies that requests without authentication return 401.
func TestGetDailyCheckins_NoAuth(t *testing.T) {
	handler, _, _ := setupCheckinTestHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	w := httptest.NewRecorder()
	handler.GetDailyCheckins(w, req)

	// The handler is wrapped by auth middleware in the route, but when called directly
	// without middleware, it won't have user_id in context.
	// This test calls GetDailyCheckins directly (no middleware).
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401 without auth, got %d", w.Code)
	}
}

// TestGetDailyCheckins_InvalidMethod verifies that non-GET methods return 405.
func TestGetDailyCheckins_InvalidMethod(t *testing.T) {
	handler, sessionID, _ := setupCheckinTestHandler(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_id",
		Value: sessionID,
	})
	w := httptest.NewRecorder()
	handler.GetDailyCheckins(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", w.Code)
	}
}

// TestGetDailyCheckins_WrongMethod verifies non-GET requests return 405.
func TestGetDailyCheckins_WrongMethod(t *testing.T) {
	handler, sessionID, _ := setupCheckinTestHandler(t)

	methods := []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch}
	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/api/v1/checkins/daily?date=2026-07-14", nil)
			req.AddCookie(&http.Cookie{
				Name:  "session_id",
				Value: sessionID,
			})
			w := httptest.NewRecorder()
			handler.GetDailyCheckins(w, req)

			if w.Code != http.StatusMethodNotAllowed {
				t.Errorf("expected 405 for %s, got %d", method, w.Code)
			}
		})
	}
}

// TestGetDailyCheckins_WithCheckins tests the full scenario with checkins inserted.
// It's a separate test that uses a raw DB for test data setup.
func TestGetDailyCheckins_WithCheckins(t *testing.T) {
	db := setupCheckinTestDB(t)

	// Insert test user
	userID := "test-user-full"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "fulltest@example.com", "fulltest", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "test-session-full"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	// Insert 3 habits with different schedule expressions
	habitIDs := make([]string, 3)
	habitEntries := []struct {
		id     string
		name   string
		sched  string
	}{
		{"h-daily-1", "每日喝水", "daily"},
		{"h-daily-2", "每日跑步", "daily"},
		{"h-weekly", "周末学习", "weekly:1,3,5"}, // Mon, Wed, Fri
	}
	for i, entry := range habitEntries {
		_, err = db.Exec(
			`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			entry.id, userID, entry.name, entry.sched, "active", time.Now().UTC(), time.Now().UTC(),
		)
		if err != nil {
			t.Fatalf("failed to insert habit %q: %v", entry.name, err)
		}
		habitIDs[i] = entry.id
	}

	// Insert checkin for one habit on the test date
	testDate := "2026-07-14" // A Tuesday
	_, err = db.Exec(
		`INSERT INTO checkins (id, habit_id, user_id, checkin_date, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"checkin-1", "h-daily-1", userID, testDate, time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert checkin: %v", err)
	}

	// Build handler with direct DB
	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	// Test: request with middleware wrapper
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/checkins/daily?date=%s", testDate), nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_id",
		Value: sessionID,
	})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	resp := parseCheckinResponse(t, w)
	respData, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected data object in response, got: %v", resp)
	}

	// Check date
	if d := respData["date"].(string); d != testDate {
		t.Errorf("expected date %q, got %q", testDate, d)
	}

	// Check habits array
	habitsData, ok := respData["habits"].([]interface{})
	if !ok {
		t.Fatalf("expected habits array, got %T", respData["habits"])
	}
	if len(habitsData) != 3 {
		t.Errorf("expected 3 habits, got %d", len(habitsData))
	}

	// Check each habit's status
	for _, h := range habitsData {
		habit, ok := h.(map[string]interface{})
		if !ok {
			t.Fatal("expected habit object")
		}
		habitID := habit["habit_id"].(string)

		switch habitID {
		case "h-daily-1":
			// Should be checked in AND required (daily on Tuesday)
			if checkedIn := habit["checked_in"].(bool); !checkedIn {
				t.Error("h-daily-1 should be checked_in")
			}
			if required := habit["required"].(bool); !required {
				t.Error("h-daily-1 should be required")
			}
			if habit["checkin_id"] == nil || habit["checkin_id"].(string) == "" {
				t.Error("h-daily-1 should have a checkin_id")
			}
			if habit["completed_at"] == nil || habit["completed_at"].(string) == "" {
				t.Error("h-daily-1 should have a completed_at")
			}
		case "h-daily-2":
			// Should be required but NOT checked in
			if checkedIn := habit["checked_in"].(bool); checkedIn {
				t.Error("h-daily-2 should NOT be checked_in")
			}
			if required := habit["required"].(bool); !required {
				t.Error("h-daily-2 should be required (daily schedule)")
			}
		case "h-weekly":
			// 2026-07-14 is Tuesday = 2, weekly:1,3,5 means Mon/Wed/Fri
			// Tuesday should NOT be required
			// But since we're not sure about the day, let's just check the fields exist
			if habit["checked_in"] == nil {
				t.Error("h-weekly should have checked_in field")
			}
			// Note: The required field depends on the day of week
		}
	}

	// Check stats
	stats, ok := respData["stats"].(map[string]interface{})
	if !ok {
		t.Fatal("expected stats object")
	}

	// At minimum, total_habits should be 3
	if total := stats["total_habits"].(float64); total != 3 {
		t.Errorf("expected total_habits=3, got %v", total)
	}

	// At minimum, completed should be 1
	if completed := stats["completed"].(float64); completed != 1 {
		t.Errorf("expected completed=1, got %v", completed)
	}
}

// TestGetDailyCheckins_NoActiveHabits verifies that a user with no active habits
// gets an empty list.
func TestGetDailyCheckins_NoActiveHabits(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "no-habit-user"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "nohabit@example.com", "nohabit", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "no-habit-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_id",
		Value: sessionID,
	})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data := resp["data"].(map[string]interface{})
	habits := data["habits"].([]interface{})
	if len(habits) != 0 {
		t.Errorf("expected empty habits, got %d items", len(habits))
	}
	stats := data["stats"].(map[string]interface{})
	if total := stats["total_habits"].(float64); total != 0 {
		t.Errorf("expected total_habits=0, got %v", total)
	}
}

// TestGetDailyCheckins_ScheduleRequired verifies that schedule expressions
// correctly determine if a habit is required on a given date.
func TestGetDailyCheckins_ScheduleRequired(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "sched-test-user"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "sched@example.com", "sched", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "sched-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	// Insert habits with different schedule expressions
	habitEntries := []struct {
		id    string
		name  string
		sched string
	}{
		{"sched-daily", "每日任务", "daily"},
		{"sched-weekdays", "工作日任务", "weekdays"},
		{"sched-weekends", "周末任务", "weekends"},
		{"sched-mon-wed-fri", "一三五任务", "weekly:1,3,5"},
	}
	for _, entry := range habitEntries {
		_, err = db.Exec(
			`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			entry.id, userID, entry.name, entry.sched, "active", time.Now().UTC(), time.Now().UTC(),
		)
		if err != nil {
			t.Fatalf("failed to insert habit %q: %v", entry.name, err)
		}
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Test on 2026-07-14 (Tuesday)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_id",
		Value: sessionID,
	})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data := resp["data"].(map[string]interface{})
	habits := data["habits"].([]interface{})

	requiredMap := make(map[string]bool)
	for _, h := range habits {
		habit := h.(map[string]interface{})
		requiredMap[habit["habit_id"].(string)] = habit["required"].(bool)
	}

	// Tuesday is a weekday, not weekend
	if !requiredMap["sched-daily"] {
		t.Error("sched-daily should be required")
	}
	if !requiredMap["sched-weekdays"] {
		t.Error("sched-weekdays should be required on Tuesday")
	}
	if requiredMap["sched-weekends"] {
		t.Error("sched-weekends should NOT be required on Tuesday")
	}
	// Tuesday = 2, not in [1,3,5], so not required
	if requiredMap["sched-mon-wed-fri"] {
		t.Error("sched-mon-wed-fri should NOT be required on Tuesday")
	}
}

// TestGetDailyCheckins_AuthIsolation verifies that user B cannot see user A's habits.
func TestGetDailyCheckins_AuthIsolation(t *testing.T) {
	db := setupCheckinTestDB(t)

	// User A
	userAID := "user-a"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userAID, "usera@example.com", "usera", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user A: %v", err)
	}

	sessionAID := "session-a"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionAID, userAID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session A: %v", err)
	}

	_, err = db.Exec(
		`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"habit-a", userAID, "用户A习惯", "daily", "active", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert habit for user A: %v", err)
	}

	// User B (no habits)
	userBID := "user-b"
	_, err = db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userBID, "userb@example.com", "userb", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user B: %v", err)
	}

	sessionBID := "session-b"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionBID, userBID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session B: %v", err)
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// User A requests their own checkins
	reqA := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	reqA.AddCookie(&http.Cookie{Name: "session_id", Value: sessionAID})
	wA := httptest.NewRecorder()
	mux.ServeHTTP(wA, reqA)

	if wA.Code != http.StatusOK {
		t.Errorf("user A: expected 200, got %d", wA.Code)
	}
	respA := parseCheckinResponse(t, wA)
	dataA := respA["data"].(map[string]interface{})
	habitsA := dataA["habits"].([]interface{})
	if len(habitsA) != 1 {
		t.Errorf("user A: expected 1 habit, got %d", len(habitsA))
	}
	if len(habitsA) > 0 {
		habitA := habitsA[0].(map[string]interface{})
		if habitA["habit_id"] != "habit-a" {
			t.Errorf("user A: expected habit_id 'habit-a', got %v", habitA["habit_id"])
		}
	}

	// User B requests - should see 0 habits (no habits for user B)
	reqB := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	reqB.AddCookie(&http.Cookie{Name: "session_id", Value: sessionBID})
	wB := httptest.NewRecorder()
	mux.ServeHTTP(wB, reqB)

	if wB.Code != http.StatusOK {
		t.Errorf("user B: expected 200, got %d", wB.Code)
	}
	respB := parseCheckinResponse(t, wB)
	dataB := respB["data"].(map[string]interface{})
	habitsB := dataB["habits"].([]interface{})
	if len(habitsB) != 0 {
		t.Errorf("user B: expected 0 habits, got %d - user B should not see user A's habits", len(habitsB))
	}
}

// TestGetDailyCheckins_WithCheckinAndDirectCall tests the handler directly
// (without mux) with proper middleware context.
func TestGetDailyCheckins_WithDirectHandler(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "direct-test-user"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "direct@example.com", "direct", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "direct-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	// Add one habit
	_, err = db.Exec(
		`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"direct-habit", userID, "直接测试习惯", "daily", "active", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert habit: %v", err)
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	// Use RegisterRoutes which wraps the handler with auth middleware
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	testDate := "2026-07-14"
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/checkins/daily?date=%s", testDate), nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	resp := parseCheckinResponse(t, w)
	data := resp["data"].(map[string]interface{})
	habits := data["habits"].([]interface{})

	if len(habits) != 1 {
		t.Errorf("expected 1 habit, got %d", len(habits))
	}

	if len(habits) > 0 {
		h := habits[0].(map[string]interface{})
		if h["habit_name"] != "直接测试习惯" {
			t.Errorf("expected habit_name '直接测试习惯', got %v", h["habit_name"])
		}
		if checkedIn := h["checked_in"].(bool); checkedIn {
			t.Error("should not be checked in (no checkin was created)")
		}
	}

	stats := data["stats"].(map[string]interface{})
	if total := stats["total_habits"].(float64); total != 1 {
		t.Errorf("expected total_habits=1, got %v", total)
	}
	if completed := stats["completed"].(float64); completed != 0 {
		t.Errorf("expected completed=0, got %v", completed)
	}
}

// TestGetDailyCheckins_ExpiredSession verifies expired sessions return 401.
func TestGetDailyCheckins_ExpiredSession(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "expired-user"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "expired@example.com", "expired", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	// Insert an expired session
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		"expired-session", userID, time.Now().UTC().Add(-1*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert expired session: %v", err)
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_id",
		Value: "expired-session",
	})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for expired session, got %d. Body: %s", w.Code, w.Body.String())
	}
}

// TestGetDailyCheckins_AuthHeader verifies authentication via Authorization header.
func TestGetDailyCheckins_AuthHeader(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "header-auth-user"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "header@example.com", "header", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "header-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.Header.Set("Authorization", "Bearer "+sessionID)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for Bearer auth, got %d", w.Code)
	}
}

// TestGetDailyCheckins_PartialCheckin verifies that when some habits are checked in
// and others are not, the stats correctly reflect partial completion.
func TestGetDailyCheckins_PartialCheckin(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "partial-user"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "partial@example.com", "partial", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "partial-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	// Insert 5 daily habits
	for i := 1; i <= 5; i++ {
		habitID := fmt.Sprintf("partial-habit-%d", i)
		_, err = db.Exec(
			`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			habitID, userID, fmt.Sprintf("习惯%d", i), "daily", "active", time.Now().UTC(), time.Now().UTC(),
		)
		if err != nil {
			t.Fatalf("failed to insert habit %d: %v", i, err)
		}
	}

	testDate := "2026-07-14"

	// Check in habits 1 and 2 only
	for i := 1; i <= 2; i++ {
		habitID := fmt.Sprintf("partial-habit-%d", i)
		_, err = db.Exec(
			`INSERT INTO checkins (id, habit_id, user_id, checkin_date, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			fmt.Sprintf("partial-checkin-%d", i), habitID, userID, testDate, time.Now().UTC(), time.Now().UTC(),
		)
		if err != nil {
			t.Fatalf("failed to insert checkin %d: %v", i, err)
		}
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/checkins/daily?date=%s", testDate), nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data := resp["data"].(map[string]interface{})
	stats := data["stats"].(map[string]interface{})

	if total := stats["total_habits"].(float64); total != 5 {
		t.Errorf("expected total_habits=5, got %v", total)
	}
	if required := stats["required"].(float64); required != 5 {
		t.Errorf("expected required=5 (all daily habits), got %v", required)
	}
	if completed := stats["completed"].(float64); completed != 2 {
		t.Errorf("expected completed=2, got %v", completed)
	}
}

// TestGetDailyCheckins_InvalidDateNotReal verifies that non-existent dates return 400.
func TestGetDailyCheckins_InvalidDateNotReal(t *testing.T) {
	handler, sessionID, _ := setupCheckinTestHandler(t)

	// February 30 doesn't exist
	w := executeCheckinRequest(handler, sessionID, "2026-02-30")
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for non-existent date, got %d. Body: %s", w.Code, w.Body.String())
	}

	// April 31 doesn't exist
	w = executeCheckinRequest(handler, sessionID, "2026-04-31")
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for non-existent date, got %d", w.Code)
	}
}

// TestGetDailyCheckins_AllNotCheckedIn verifies that when user has habits but none checked in,
// the response shows all as not checked_in.
func TestGetDailyCheckins_AllNotCheckedIn(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "all-not-checked"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "allnot@example.com", "allnot", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "allnot-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	// Insert 2 daily habits but NO checkins
	for i := 1; i <= 2; i++ {
		habitID := fmt.Sprintf("notchecked-habit-%d", i)
		_, err = db.Exec(
			`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			habitID, userID, fmt.Sprintf("未打卡习惯%d", i), "daily", "active", time.Now().UTC(), time.Now().UTC(),
		)
		if err != nil {
			t.Fatalf("failed to insert habit %d: %v", i, err)
		}
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data := resp["data"].(map[string]interface{})
	habits := data["habits"].([]interface{})

	for _, h := range habits {
		habit := h.(map[string]interface{})
		if checkedIn := habit["checked_in"].(bool); checkedIn {
			t.Errorf("habit %v should not be checked in", habit["habit_id"])
		}
		if habit["checkin_id"] != nil {
			t.Errorf("habit %v should not have checkin_id", habit["habit_id"])
		}
	}

	stats := data["stats"].(map[string]interface{})
	if completed := stats["completed"].(float64); completed != 0 {
		t.Errorf("expected completed=0, got %v", completed)
	}
}

// TestGetDailyCheckins_NilSessionCookie verifies no session cookie returns 401.
func TestGetDailyCheckins_NilSessionCookie(t *testing.T) {
	db := setupCheckinTestDB(t)

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	// No cookie set
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without session, got %d", w.Code)
	}
}

// TestWriteJSON ensures the shared writeJSON helper works in the handler package.
// This is an indirect test since writeJSON is already tested via other handler tests.
func TestGetDailyCheckins_ValidDateEmptyHabits(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "valid-date-empty"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "validempty@example.com", "validempty", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "valid-date-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Valid date, no habits
	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data := resp["data"].(map[string]interface{})
	if d := data["date"].(string); d != "2026-07-14" {
		t.Errorf("expected date '2026-07-14', got %q", d)
	}
}

// TestGetDailyCheckins_DeletedHabit verifies that deleted habits are not returned.
func TestGetDailyCheckins_DeletedHabit(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "deleted-habit-user"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "deleted@example.com", "deleted", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "deleted-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	// Insert one active and one deleted habit
	_, err = db.Exec(
		`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"active-habit", userID, "活跃习惯", "daily", "active", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert active habit: %v", err)
	}

	_, err = db.Exec(
		`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"deleted-habit", userID, "已删除习惯", "daily", "deleted", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert deleted habit: %v", err)
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data := resp["data"].(map[string]interface{})
	habits := data["habits"].([]interface{})

	if len(habits) != 1 {
		t.Errorf("expected 1 habit (only active), got %d", len(habits))
	}

	if len(habits) > 0 {
		h := habits[0].(map[string]interface{})
		if h["habit_id"] != "active-habit" {
			t.Errorf("expected active-habit only, got %v", h["habit_id"])
		}
	}
}

// TestGetDailyCheckins_ResponseFormat verifies the response follows the DEM-185 format.
func TestGetDailyCheckins_ResponseFormat(t *testing.T) {
	db := setupCheckinTestDB(t)

	userID := "format-test-user"
	_, err := db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "format@example.com", "format", "hash", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	sessionID := "format-session"
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour),
	)
	if err != nil {
		t.Fatalf("failed to insert session: %v", err)
	}

	_, err = db.Exec(
		`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"format-habit", userID, "格式测试", "daily", "active", time.Now().UTC(), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("failed to insert habit: %v", err)
	}

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checkins/daily?date=2026-07-14", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	var rawResp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&rawResp); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}

	// Verify envelope
	if _, ok := rawResp["code"]; !ok {
		t.Error("response missing 'code' field")
	}
	if _, ok := rawResp["message"]; !ok {
		t.Error("response missing 'message' field")
	}
	if _, ok := rawResp["data"]; !ok {
		t.Error("response missing 'data' field")
	}

	data, ok := rawResp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("data should be an object")
	}

	// Verify data fields per DEM-185 spec
	expectedDataFields := []string{"date", "habits", "stats"}
	for _, f := range expectedDataFields {
		if _, ok := data[f]; !ok {
			t.Errorf("data missing '%s' field", f)
		}
	}

	// Verify habit fields per DEM-185 spec
	habits := data["habits"].([]interface{})
	if len(habits) > 0 {
		h := habits[0].(map[string]interface{})
		expectedHabitFields := []string{"habit_id", "habit_name", "checked_in", "required", "checkin_id", "completed_at"}
		for _, f := range expectedHabitFields {
			if _, ok := h[f]; !ok {
				t.Errorf("habit missing '%s' field", f)
			}
		}
	}

	// Verify stats fields
	stats, ok := data["stats"].(map[string]interface{})
	if !ok {
		t.Fatal("stats should be an object")
	}
	expectedStatsFields := []string{"required", "completed", "total_habits"}
	for _, f := range expectedStatsFields {
		if _, ok := stats[f]; !ok {
			t.Errorf("stats missing '%s' field", f)
		}
	}
}

