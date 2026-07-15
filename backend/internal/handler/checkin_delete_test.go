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
)

// executeDeleteCheckinRequest performs a DELETE request to the checkin endpoint
// through the mux (which applies auth middleware).
func executeDeleteCheckinRequest(handler *CheckinHandler, sessionID, habitID, date string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	url := fmt.Sprintf("/api/v1/habits/%s/checkins/%s", habitID, date)
	req := httptest.NewRequest(http.MethodDelete, url, nil)
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

// mustInsert is a test helper that inserts data and returns without error.
func mustInsert(t *testing.T, db *sql.DB, query string, args ...interface{}) {
	t.Helper()
	_, err := db.Exec(query, args...)
	if err != nil {
		t.Fatalf("failed to execute %q: %v", query, err)
	}
}

// TestDeleteCheckin_Success verifies a successful checkin deletion returns 200
// with { deleted: true, habit_id, date }.
func TestDeleteCheckin_Success(t *testing.T) {
	db := setupCheckinTestDB(t)
	today := time.Now().UTC().Format("2006-01-02")

	userID := "int-user-1"
	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "int@example.com", "intuser", "hash", time.Now().UTC(), time.Now().UTC())

	sessionID := "int-session-1"
	mustInsert(t, db, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour))

	habitID := "550e8400-e29b-41d4-a716-446655440000"
	mustInsert(t, db, `INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		habitID, userID, "Integration Test Habit", "daily", "active", time.Now().UTC(), time.Now().UTC())

	checkinID := "int-checkin-1"
	mustInsert(t, db, `INSERT INTO checkins (id, habit_id, user_id, checkin_date, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		checkinID, habitID, userID, today, time.Now().UTC(), time.Now().UTC())

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	w := executeDeleteCheckinRequest(handler, sessionID, habitID, today)
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
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

	if deleted, ok := data["deleted"].(bool); !ok || !deleted {
		t.Errorf("expected deleted: true, got %v", data["deleted"])
	}
	if hid, ok := data["habit_id"].(string); !ok || hid != habitID {
		t.Errorf("expected habit_id %q, got %v", habitID, data["habit_id"])
	}
	if d, ok := data["date"].(string); !ok || d != today {
		t.Errorf("expected date %q, got %v", today, data["date"])
	}

	// Verify checkin is actually deleted from database
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM checkins WHERE id = ?`, checkinID).Scan(&count)
	if err != nil {
		t.Fatalf("failed to query checkin: %v", err)
	}
	if count != 0 {
		t.Error("expected checkin record to be deleted from database")
	}
}

// TestDeleteCheckin_NotFound verifies 404 when no checkin record exists.
func TestDeleteCheckin_NotFound(t *testing.T) {
	db := setupCheckinTestDB(t)
	today := time.Now().UTC().Format("2006-01-02")

	userID := "nf-user-1"
	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, "nf@example.com", "nfuser", "hash", time.Now().UTC(), time.Now().UTC())
	sessionID := "nf-session-1"
	mustInsert(t, db, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		sessionID, userID, time.Now().UTC().Add(24*time.Hour))
	habitID := "550e8400-e29b-41d4-a716-446655440001"
	mustInsert(t, db, `INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		habitID, userID, "Not Found Test", "daily", "active", time.Now().UTC(), time.Now().UTC())

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	w := executeDeleteCheckinRequest(handler, sessionID, habitID, today)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 1004 {
		t.Errorf("expected code 1004 (CHECKIN_NOT_FOUND), got %v", code)
	}
	if msg := resp["message"].(string); msg != "CHECKIN_NOT_FOUND" {
		t.Errorf("expected message 'CHECKIN_NOT_FOUND', got %q", msg)
	}
}

// TestDeleteCheckin_Forbidden verifies 403 when accessing another user's habit.
func TestDeleteCheckin_Forbidden(t *testing.T) {
	db := setupCheckinTestDB(t)
	today := time.Now().UTC().Format("2006-01-02")

	// User A (habit owner)
	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"user-a", "a@example.com", "userA", "hash", time.Now().UTC(), time.Now().UTC())
	// User B (attacker)
	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"user-b", "b@example.com", "userB", "hash", time.Now().UTC(), time.Now().UTC())
	mustInsert(t, db, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		"session-b", "user-b", time.Now().UTC().Add(24*time.Hour))
	// User A's habit
	mustInsert(t, db, `INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"660e8400-e29b-41d4-a716-446655440000", "user-a", "User A's Habit", "daily", "active", time.Now().UTC(), time.Now().UTC())

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	w := executeDeleteCheckinRequest(handler, "session-b", "660e8400-e29b-41d4-a716-446655440000", today)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected status 403, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 1003 {
		t.Errorf("expected code 1003 (FORBIDDEN), got %v", code)
	}
	if msg := resp["message"].(string); msg != "FORBIDDEN" {
		t.Errorf("expected message 'FORBIDDEN', got %q", msg)
	}
}

// TestDeleteCheckin_InvalidDate verifies 400 for invalid date formats.
func TestDeleteCheckin_InvalidDate(t *testing.T) {
	db := setupCheckinTestDB(t)

	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"inv-date-user", "invdate@example.com", "invdateuser", "hash", time.Now().UTC(), time.Now().UTC())
	mustInsert(t, db, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		"inv-date-session", "inv-date-user", time.Now().UTC().Add(24*time.Hour))
	mustInsert(t, db, `INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"770e8400-e29b-41d4-a716-446655440000", "inv-date-user", "Invalid Date Habit", "daily", "active", time.Now().UTC(), time.Now().UTC())

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	invalidDates := []string{"2026/07/14", "14-07-2026", "not-a-date", "2026-13-01"}
	for _, dateStr := range invalidDates {
		t.Run(dateStr, func(t *testing.T) {
			w := executeDeleteCheckinRequest(handler, "inv-date-session", "770e8400-e29b-41d4-a716-446655440000", dateStr)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400 for date %q, got %d", dateStr, w.Code)
			}
			resp := parseCheckinResponse(t, w)
			if code := resp["code"].(float64); code != 1001 {
				t.Errorf("expected code 1001, got %v", code)
			}
		})
	}
}

// TestDeleteCheckin_NoAuth verifies 401 when no session cookie is provided.
func TestDeleteCheckin_NoAuth(t *testing.T) {
	db := setupCheckinTestDB(t)

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	w := executeDeleteCheckinRequest(handler, "", "880e8400-e29b-41d4-a716-446655440000", "2026-07-14")
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}
}

// TestDeleteCheckin_InvalidHabitID verifies 400 for non-UUID habit_id.
func TestDeleteCheckin_InvalidHabitID(t *testing.T) {
	db := setupCheckinTestDB(t)
	today := time.Now().UTC().Format("2006-01-02")

	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"inv-habit-user", "invhabit@example.com", "invhabit", "hash", time.Now().UTC(), time.Now().UTC())
	mustInsert(t, db, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		"inv-habit-session", "inv-habit-user", time.Now().UTC().Add(24*time.Hour))

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	w := executeDeleteCheckinRequest(handler, "inv-habit-session", "not-a-uuid", today)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 1001 {
		t.Errorf("expected code 1001, got %v", code)
	}
}

// TestDeleteCheckin_WrongMethod verifies non-DELETE methods return 405.
func TestDeleteCheckin_WrongMethod(t *testing.T) {
	db := setupCheckinTestDB(t)
	today := time.Now().UTC().Format("2006-01-02")

	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"method-user", "method@example.com", "methoduser", "hash", time.Now().UTC(), time.Now().UTC())
	mustInsert(t, db, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		"method-session", "method-user", time.Now().UTC().Add(24*time.Hour))
	mustInsert(t, db, `INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"990e8400-e29b-41d4-a716-446655440000", "method-user", "Method Test", "daily", "active", time.Now().UTC(), time.Now().UTC())

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	methods := []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch}
	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			url := fmt.Sprintf("/api/v1/habits/%s/checkins/%s", "990e8400-e29b-41d4-a716-446655440000", today)
			req := httptest.NewRequest(method, url, nil)
			req.AddCookie(&http.Cookie{Name: "session_id", Value: "method-session"})
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, req)

			if w.Code != http.StatusMethodNotAllowed {
				t.Errorf("expected 405 for %s, got %d", method, w.Code)
			}
		})
	}
}

// TestDeleteCheckin_NotToday verifies 400 when date is not today.
func TestDeleteCheckin_NotToday(t *testing.T) {
	db := setupCheckinTestDB(t)

	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"nt-user", "nt@example.com", "ntuser", "hash", time.Now().UTC(), time.Now().UTC())
	mustInsert(t, db, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		"nt-session", "nt-user", time.Now().UTC().Add(24*time.Hour))
	mustInsert(t, db, `INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"aa0e8400-e29b-41d4-a716-446655440000", "nt-user", "Not Today Habit", "daily", "active", time.Now().UTC(), time.Now().UTC())

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	w := executeDeleteCheckinRequest(handler, "nt-session", "aa0e8400-e29b-41d4-a716-446655440000", yesterday)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for non-today date, got %d", w.Code)
	}

	resp := parseCheckinResponse(t, w)
	if code := resp["code"].(float64); code != 1001 {
		t.Errorf("expected code 1001, got %v", code)
	}
}

// TestDeleteCheckin_ResponseFormat verifies the standardized JSON response structure.
func TestDeleteCheckin_ResponseFormat(t *testing.T) {
	db := setupCheckinTestDB(t)
	today := time.Now().UTC().Format("2006-01-02")

	mustInsert(t, db, `INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"fmt-user", "fmt@example.com", "fmtuser", "hash", time.Now().UTC(), time.Now().UTC())
	mustInsert(t, db, `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		"fmt-session", "fmt-user", time.Now().UTC().Add(24*time.Hour))
	mustInsert(t, db, `INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"bb0e8400-e29b-41d4-a716-446655440000", "fmt-user", "Format Check Habit", "daily", "active", time.Now().UTC(), time.Now().UTC())
	mustInsert(t, db, `INSERT INTO checkins (id, habit_id, user_id, checkin_date, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		"fmt-checkin-1", "bb0e8400-e29b-41d4-a716-446655440000", "fmt-user", today, time.Now().UTC(), time.Now().UTC())

	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)
	authMiddleware := middleware.NewAuthMiddleware(db)
	handler := NewCheckinHandler(checkinService, authMiddleware)

	w := executeDeleteCheckinRequest(handler, "fmt-session", "bb0e8400-e29b-41d4-a716-446655440000", today)

	var rawResp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&rawResp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Verify envelope per DEM-185 spec
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

	expectedFields := []string{"deleted", "habit_id", "date"}
	for _, f := range expectedFields {
		if _, ok := data[f]; !ok {
			t.Errorf("data missing '%s' field", f)
		}
	}
}
