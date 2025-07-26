import requests

BASE_URL = "http://localhost:5050"
LOGIN_ENDPOINT = "/api/auth/login"
REGISTER_ENDPOINT = "/api/auth/register"
DELETE_CUSTOMER_ENDPOINT = "/api/store-admin/customers/{customerId}"

def test_login_user():
    # Create a user to test login
    register_url = BASE_URL + REGISTER_ENDPOINT
    login_url = BASE_URL + LOGIN_ENDPOINT

    # Sample user data for registration and login
    user_data = {
        "name": "Test User",
        "email": "testuser_login@example.com",
        "phone_number": "1234567890",
        "password": "TestPass123!",
        "store_id": "test_store_001"
    }

    # Register user first
    try:
        reg_response = requests.post(register_url, json=user_data, timeout=30)
        if reg_response.status_code == 409:
            # User already exists, proceed with login
            pass
        else:
            assert reg_response.status_code == 201 or reg_response.status_code == 200, f"User registration failed: {reg_response.text}"

        # Test successful login
        login_payload = {
            "email": user_data["email"],
            "password": user_data["password"]
        }
        login_response = requests.post(login_url, json=login_payload, timeout=30)
        assert login_response.status_code == 200, f"Login failed with valid credentials: {login_response.text}"
        login_json = login_response.json()
        assert "token" in login_json or "accessToken" in login_json or "jwt" in login_json, "JWT token not found in login response"

        # Test login with invalid password
        invalid_login_payload = {
            "email": user_data["email"],
            "password": "WrongPassword123!"
        }
        invalid_login_response = requests.post(login_url, json=invalid_login_payload, timeout=30)
        assert invalid_login_response.status_code == 401 or invalid_login_response.status_code == 400, "Invalid login did not return expected error status"
        invalid_login_json = invalid_login_response.json()
        # Check for error message presence
        assert any(key in invalid_login_json for key in ["error", "message", "detail"]), "Error message missing for invalid login"

        # Test login with invalid email
        invalid_email_payload = {
            "email": "nonexistent_email@example.com",
            "password": "SomePassword123!"
        }
        invalid_email_response = requests.post(login_url, json=invalid_email_payload, timeout=30)
        assert invalid_email_response.status_code == 401 or invalid_email_response.status_code == 400, "Invalid email login did not return expected error status"
        invalid_email_json = invalid_email_response.json()
        assert any(key in invalid_email_json for key in ["error", "message", "detail"]), "Error message missing for invalid email login"

    finally:
        # Cleanup: delete the created user if possible (requires auth)
        # Since no auth token is available for admin, skip deletion or implement if admin token available
        pass

test_login_user()