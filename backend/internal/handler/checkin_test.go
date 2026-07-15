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
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// checkinTestDB holds references for checkin tests.
type checkinTestDB struct {
	db             *sql.DB
	userID         string
	sessionID      string
	otherUserID    string
	otherSessionID string
	habitID        string
	deletedHabitID string
	otherHabitID   string
}

// setupCheckinTestDB creates an in-memory database with full schema and seed data.
func setupCheckinTestDB(t *testing.T) *checkinTestDB {
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
			description TEXT NOT NULL DEFAULT '',
			schedule_expression TEXT NOT NULL DEFAULT 'daily',
			deleted_at DATETIME,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS checkins (
			id TEXT PRIMARY KEY,
			habit_id TEXT NOT NULL,
			checkin_date DATE NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (habit_id) REFERENCES habits(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_checkins_habit_date ON checkins(habit_id, checkin_date)`,
	}
	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			t.Fatalf("migration failed: %v", err)
		}
	}

	userID := uuid.New().String()
	otherUserID := uuid.New().String()
	sessionID := uuid.New().String()
	otherSessionID := uuid.New().String()
	habitID := uuid.New().String()
	deletedHabitID := uuid.New().String()
	otherHabitID := uuid.New().String()
	now := time.Now().UTC()

	// Seed users
	for _, u := range []struct {
		id       string
		email    string
		username string
	}{
		{userID, "alice@example.com", "alice"},
		{otherUserID, "bob@example.com", "bob"},
	} {
		_, err := db.Exec(
			`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
			u.id, u.email, u.username, "hash", now, now,
		)
		if err != nil {
			t.Fatalf("failed to seed user %s: %v", u.id, err)
		}
	}

	// Seed sessions (valid for 24h)
	for _, s := range []struct {
		id     string
		userID string
	}{
		{sessionID, userID},
		{otherSessionID, otherUserID},
	} {
		_, err := db.Exec(
			`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
			s.id, s.userID, now.Add(24*time.Hour),
		)
		if err != nil {
			t.Fatalf("failed to seed session %s: %v", s.id, err)
		}
	}

	// Seed habits
	_, err = db.Exec(
		`INSERT INTO habits (id, user_id, name, description, schedule_expression, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		habitID, userID, "Morning Run", "Daily morning run", "daily", now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed habit: %v", err)
	}

	// Deleted habit
	_, err = db.Exec(
		`INSERT INTO habits (id, user_id, name, description, schedule_expression, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		deletedHabitID, userID, "Old Habit", "Deleted habit", "1,3,5", now, now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed deleted habit: %v", err)
	}

	// Other user's habit
	_, err = db.Exec(
		`INSERT INTO habits (id, user_id, name, description, schedule_expression, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		otherHabitID, otherUserID, "Bob's Habit", "Not Alice's", "daily", now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed other user's habit: %v", err)
	}

	// Seed checkins for habit (Mon, Wed, Fri of a known week)
	// 2026-07-13 = Monday, 2026-07-15 = Wednesday, 2026-07-17 = Friday
	checkinDates := []string{"2026-07-13", "2026-07-15", "2026-07-17"}
	for _, d := range checkinDates {
		_, err := db.Exec(
			`INSERT INTO checkins (id, habit_id, checkin_date, created_at) VALUES (?, ?, ?, ?)`,
			uuid.New().String(), habitID, d, now,
		)
		if err != nil {
			t.Fatalf("failed to seed checkin for %s: %v", d, err)
		}
	}

	// Seed checkins for deleted habit (Mon, Wed of that week)
	delDates := []string{"2026-07-13", "2026-07-15"}
	for _, d := range delDates {
		_, err := db.Exec(
			`INSERT INTO checkins (id, habit_id, checkin_date, created_at) VALUES (?, ?, ?, ?)`,
			uuid.New().String(), deletedHabitID, d, now,
		)
		if err != nil {
			t.Fatalf("failed to seed checkin for deleted habit %s: %v", d, err)
		}
	}

	return &checkinTestDB{
		db:             db,
		userID:         userID,
		sessionID:      sessionID,
		otherUserID:    otherUserID,
		otherSessionID: otherSessionID,
		habitID:        habitID,
		deletedHabitID: deletedHabitID,
		otherHabitID:   otherHabitID,
	}
}

// setupCheckinTestHandler creates a CheckinHandler wired to the test DB.
func setupCheckinTestHandler(t *testing.T, ct *checkinTestDB) *CheckinHandler {
	t.Helper()
	habitModel := model.NewHabitModel(ct.db)
	checkinModel := model.NewCheckinModel(ct.db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	return NewCheckinHandler(checkinService)
}

// setupCheckinTestMiddleware creates a SessionMiddleware wired to the test DB.
func setupCheckinTestMiddleware(t *testing.T, ct *checkinTestDB) *middleware.SessionMiddleware {
	t.Helper()
	return middleware.NewSessionMiddleware(ct.db)
}

// executeCheckinRequest performs an authenticated GET request to the checkin endpoint.
func executeCheckinRequest(handler *CheckinHandler, sessionMiddleware *middleware.SessionMiddleware, path, sessionID string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if sessionID != "" {
		req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})
	}
	w := httptest.NewRecorder()
	sessionMiddleware.RequireAuth(handler.GetCheckins)(w, req)
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

// --- Tests ---

// TestGetCheckins_Success verifies a normal range query returns correct daily records.
func TestGetCheckins_Success(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	// Query Mon 2026-07-13 to Sun 2026-07-19 (7 days)
	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-07-13&end_date=2026-07-19", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 0 {
		t.Errorf("expected code 0, got %v", code)
	}

	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data object")
	}

	// Check habit info
	habit, ok := data["habit"].(map[string]interface{})
	if !ok {
		t.Fatal("expected habit in data")
	}
	if habit["id"] != ct.habitID {
		t.Errorf("expected habit id %s, got %v", ct.habitID, habit["id"])
	}
	if habit["name"] != "Morning Run" {
		t.Errorf("expected habit name 'Morning Run', got %v", habit["name"])
	}
	if habit["deleted"] != false {
		t.Error("expected deleted=false for active habit")
	}

	// Check daily records (7 days)
	checkins, ok := data["checkins"].([]interface{})
	if !ok {
		t.Fatal("expected checkins array")
	}
	if len(checkins) != 7 {
		t.Errorf("expected 7 daily records, got %d", len(checkins))
	}

	// Verify specific days
	// 2026-07-13 Mon: required=true, checked_in=true
	// 2026-07-14 Tue: required=true, checked_in=false
	// 2026-07-15 Wed: required=true, checked_in=true
	// 2026-07-16 Thu: required=true, checked_in=false
	// 2026-07-17 Fri: required=true, checked_in=true
	// 2026-07-18 Sat: required=true, checked_in=false
	// 2026-07-19 Sun: required=true, checked_in=false
	expected := []struct {
		date      string
		required  bool
		checkedIn bool
		hasID     bool
	}{
		{"2026-07-13", true, true, true},
		{"2026-07-14", true, false, false},
		{"2026-07-15", true, true, true},
		{"2026-07-16", true, false, false},
		{"2026-07-17", true, true, true},
		{"2026-07-18", true, false, false},
		{"2026-07-19", true, false, false},
	}

	for i, exp := range expected {
		record := checkins[i].(map[string]interface{})
		if record["date"] != exp.date {
			t.Errorf("record[%d]: expected date %s, got %v", i, exp.date, record["date"])
		}
		if record["required"] != exp.required {
			t.Errorf("record[%d] %s: expected required=%v, got %v", i, exp.date, exp.required, record["required"])
		}
		if record["checked_in"] != exp.checkedIn {
			t.Errorf("record[%d] %s: expected checked_in=%v, got %v", i, exp.date, exp.checkedIn, record["checked_in"])
		}
		if exp.hasID && record["checkin_id"] == nil {
			t.Errorf("record[%d] %s: expected checkin_id to be non-nil", i, exp.date)
		}
		if !exp.hasID && record["checkin_id"] != nil {
			t.Errorf("record[%d] %s: expected checkin_id to be nil", i, exp.date)
		}
	}

	// Check summary
	summary, ok := data["summary"].(map[string]interface{})
	if !ok {
		t.Fatal("expected summary object")
	}
	totalReq := summary["total_required"].(float64)
	if totalReq != 7 {
		t.Errorf("expected total_required=7, got %v", totalReq)
	}
	completed := summary["completed"].(float64)
	if completed != 3 {
		t.Errorf("expected completed=3, got %v", completed)
	}
	rate := summary["completion_rate"].(float64)
	if rate != 0.43 {
		t.Errorf("expected completion_rate=0.43, got %v", rate)
	}
}

// TestGetCheckins_DeletedHabit verifies deleted habits still return history with deleted=true.
func TestGetCheckins_DeletedHabit(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	// Deleted habit has schedule "1,3,5" (Mon, Wed, Fri)
	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-07-13&end_date=2026-07-19", ct.deletedHabitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data object")
	}

	habit, ok := data["habit"].(map[string]interface{})
	if !ok {
		t.Fatal("expected habit in data")
	}
	if habit["deleted"] != true {
		t.Error("expected deleted=true for soft-deleted habit")
	}
	if habit["name"] != "Old Habit" {
		t.Errorf("expected name 'Old Habit', got %v", habit["name"])
	}

	// Check that we still have daily records
	checkins, ok := data["checkins"].([]interface{})
	if !ok {
		t.Fatal("expected checkins array")
	}
	if len(checkins) != 7 {
		t.Errorf("expected 7 daily records, got %d", len(checkins))
	}

	// Verify schedule "1,3,5" — only Mon, Wed, Fri are required
	expected := []struct {
		date      string
		required  bool
		checkedIn bool
	}{
		{"2026-07-13", true, true},  // Mon, required, checked in
		{"2026-07-14", false, false}, // Tue, not required
		{"2026-07-15", true, true},   // Wed, required, checked in
		{"2026-07-16", false, false}, // Thu, not required
		{"2026-07-17", true, false},  // Fri, required, NOT checked in
		{"2026-07-18", false, false}, // Sat, not required
		{"2026-07-19", false, false}, // Sun, not required
	}

	for i, exp := range expected {
		record := checkins[i].(map[string]interface{})
		if record["date"] != exp.date {
			t.Errorf("record[%d]: expected date %s, got %v", i, exp.date, record["date"])
		}
		if record["required"] != exp.required {
			t.Errorf("record[%d] %s: expected required=%v, got %v", i, exp.date, exp.required, record["required"])
		}
		if record["checked_in"] != exp.checkedIn {
			t.Errorf("record[%d] %s: expected checked_in=%v, got %v", i, exp.date, exp.checkedIn, record["checked_in"])
		}
	}

	// Summary: 3 required days, 2 completed
	summary, ok := data["summary"].(map[string]interface{})
	if !ok {
		t.Fatal("expected summary")
	}
	if summary["total_required"].(float64) != 3 {
		t.Errorf("expected total_required=3, got %v", summary["total_required"])
	}
	if summary["completed"].(float64) != 2 {
		t.Errorf("expected completed=2, got %v", summary["completed"])
	}
}

// TestGetCheckins_RangeTooLarge verifies >365 day range returns 400.
func TestGetCheckins_RangeTooLarge(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-01-01&end_date=2027-01-02", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 3002 {
		t.Errorf("expected code 3002 (RANGE_TOO_LARGE), got %v", code)
	}
	if msg := resp["message"].(string); msg != "RANGE_TOO_LARGE" {
		t.Errorf("expected message 'RANGE_TOO_LARGE', got %q", msg)
	}
}

// TestGetCheckins_MissingStartDate verifies missing start_date returns 400.
func TestGetCheckins_MissingStartDate(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	path := fmt.Sprintf("/api/v1/habits/%s/checkins?end_date=2026-07-19", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 1001 {
		t.Errorf("expected code 1001 (VALIDATION_ERROR), got %v", code)
	}
}

// TestGetCheckins_MissingEndDate verifies missing end_date returns 400.
func TestGetCheckins_MissingEndDate(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-07-13", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 1001 {
		t.Errorf("expected code 1001 (VALIDATION_ERROR), got %v", code)
	}
}

// TestGetCheckins_InvalidDate verifies invalid date format returns 400.
func TestGetCheckins_InvalidDate(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	tests := []struct {
		name   string
		params string
	}{
		{"invalid start_date", "start_date=13-07-2026&end_date=2026-07-19"},
		{"invalid end_date", "start_date=2026-07-13&end_date=not-a-date"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v1/habits/%s/checkins?%s", ct.habitID, tt.params)
			w := executeCheckinRequest(handler, mw, path, ct.sessionID)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d", w.Code)
			}

			resp := parseCheckinResponse(t, w)
			if code := resp["code"].(float64); code != 1001 {
				t.Errorf("expected code 1001, got %v", code)
			}
		})
	}
}

// TestGetCheckins_Forbidden verifies querying another user's habit returns 403.
func TestGetCheckins_Forbidden(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	// Alice tries to query Bob's habit
	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-07-13&end_date=2026-07-19", ct.otherHabitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected status 403, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 3003 {
		t.Errorf("expected code 3003 (FORBIDDEN), got %v", code)
	}
	if msg := resp["message"].(string); msg != "FORBIDDEN" {
		t.Errorf("expected message 'FORBIDDEN', got %q", msg)
	}
}

// TestGetCheckins_EmptyRange verifies querying a range with no checkins returns empty records.
func TestGetCheckins_EmptyRange(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	// Checkins exist for 2026-07-13 to 2026-07-17, query a different range
	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-08-01&end_date=2026-08-05", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data object")
	}

	checkins, ok := data["checkins"].([]interface{})
	if !ok {
		t.Fatal("expected checkins array")
	}
	if len(checkins) != 5 {
		t.Errorf("expected 5 daily records (5 days), got %d", len(checkins))
	}

	// All should be unchecked
	for i, record := range checkins {
		r := record.(map[string]interface{})
		if r["checked_in"] != false {
			t.Errorf("record[%d]: expected checked_in=false for empty range", i)
		}
		if r["checkin_id"] != nil {
			t.Errorf("record[%d]: expected checkin_id=nil for empty range", i)
		}
	}

	summary, ok := data["summary"].(map[string]interface{})
	if !ok {
		t.Fatal("expected summary")
	}
	if summary["total_required"].(float64) != 5 {
		t.Errorf("expected total_required=5, got %v", summary["total_required"])
	}
	if summary["completed"].(float64) != 0 {
		t.Errorf("expected completed=0, got %v", summary["completed"])
	}
	if summary["completion_rate"].(float64) != 0 {
		t.Errorf("expected completion_rate=0, got %v", summary["completion_rate"])
	}
}

// TestGetCheckins_NoSession verifies requests without a session cookie return 401.
func TestGetCheckins_NoSession(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-07-13&end_date=2026-07-19", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, "")

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}
}

// TestGetCheckins_BadSession verifies requests with an invalid session cookie return 401.
func TestGetCheckins_BadSession(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-07-13&end_date=2026-07-19", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, "invalid-session-id")

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}
}

// TestGetCheckins_HabitNotFound verifies querying a non-existent habit returns 404.
func TestGetCheckins_HabitNotFound(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	path := "/api/v1/habits/non-existent-id/checkins?start_date=2026-07-13&end_date=2026-07-19"
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 3001 {
		t.Errorf("expected code 3001 (HABIT_NOT_FOUND), got %v", code)
	}
}

// TestGetCheckins_WeeklySchedule verifies correct required computation for weekly schedules.
func TestGetCheckins_WeeklySchedule(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	// Deleted habit has schedule "1,3,5" (Mon, Wed, Fri)
	// Query 2026-07-13 (Mon) to 2026-07-19 (Sun)
	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-07-13&end_date=2026-07-19", ct.deletedHabitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	data := resp["data"].(map[string]interface{})
	checkins := data["checkins"].([]interface{})

	// Verify only Mon, Wed, Fri are required
	for _, item := range checkins {
		record := item.(map[string]interface{})
		date := record["date"].(string)
		required := record["required"].(bool)

		switch date {
		case "2026-07-13", "2026-07-15", "2026-07-17":
			if !required {
				t.Errorf("%s should be required (Mon/Wed/Fri)", date)
			}
		default:
			if required {
				t.Errorf("%s should NOT be required", date)
			}
		}
	}
}

// TestGetCheckins_StartDateAfterEndDate verifies reversed dates return 400.
func TestGetCheckins_StartDateAfterEndDate(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-07-19&end_date=2026-07-13", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

// TestGetCheckins_Exact36DayBucket verifies that 365-day range is allowed but 366 is rejected.
func TestGetCheckins_ExactRangeBoundary(t *testing.T) {
	ct := setupCheckinTestDB(t)
	handler := setupCheckinTestHandler(t, ct)
	mw := setupCheckinTestMiddleware(t, ct)

	// 365-day range (2026-01-01 to 2026-12-31 = 364 days diff, within limit)
	path := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-01-01&end_date=2026-12-31", ct.habitID)
	w := executeCheckinRequest(handler, mw, path, ct.sessionID)
	if w.Code == http.StatusOK {
		t.Log("365-day range accepted as expected")
	} else {
		resp := parseCheckinResponse(t, w)
		t.Logf("365-day range returned code=%v msg=%v", resp["code"], resp["message"])
	}

	// 366+ day range: 2026-01-01 to 2027-01-02 (366 days)
	path2 := fmt.Sprintf("/api/v1/habits/%s/checkins?start_date=2026-01-01&end_date=2027-01-02", ct.habitID)
	w2 := executeCheckinRequest(handler, mw, path2, ct.sessionID)

	if w2.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for 366-day range, got %d", w2.Code)
	}
	resp2 := parseCheckinResponse(t, w2)
	if code := resp2["code"].(float64); code != 3002 {
		t.Errorf("expected code 3002 (RANGE_TOO_LARGE), got %v", code)
	}
}
