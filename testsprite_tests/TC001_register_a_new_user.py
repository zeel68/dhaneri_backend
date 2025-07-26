import requests
import uuid

BASE_URL = "http://localhost:5050"
REGISTER_ENDPOINT = "/api/auth/register"
TIMEOUT = 30

# Placeholder for a valid Bearer token for authorization
BEARER_TOKEN = "your_valid_bearer_token_here"

def test_register_new_user():
    url = BASE_URL + REGISTER_ENDPOINT
    headers = {
        "Content-Type": "application/json"
    }
    # Generate unique email to avoid conflicts
    unique_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "name": "Test User",
        "email": unique_email,
        "phone_number": "1234567890",
        "password": "StrongPassw0rd!",
        "store_id": "store123"
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    # Validate response status code for success (201 Created or 200 OK)
    assert response.status_code in (200, 201), f"Unexpected status code: {response.status_code}, response: {response.text}"

    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Validate expected fields in response (assuming API returns user info or success message)
    # Since PRD does not specify response schema, check for common success indicators
    assert "id" in data or "user" in data or "message" in data, f"Unexpected response content: {data}"

    # Additional validation: email in response if present
    if "user" in data and isinstance(data["user"], dict):
        assert data["user"].get("email") == unique_email, "Returned email does not match registered email"
    elif "email" in data:
        assert data["email"] == unique_email, "Returned email does not match registered email"

test_register_new_user()