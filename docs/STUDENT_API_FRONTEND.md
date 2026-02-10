# Student API – Frontend Guide

This document describes how the frontend should integrate with the **Student API**, including **profile picture** upload and display. All endpoints require authentication (JWT via cookie or `Authorization: Bearer`).

---

## Base path

```
/v1/training/students
```

---

## Auth & permissions

| Permission       | Use |
|------------------|-----|
| `students.read`  | GET list, GET single student, GET profile picture |
| `students.manage`| PATCH student, DELETE student, POST profile picture |

Send the JWT in the `Authorization` header as `Bearer <token>` or via the cookie your app uses for auth.

---

## Student response shape

Relevant fields the frontend will receive (e.g. from GET or PATCH):

| Field              | Type   | Description |
|--------------------|--------|-------------|
| `id`               | string | Student ID (Mongo ObjectId) |
| `user`             | object | Populated user: `id`, `name`, `email`, `role`, `status`, etc. |
| `phone`            | string | Phone number |
| `dateOfBirth`      | string (ISO date) | Date of birth |
| `gender`           | string | `'male'` \| `'female'` \| `'other'` |
| `address`          | object | `street`, `city`, `state`, `zipCode`, `country` |
| `education`        | array  | Education entries |
| `experience`        | array  | Work experience entries |
| `skills`           | array  | Array of strings |
| `documents`        | array  | `{ name, type, fileUrl, fileKey, uploadedAt }` |
| **`profileImageUrl`** | string \| null | **API path to load profile picture** (e.g. `/training/students/xxx/profile-picture`). Prepend your base URL; path does not include `/v1`. |
| **`profileImageKey`**  | string \| null | S3 key (backend-only; frontend does not need to send this) |
| `bio`              | string | Bio text |
| `status`           | string | `'active'` \| `'inactive'` |
| `createdAt`        | string (ISO date) | |
| `updatedAt`        | string (ISO date) | |

---

## Endpoints

### 1. List students

- **Method:** `GET`
- **URL:** `/v1/training/students`
- **Auth:** Required (`students.read`)
- **Query (optional):** `status`, `search`, `sortBy`, `limit`, `page`

**Success:** `200 OK` – Paginated result: `{ results: Student[], page, limit, totalPages, totalResults }`

---

### 2. Get student by ID

- **Method:** `GET`
- **URL:** `/v1/training/students/:studentId`
- **Auth:** Required (`students.read`)

**Success:** `200 OK` – Single student object (includes `profileImageUrl` if set).

**Errors:** `404` – Student not found.

---

### 3. Update student

- **Method:** `PATCH`
- **URL:** `/v1/training/students/:studentId`
- **Auth:** Required (`students.manage`)
- **Headers:** `Content-Type: application/json`
- **Body:** Any subset of student fields (all optional). Do **not** use this to set the profile picture; use the profile-picture endpoint instead.

**Success:** `200 OK` – Updated student object.

**Errors:** `400` validation, `404` not found, `403` no permission.

---

### 4. Delete student

- **Method:** `DELETE`
- **URL:** `/v1/training/students/:studentId`
- **Auth:** Required (`students.manage`)

**Success:** `204 No Content`

**Errors:** `404` not found, `403` no permission.

---

## Profile picture

The profile picture is stored in S3. The backend exposes it via an **API URL**. The frontend should use `profileImageUrl` from the student object to load the image (same origin + path, with auth).

### 4.1 Display profile picture

**Use the `profileImageUrl` from the student object.**

- When you GET or PATCH a student, the response includes `profileImageUrl` (e.g. `/training/students/6989de106f7f2a047ddaccf9/profile-picture`) when a picture has been uploaded. The path does not include `/v1`; prepend your base URL.
- If no picture has been uploaded, `profileImageUrl` may be `null` or omitted.

**How to load the image:**

- **Option A – Same-origin request with auth:**  
  Build the full URL from your API base (e.g. `https://api.yourapp.com`) + `profileImageUrl`.  
  The backend redirects to a short-lived S3 URL. For `<img src="...">`, the browser will send cookies automatically. If you use Bearer tokens only, you cannot use `<img src>` directly; use one of the options below.

- **Option B – Fetch with Bearer token, then blob URL:**  
  1. `fetch(fullUrl, { headers: { Authorization: 'Bearer ' + token } })`  
  2. Follow redirects (fetch follows redirects by default).  
  3. Get the final image URL from the response (or use `response.blob()` and create an object URL for `<img src={objectUrl}>`).

- **Option C – Use the API URL as `src` with cookie-based auth:**  
  If your app sends the JWT in a cookie for same-origin requests, set:  
  `img.src = apiBase + student.profileImageUrl`  
  and ensure the request is same-origin so the cookie is sent. The server will redirect to S3 and the image will load.

**GET profile picture (direct)**

- **Method:** `GET`
- **URL:** `/v1/training/students/:studentId/profile-picture`
- **Auth:** Required (`students.read`)
- **Response:** **302 redirect** to a short-lived presigned S3 URL (expires in a few minutes). The browser or `fetch` will follow the redirect and load the image.

**Errors:**

| Status | When |
|--------|------|
| 404 | Student has no profile picture |
| 503 | S3 is not configured on the backend |

---

### 4.2 Upload profile picture

- **Method:** `POST`
- **URL:** `/v1/training/students/:studentId/profile-picture`
- **Auth:** Required (`students.manage`)
- **Headers:** `Content-Type: multipart/form-data`
- **Body (form data):** One file with **field name `file`**.  
  Recommended: accept image types (e.g. JPEG, PNG). The backend does not restrict type; you can validate on the frontend.

**Example (JavaScript / FormData):**

```js
const formData = new FormData();
formData.append('file', imageFile); // field name must be "file"

const response = await fetch(
  `${API_BASE}/v1/training/students/${studentId}/profile-picture`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Do NOT set Content-Type; browser sets it with boundary for multipart
    },
    body: formData,
  }
);
```

**Success:** `200 OK`

**Response body example:**

```json
{
  "success": true,
  "message": "Profile picture uploaded successfully",
  "data": {
    "id": "6989de106f7f2a047ddaccf9",
    "user": { ... },
    "profileImageUrl": "/training/students/6989de106f7f2a047ddaccf9/profile-picture",
    "profileImageKey": "profile-pictures/6989de106f7f2a047ddaccf9/1739...-photo.jpg",
    ...
  }
}
```

Use `data.profileImageUrl` to display the new picture (e.g. update state and set `img.src = apiBase + data.profileImageUrl`).

**Errors:**

| Status | When |
|--------|------|
| 400 | No file provided (missing or empty `file` field) |
| 404 | Student not found |
| 403 | No `students.manage` permission |
| 503 | S3 is not configured on the backend |

---

## Edit Student page – suggested flow

1. **Load student:** `GET /v1/training/students/:studentId`
2. **Display profile picture:**  
   If `student.profileImageUrl` is set, show image using one of the display options above (e.g. `img.src = apiBase + student.profileImageUrl` with cookie auth, or fetch + blob URL with Bearer auth).  
   If not set, show a placeholder.
3. **Upload new picture (e.g. “Change photo” or “Upload photo”):**  
   On file select, `POST /v1/training/students/:studentId/profile-picture` with `FormData` and field name `file`.  
   On success, update UI with the returned `data.profileImageUrl` (and optionally replace the image source with a new fetch + blob or same URL with cache-bust if needed).
4. **Other fields:** Continue using `PATCH /v1/training/students/:studentId` for name, phone, education, documents, etc. Do not send `profileImageKey` / `profileImageUrl` in PATCH unless you are intentionally clearing or setting them from another flow.

---

## Quick reference – profile picture

| Action   | Method | URL |
|----------|--------|-----|
| Display  | GET    | `/v1/training/students/:studentId/profile-picture` (redirects to image) |
| Upload   | POST   | `/v1/training/students/:studentId/profile-picture` (body: `multipart/form-data`, field `file`) |

- **Display:** Use `student.profileImageUrl` from GET/PATCH student or from the upload response. Load via same-origin + cookie or fetch with Bearer + blob URL.
- **Upload:** POST with `file` in form data; on 200, use `data.profileImageUrl` to show the new picture.
