import requests
import uuid

BASE_URL = "http://localhost:5050"
REGISTER_URL = f"{BASE_URL}/api/auth/register"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
CHANGE_PASSWORD_URL = f"{BASE_URL}/api/auth/change-password"
DELETE_USER_URL = f"{BASE_URL}/api/store-admin/customers"  # No direct delete user endpoint in auth, so will skip delete user cleanup

TIMEOUT = 30

def test_change_password_with_jwt():
    # Generate unique user data
    unique_suffix = str(uuid.uuid4())
    user_email = f"testuser_{unique_suffix}@example.com"
    user_password = "InitialPass123!"
    new_password = "NewPass456!"
    user_name = "Test User"
    store_id = "test-store-id"  # Assuming a dummy store_id; adjust if needed

    headers = {"Content-Type": "application/json"}

    # Register user
    register_payload = {
        "name": user_name,
        "email": user_email,
        "password": user_password,
        "store_id": store_id
    }

    try:
        reg_resp = requests.post(REGISTER_URL, json=register_payload, headers=headers, timeout=TIMEOUT)
        assert reg_resp.status_code == 201 or reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"

        # Login user to get JWT token
        login_payload = {
            "email": user_email,
            "password": user_password
        }
        login_resp = requests.post(LOGIN_URL, json=login_payload, headers=headers, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        assert "token" in login_data or "accessToken" in login_data, "JWT token not found in login response"
        token = login_data.get("token") or login_data.get("accessToken")
        auth_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # 1) Test successful password change
        change_password_payload = {
            "currentPassword": user_password,
            "newPassword": new_password
        }

        resp = requests.post(CHANGE_PASSWORD_URL, json=change_password_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Change password failed: {resp.text}"

        # Verify login with new password works
        login_payload_new = {
            "email": user_email,
            "password": new_password
        }
        login_resp_new = requests.post(LOGIN_URL, json=login_payload_new, headers=headers, timeout=TIMEOUT)
        assert login_resp_new.status_code == 200, f"Login with new password failed: {login_resp_new.text}"

        # 2) Test change password with invalid current password
        invalid_payload = {
            "currentPassword": "WrongPassword123!",
            "newPassword": "AnotherPass789!"
        }
        resp_invalid = requests.post(CHANGE_PASSWORD_URL, json=invalid_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp_invalid.status_code == 400 or resp_invalid.status_code == 401, "Invalid current password should be rejected"

        # 3) Test change password with invalid new password (e.g., too short)
        invalid_new_pass_payload = {
            "currentPassword": new_password,
            "newPassword": "123"
        }
        resp_invalid_new = requests.post(CHANGE_PASSWORD_URL, json=invalid_new_pass_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp_invalid_new.status_code == 400, "Invalid new password should be rejected"

        # 4) Test change password without authentication
        resp_no_auth = requests.post(CHANGE_PASSWORD_URL, json=change_password_payload, headers={"Content-Type": "application/json"}, timeout=TIMEOUT)
        assert resp_no_auth.status_code == 401 or resp_no_auth.status_code == 403, "Change password without auth should be denied"

    finally:
        # Cleanup: No direct delete user endpoint in auth API.
        # If user deletion is possible via store-admin customers or other means, implement here.
        # Otherwise, user remains in system.
        pass

test_change_password_with_jwt()
