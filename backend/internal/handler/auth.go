package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/Androidown/habit-tracking/backend/internal/middleware"
	"github.com/Androidown/habit-tracking/backend/internal/service"
)

// AuthHandler handles authentication HTTP requests.
type AuthHandler struct {
	authService *service.AuthService
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// RegisterResponse is the standard API response envelope.
type RegisterResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Register handles POST /api/v1/auth/register.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, RegisterResponse{
			Code:    9999,
			Message: "METHOD_NOT_ALLOWED",
		})
		return
	}

	// Parse request body
	var req middleware.RegisterRequest
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, RegisterResponse{
			Code:    1001,
			Message: "VALIDATION_ERROR",
			Data: []middleware.ValidationError{
				{Field: "body", Reason: "invalid JSON format"},
			},
		})
		return
	}

	// Call service layer
	output, err := h.authService.Register(&req)
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
		case 1001: // VALIDATION_ERROR
			writeJSON(w, http.StatusUnprocessableEntity, RegisterResponse{
				Code:    se.Code,
				Message: se.Message,
				Data:    se.Data,
			})
		case 1002: // EMAIL_ALREADY_EXISTS
			writeJSON(w, http.StatusConflict, RegisterResponse{
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

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    output.Session.ID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
		// MaxAge: 0 means session cookie (browser-session length) in std lib.
		// We explicitly set MaxAge for our session duration.
		MaxAge:   86400, // 24 hours in seconds
	})

	// Return success response
	writeJSON(w, http.StatusCreated, RegisterResponse{
		Code:    0,
		Message: "ok",
		Data: map[string]interface{}{
			"user_id":    output.User.ID,
			"email":      output.User.Email,
			"username":   output.User.Username,
			"created_at": output.User.CreatedAt,
		},
	})
}

// writeJSON serialises the payload as JSON and writes to the response.
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to encode JSON response: %v", err)
	}
}
