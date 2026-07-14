package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/service"
)

// CheckinHandler handles check-in HTTP requests.
type CheckinHandler struct {
	checkinService *service.CheckinService
}

// NewCheckinHandler creates a new CheckinHandler.
func NewCheckinHandler(checkinService *service.CheckinService) *CheckinHandler {
	return &CheckinHandler{checkinService: checkinService}
}

// habitCheckinsResponse is the standard response for the checkins query endpoint.
type habitCheckinsResponse struct {
	Code    int                         `json:"code"`
	Message string                      `json:"message"`
	Data    *service.HabitCheckinsOutput `json:"data,omitempty"`
}

// errResponse is a minimal error response.
type errResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// GetCheckins handles GET /api/v1/habits/{habit_id}/checkins.
//
// Query parameters:
//   - start_date (required): YYYY-MM-DD
//   - end_date (required): YYYY-MM-DD
//   - timezone (optional): IANA timezone name (reserved for future use)
func (h *CheckinHandler) GetCheckins(w http.ResponseWriter, r *http.Request) {
	// Extract habit_id from path: /api/v1/habits/{habit_id}/checkins
	habitID := extractHabitID(r.URL.Path)
	if habitID == "" {
		writeCheckinError(w, http.StatusBadRequest, 1001, "VALIDATION_ERROR", []interface{}{
			map[string]string{"field": "habit_id", "reason": "required"},
		})
		return
	}

	// Parse query parameters
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	// Validate start_date
	if startDate == "" {
		writeCheckinError(w, http.StatusBadRequest, 1001, "VALIDATION_ERROR", []interface{}{
			map[string]string{"field": "start_date", "reason": "required"},
		})
		return
	}
	if _, err := time.Parse("2006-01-02", startDate); err != nil {
		writeCheckinError(w, http.StatusBadRequest, 1001, "VALIDATION_ERROR", []interface{}{
			map[string]string{"field": "start_date", "reason": "invalid date format, expected YYYY-MM-DD"},
		})
		return
	}

	// Validate end_date
	if endDate == "" {
		writeCheckinError(w, http.StatusBadRequest, 1001, "VALIDATION_ERROR", []interface{}{
			map[string]string{"field": "end_date", "reason": "required"},
		})
		return
	}
	if _, err := time.Parse("2006-01-02", endDate); err != nil {
		writeCheckinError(w, http.StatusBadRequest, 1001, "VALIDATION_ERROR", []interface{}{
			map[string]string{"field": "end_date", "reason": "invalid date format, expected YYYY-MM-DD"},
		})
		return
	}

	// Get user ID from middleware-set header
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeCheckinError(w, http.StatusUnauthorized, 9999, "UNAUTHORIZED", nil)
		return
	}

	// Call service
	output, err := h.checkinService.GetHabitCheckins(habitID, userID, startDate, endDate)
	if err != nil {
		se := service.AsServiceError(err)
		if se == nil {
			writeCheckinError(w, http.StatusInternalServerError, 9999, "INTERNAL_ERROR", nil)
			return
		}

		switch se.Code {
		case 1001: // VALIDATION_ERROR
			writeCheckinError(w, http.StatusBadRequest, se.Code, se.Message, se.Data)
		case 3001: // HABIT_NOT_FOUND
			writeCheckinError(w, http.StatusNotFound, se.Code, se.Message, nil)
		case 3002: // RANGE_TOO_LARGE
			writeCheckinError(w, http.StatusBadRequest, se.Code, se.Message, nil)
		case 3003: // FORBIDDEN
			writeCheckinError(w, http.StatusForbidden, se.Code, se.Message, nil)
		default:
			writeCheckinError(w, http.StatusInternalServerError, 9999, "INTERNAL_ERROR", nil)
		}
		return
	}

	// Success response
	writeCheckinJSON(w, http.StatusOK, habitCheckinsResponse{
		Code:    0,
		Message: "ok",
		Data:    output,
	})
}

// writeCheckinJSON serializes a success response as JSON.
func writeCheckinJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to encode JSON response: %v", err)
	}
}

// writeCheckinError serializes an error response as JSON.
func writeCheckinError(w http.ResponseWriter, status int, code int, message string, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	payload := errResponse{
		Code:    code,
		Message: message,
		Data:    data,
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to encode JSON error response: %v", err)
	}
}

// extractHabitID parses the habit ID from the URL path.
// Expected format: /api/v1/habits/{habit_id}/checkins[/...]
func extractHabitID(path string) string {
	// Trim trailing slash
	path = strings.TrimSuffix(path, "/")
	parts := strings.Split(path, "/")
	// parts should be ["", "api", "v1", "habits", "{habit_id}", "checkins", ...]
	// Index 4 is the habit_id
	for i, p := range parts {
		if p == "habits" && i+2 < len(parts) && parts[i+2] == "checkins" {
			return parts[i+1]
		}
	}
	return ""
}
