package handler

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/middleware"
	"github.com/Androidown/habit-tracking/backend/internal/service"
)

// datePattern validates YYYY-MM-DD format.
var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// CheckinHandler handles check-in HTTP requests.
type CheckinHandler struct {
	checkinService *service.CheckinService
	authMiddleware *middleware.AuthMiddleware
}

// NewCheckinHandler creates a new CheckinHandler.
func NewCheckinHandler(checkinService *service.CheckinService, authMiddleware *middleware.AuthMiddleware) *CheckinHandler {
	return &CheckinHandler{
		checkinService: checkinService,
		authMiddleware: authMiddleware,
	}
}

// GetDailyCheckins handles GET /api/v1/checkins/daily.
func (h *CheckinHandler) GetDailyCheckins(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"code":    9999,
			"message": "METHOD_NOT_ALLOWED",
		})
		return
	}

	// Extract authenticated user
	userID := middleware.GetUserID(r)
	if userID == "" {
		// This shouldn't happen if middleware is applied, but handle gracefully
		writeJSON(w, http.StatusUnauthorized, map[string]interface{}{
			"code":    401,
			"message": "AUTH_REQUIRED",
		})
		return
	}

	// Parse date query parameter
	dateStr := r.URL.Query().Get("date")

	// Empty date returns empty list (per spec)
	if dateStr == "" {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"code":    0,
			"message": "ok",
			"data": map[string]interface{}{
				"date":   "",
				"habits": []interface{}{},
				"stats": map[string]interface{}{
					"required":     0,
					"completed":    0,
					"total_habits": 0,
				},
			},
		})
		return
	}

	// Validate date format
	if !datePattern.MatchString(dateStr) {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"code":    1001,
			"message": "VALIDATION_ERROR",
			"data": []middleware.ValidationError{
				{Field: "date", Reason: "invalid date format, expected YYYY-MM-DD"},
			},
		})
		return
	}

	// Validate it's a real date
	if _, err := time.Parse("2006-01-02", dateStr); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"code":    1001,
			"message": "VALIDATION_ERROR",
			"data": []middleware.ValidationError{
				{Field: "date", Reason: "invalid date, not a real calendar date"},
			},
		})
		return
	}

	// Call service
	result, err := h.checkinService.GetDailyCheckins(userID, dateStr)
	if err != nil {
		se := service.AsServiceError(err)
		if se == nil {
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    9999,
				"message": "INTERNAL_ERROR",
			})
			return
		}

		switch se.Code {
		case 1001: // VALIDATION_ERROR
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    se.Code,
				"message": se.Message,
				"data":    se.Data,
			})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    9999,
				"message": "INTERNAL_ERROR",
			})
		}
		return
	}

	// Return success response
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"code":    0,
		"message": "ok",
		"data":    result,
	})
}

// DeleteCheckin handles DELETE /api/v1/habits/{habit_id}/checkins/{date}.
func (h *CheckinHandler) DeleteCheckin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"code":    9999,
			"message": "METHOD_NOT_ALLOWED",
		})
		return
	}

	// Extract authenticated user
	userID := middleware.GetUserID(r)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]interface{}{
			"code":    401,
			"message": "AUTH_REQUIRED",
		})
		return
	}

	// Extract path parameters: /api/v1/habits/{habit_id}/checkins/{date}
	// Parse using path prefix removal
	habitID, dateStr := parseDeletePath(r.URL.Path)
	if habitID == "" || dateStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"code":    1001,
			"message": "VALIDATION_ERROR",
			"data": []middleware.ValidationError{
				{Field: "path", Reason: "invalid path format, expected /api/v1/habits/{habit_id}/checkins/{date}"},
			},
		})
		return
	}

	// Call service
	result, err := h.checkinService.DeleteCheckin(habitID, userID, dateStr)
	if err != nil {
		se := service.AsServiceError(err)
		if se == nil {
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    9999,
				"message": "INTERNAL_ERROR",
			})
			return
		}

		switch se.Code {
		case 1001: // VALIDATION_ERROR
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    se.Code,
				"message": se.Message,
				"data":    se.Data,
			})
		case 1003: // FORBIDDEN
			writeJSON(w, http.StatusForbidden, map[string]interface{}{
				"code":    se.Code,
				"message": se.Message,
				"data":    se.Data,
			})
		case 1004: // CHECKIN_NOT_FOUND
			writeJSON(w, http.StatusNotFound, map[string]interface{}{
				"code":    1004,
				"message": "CHECKIN_NOT_FOUND",
			})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    9999,
				"message": "INTERNAL_ERROR",
			})
		}
		return
	}

	// Return success response
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"code":    0,
		"message": "ok",
		"data":    result,
	})
}

// parseDeletePath extracts habit_id and date from a DELETE checkin path.
// Expected format: /api/v1/habits/{habit_id}/checkins/{date}
func parseDeletePath(path string) (string, string) {
	const prefix = "/api/v1/habits/"
	if len(path) <= len(prefix) {
		return "", ""
	}
	rest := path[len(prefix):]

	// rest should be: {habit_id}/checkins/{date}
	parts := strings.SplitN(rest, "/checkins/", 2)
	if len(parts) != 2 {
		return "", ""
	}
	if parts[0] == "" || parts[1] == "" {
		return "", ""
	}
	return parts[0], parts[1]
}

// RegisterRoutes registers check-in related routes on the given mux.
func (h *CheckinHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/checkins/daily", h.authMiddleware.Authenticate(h.GetDailyCheckins))
	mux.HandleFunc("/api/v1/habits/", h.authMiddleware.Authenticate(h.DeleteCheckin))
}

