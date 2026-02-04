# Public registration API

API for **public user registration** (no authentication). Users created via this endpoint have **status `pending`** and **cannot login or access the system** until an administrator sets their status to **`active`**.

---

## Endpoint

| Item   | Value |
|--------|--------|
| Method | `POST` |
| URL    | `/v1/public/register` |
| Auth   | None (public) |
| Headers | `Content-Type: application/json` |

---

## Request body

| Field | Type | Required | Validation / notes |
|-------|------|----------|--------------------|
| **name** | string | Yes | Trimmed; user's full name |
| **email** | string | Yes | Valid email format; stored lowercase; must be **unique** |
| **password** | string | Yes | Min **8 characters**; at least **1 letter** and **1 number** |
| **isEmailVerified** | boolean | No | Optional; default `false` |
| **roleIds** | array of strings | No | Optional; array of valid MongoDB ObjectIds (Role IDs); default `[]` |

**Example**

```json
{
  "name": "Jane Doe",
  "email": "jane.doe@example.com",
  "password": "password1"
}
```

---

## Success response: `201 Created`

**Body**

| Field | Type | Description |
|-------|------|-------------|
| **user** | object | Created user with **`status: 'pending'`**. Password is never returned. |
| **message** | string | `"Registration successful. Your account is pending administrator approval. You will be able to sign in once activated."` |

**No tokens or cookies** are issued. The user cannot sign in until an administrator activates them (e.g. **PATCH /v1/users/:userId** with `{ "status": "active" }`).

**Example**

```json
{
  "user": {
    "id": "5ebac534954b54139806c112",
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "role": "user",
    "isEmailVerified": false,
    "roleIds": [],
    "status": "pending"
  },
  "message": "Registration successful. Your account is pending administrator approval. You will be able to sign in once activated."
}
```

---

## Error responses

| Status | When | Response |
|--------|------|----------|
| **400** | Invalid email, password rules, or missing required field | Joi validation error |
| **400** | Email already taken | `{ "code": 400, "message": "Email already taken" }` |

---

## Pending users: login and access

- **Login:** If a user with **status `pending`** tries **POST /v1/auth/login**, the API returns **401** with message: *"Your account is pending approval. An administrator must activate your account before you can sign in."*
- **Access:** Pending users receive no tokens from this API, so they cannot call protected endpoints. Once an administrator sets **status** to **`active`** (e.g. via **PATCH /v1/users/:userId**), the user can log in and use the system.

---

## Activating a user (administrator)

Use **PATCH /v1/users/:userId** with auth (`manageUsers`) and body:

```json
{
  "status": "active"
}
```

After that, the user can sign in and access the system.
