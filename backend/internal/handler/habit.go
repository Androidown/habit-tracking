package handler

import (
	"net/http"

	"github.com/Androidown/habit-tracking/backend/internal/middleware"
	"github.com/Androidown/habit-tracking/backend/internal/model"
	"github.com/Androidown/habit-tracking/backend/internal/service"
)

// HabitHandler handles habit-related HTTP requests.
type HabitHandler struct {
	habitService *service.HabitService
}

// NewHabitHandler creates a new HabitHandler.
func NewHabitHandler(habitService *service.HabitService) *HabitHandler {
	return &HabitHandler{habitService: habitService}
}

// Delete handles DELETE /api/v1/habits/{id}
func (h *HabitHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, RegisterResponse{
			Code:    401,
			Message: "UNAUTHORIZED",
		})
		return
	}

	habitID := r.PathValue("id")
	if habitID == "" {
		writeJSON(w, http.StatusBadRequest, RegisterResponse{
			Code:    1001,
			Message: "VALIDATION_ERROR",
			Data: []middleware.ValidationError{
				{Field: "id", Reason: "required"},
			},
		})
		return
	}

	output, err := h.habitService.SoftDelete(habitID, userID)
	if err != nil {
		se := service.AsServiceError(err)
		if se == nil {
			writeJSON(w, http.StatusInternalServerError, RegisterResponse{
				Code:    9999,
				Message: "INTERNAL_ERROR",
			})
			return
		}

		switch se.Code {
		case 1004: // NOT_FOUND
			writeJSON(w, http.StatusNotFound, RegisterResponse{
				Code:    se.Code,
				Message: se.Message,
			})
		default:
			writeJSON(w, http.StatusInternalServerError, RegisterResponse{
				Code:    9999,
				Message: "INTERNAL_ERROR",
			})
		}
		return
	}

	writeJSON(w, http.StatusOK, RegisterResponse{
		Code:    0,
		Message: "ok",
		Data:    output,
	})
}

// List handles GET /api/v1/habits
func (h *HabitHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, RegisterResponse{
			Code:    401,
			Message: "UNAUTHORIZED",
		})
		return
	}

	habits, err := h.habitService.ListActive(userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, RegisterResponse{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		})
		return
	}

	// Return empty array instead of null when no habits exist
	if habits == nil {
		habits = make([]*model.Habit, 0)
	}

	writeJSON(w, http.StatusOK, RegisterResponse{
		Code:    0,
		Message: "ok",
		Data:    habits,
	})
}
