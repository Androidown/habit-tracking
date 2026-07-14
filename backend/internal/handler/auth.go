package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/Androidown/habit-tracking/backend/internal/middleware"
	"github.com/Androidown/habit-tracking/backend/internal/service"
)

// APIResponse is the standard API response envelope.
type APIResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// LoginRequest is the expected JSON body for POST /api/v1/auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthHandler handles authentication HTTP requests.
type AuthHandler struct {
	authService *service.AuthService
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Register handles POST /api/v1/auth/register.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Code:    9999,
			Message: "METHOD_NOT_ALLOWED",
		})
		return
	}

	var req service.RegisterRequest
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
			Code:    1001,
			Message: "VALIDATION_ERROR",
			Data: []service.ValidationError{
				{Field: "body", Reason: "invalid JSON format"},
			},
		})
		return
	}

	output, err := h.authService.Register(&req)
	if err != nil {
		se := service.AsServiceError(err)
		if se == nil {
			writeJSON(w, http.StatusInternalServerError, APIResponse{
				Code:    9999,
				Message: "INTERNAL_ERROR",
			})
			return
		}

		switch se.Code {
		case 1001: // VALIDATION_ERROR
			writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
				Code:    se.Code,
				Message: se.Message,
				Data:    se.Data,
			})
		case 1002: // EMAIL_ALREADY_EXISTS
			writeJSON(w, http.StatusConflict, APIResponse{
				Code:    se.Code,
				Message: se.Message,
			})
		default:
			writeJSON(w, http.StatusInternalServerError, APIResponse{
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
		MaxAge:   86400, // 24 hours in seconds
	})

	writeJSON(w, http.StatusCreated, APIResponse{
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

// Login handles POST /api/v1/auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	// Parse JSON body
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
			Code:    service.CodeValidationError,
			Message: "VALIDATION_ERROR",
			Data:    nil,
		})
		return
	}

	// Validate fields
	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
			Code:    service.CodeValidationError,
			Message: "VALIDATION_ERROR",
			Data:    nil,
		})
		return
	}

	// Call service layer
	output, err := h.authService.Login(req.Email, req.Password)
	if err != nil {
		se := service.AsServiceError(err)
		if se == nil {
			writeJSON(w, http.StatusInternalServerError, APIResponse{
				Code:    9999,
				Message: "INTERNAL_ERROR",
			})
			return
		}

		switch se.Code {
		case service.CodeInvalidCredentials:
			writeJSON(w, http.StatusUnauthorized, APIResponse{
				Code:    se.Code,
				Message: se.Message,
				Data:    nil,
			})
		default:
			writeJSON(w, http.StatusInternalServerError, APIResponse{
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
		MaxAge:   86400, // 24 hours in seconds
	})

	// Return success with user info (no password hash)
	writeJSON(w, http.StatusOK, APIResponse{
		Code:    service.CodeSuccess,
		Message: "SUCCESS",
		Data: map[string]interface{}{
			"user_id":    output.User.ID,
			"email":      output.User.Email,
			"username":   output.User.Username,
			"created_at": output.User.CreatedAt,
		},
	})
}

// Logout handles POST /api/v1/auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := middleware.GetSessionID(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, APIResponse{
			Code:    service.CodeUnauthorized,
			Message: "UNAUTHORIZED",
			Data:    nil,
		})
		return
	}

	if err := h.authService.Logout(sessionID); err != nil {
		log.Printf("logout error: %v", err)
	}

	// Clear the session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})

	writeJSON(w, http.StatusOK, APIResponse{
		Code:    service.CodeSuccess,
		Message: "SUCCESS",
		Data:    nil,
	})
}

// Me handles GET /api/v1/auth/me.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r.Context())
	if user == nil {
		writeJSON(w, http.StatusUnauthorized, APIResponse{
			Code:    service.CodeUnauthorized,
			Message: "UNAUTHORIZED",
			Data:    nil,
		})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Code:    service.CodeSuccess,
		Message: "SUCCESS",
		Data: map[string]interface{}{
			"user_id":    user.ID,
			"email":      user.Email,
			"username":   user.Username,
			"created_at": user.CreatedAt,
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
