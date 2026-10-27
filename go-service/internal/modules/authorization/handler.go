package authorization

import (
	"net/http"
	"sort"

	"hexavante-api-go/internal/database"
	"hexavante-api-go/internal/middleware"
	"hexavante-api-go/internal/response"
)

func loadRolesPermissions(r *http.Request, userID string) ([]string, []string) {
	roles := middleware.FetchRoles(r.Context(), userID)
	if len(roles) == 0 {
		return []string{}, []string{}
	}
	q := `SELECT DISTINCT p.name FROM role_permissions rp
		INNER JOIN roles r ON r.id = rp.role_id
		INNER JOIN permissions p ON p.id = rp.permission_id
		WHERE r.name IN (`
	args := make([]interface{}, 0, len(roles))
	for i, role := range roles {
		if i > 0 {
			q += ","
		}
		q += "?"
		args = append(args, role)
	}
	q += `)`
	rows, err := database.DB.QueryContext(r.Context(), q, args...)
	if err != nil {
		return roles, []string{}
	}
	defer rows.Close()
	set := map[string]bool{}
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			set[name] = true
		}
	}
	perms := make([]string, 0, len(set))
	for name := range set {
		perms = append(perms, name)
	}
	sort.Strings(perms)
	return roles, perms
}

// Context replica GET /api/v1/authorization/context.
func Context(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	roles, perms := loadRolesPermissions(r, user.ID)
	response.JSON(w, http.StatusOK, map[string]interface{}{
		"userId": user.ID, "roles": roles, "permissions": perms, "directPermissions": []string{},
	})
}

// Check replica GET /api/v1/authorization/check/:permission.
func Check(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	perm := r.PathValue("permission")
	_, perms := loadRolesPermissions(r, user.ID)
	allowed := false
	for _, p := range perms {
		if p == perm {
			allowed = true
			break
		}
	}
	if !allowed {
		response.Error(w, http.StatusForbidden, "FORBIDDEN", "Permissão insuficiente")
		return
	}
	response.JSON(w, http.StatusOK, map[string]interface{}{"allowed": true, "permission": perm})
}

// Permissions replica GET /api/v1/authorization/permissions.
func Permissions(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	_, perms := loadRolesPermissions(r, user.ID)
	response.JSON(w, http.StatusOK, map[string]interface{}{"permissions": perms})
}
