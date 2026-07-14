package handler

import (
	"net/http"
	"regexp"
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

// RegisterRoutes registers check-in related routes on the given mux.
func (h *CheckinHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/checkins/daily", h.authMiddleware.Authenticate(h.GetDailyCheckins))
}

