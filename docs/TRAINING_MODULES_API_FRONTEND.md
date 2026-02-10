# Training Modules API – Frontend Guide

This document describes how the frontend should integrate with the **Create Training Module** API. **Course info and playlist are one form**—submitted in a **single** create-module request.

---

## Base path

```
/v1/training/curriculum/modules
```

---

## Auth & permissions

| Permission       | Use |
|------------------|-----|
| `modules.read`   | GET list, GET single module, GET cover image, GET playlist item source |
| `modules.manage` | POST create module, PATCH update module, DELETE module |

Send the JWT in the `Authorization` header as `Bearer <token>` or via cookie.

---

## Create module (single request)

**Design principle:** Course info and playlist are submitted together in **one** request. The UI may have two tabs (“Course Info” and “Playlist”) for layout only.

### Option A – Multipart (recommended when cover image is a file)

- **Method:** `POST`
- **URL:** `/v1/training/curriculum/modules`
- **Auth:** Required (`modules.manage`)
- **Content-Type:** `multipart/form-data` (do **not** set `Content-Type: application/json`; let the browser set the boundary)

**Form fields:**

| Field                | Type   | Required | Description |
|----------------------|--------|----------|-------------|
| `categoryId`         | string | Yes      | Category ID (from categories list). |
| `name`               | string | Yes      | Module name. |
| `shortDescription`   | string | Yes      | Short summary of the module. |
| `studentIds`         | string | No       | JSON stringified array of student IDs, e.g. `["id1","id2"]`. |
| `mentorIds`          | string | No       | JSON stringified array of mentor IDs, e.g. `["id1","id2"]`. |
| `playlist`           | string | No       | JSON stringified array of playlist items (see [Playlist structure](#playlist-structure)). Default `[]`. |
| `coverImage`         | file   | Yes*     | Cover image file. *Required for Option A; omit if using Option B.* |
| `playlistItemFiles`  | file[] | No       | **Video and PDF files** for playlist items. Send in the **same order** as video/pdf items in `playlist` (first file → first video/pdf item, second file → second video/pdf item). Use field name `playlistItemFiles` for each file (append multiple times). |

**Example (FormData) – cover image + video/PDF playlist items:**

```js
const formData = new FormData();
formData.append('categoryId', categoryId);
formData.append('name', name);
formData.append('shortDescription', shortDescription);
formData.append('studentIds', JSON.stringify(studentIds));
formData.append('mentorIds', JSON.stringify(mentorIds));
formData.append('playlist', JSON.stringify(playlist));
formData.append('coverImage', coverImageFile);

// Append video/PDF files in the same order as video/pdf items in playlist
playlistItemFiles.forEach((file) => {
  formData.append('playlistItemFiles', file);
});

const response = await fetch(`${API_BASE}/v1/training/curriculum/modules`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
```

**Important:** The number of `playlistItemFiles` must equal the number of playlist items with `type: "video"` or `type: "pdf"`. Order must match (first file → first video/pdf item in the playlist).

---

### Option B – JSON (cover uploaded separately)

1. Upload the cover image first (e.g. via `POST /v1/upload/single` or your upload endpoint) and get back a `key` or URL.
2. **POST** create module with `Content-Type: application/json` and a body that includes:
   - All course info fields.
   - `coverImageKey` and/or `coverImageUrl` from the upload response (if your backend stores them).
   - Full `playlist` array.

- **Method:** `POST`
- **URL:** `/v1/training/curriculum/modules`
- **Auth:** Required (`modules.manage`)
- **Headers:** `Content-Type: application/json`
- **Body:** JSON (see [Course info](#course-info) and [Playlist structure](#playlist-structure)).

---

## Course info (part of the single form)

| Field              | Type     | Required | Description |
|--------------------|----------|----------|-------------|
| `categoryId`       | string   | Yes      | Category ID. |
| `name`             | string   | Yes      | Module name. |
| `coverImage`       | file     | Yes (Option A) | Cover image file. |
| `coverImageKey`    | string   | No       | S3 key from prior upload (Option B). |
| `coverImageUrl`    | string   | No       | API path or URL from prior upload (Option B). |
| `shortDescription` | string   | Yes      | Short summary. |
| `studentIds`       | string[] | No       | Array of student IDs. |
| `mentorIds`        | string[] | No       | Array of mentor IDs. |

---

## Playlist structure

The playlist is an **array of items**. Order of the array is the **course flow order**.

### Playlist item – common fields

| Field     | Type           | Required | Description |
|-----------|----------------|----------|-------------|
| `order`   | number         | No       | 1-based index (or use array index). |
| `type`    | string         | Yes      | One of: `video`, `youtube`, `quiz`, `pdf`, `blog`, `test`. |
| `title`   | string         | Yes      | Item title (e.g. lesson title). |
| `duration`| string or number | No    | Duration in minutes (e.g. `"10"` or `10`). |

### Playlist item – type-specific fields

- **`video`** (uploaded video): `sourceKey` and/or `sourceUrl` (from prior upload or returned by backend).
- **`youtube`**: `sourceUrl` (YouTube URL or video ID).
- **`pdf`**: `sourceKey` and/or `sourceUrl` (from prior upload or returned by backend).
- **`blog`**: `blogContent` (HTML or Markdown string).
- **`quiz`**: `quizData` (array of questions; see [Quiz structure](#quiz-structure)).
- **`test`**: `sourceUrl` (test URL or reference).

### Quiz structure (for `type: "quiz"`)

Each question:

| Field           | Type    | Required | Description |
|-----------------|---------|----------|-------------|
| `question`      | string  | Yes      | Question text. |
| `multipleCorrect` | boolean | No    | Whether multiple options can be correct. |
| `options`       | array   | Yes      | List of options. |

Each option:

| Field   | Type    | Required | Description |
|---------|---------|----------|-------------|
| `text`  | string  | Yes      | Option text. |
| `correct` | boolean | Yes    | Whether this option is correct. |

**Validation:** At least one option must be marked correct per question. If `multipleCorrect` is `false`, at most one option may be correct.

---

## Success response (create)

- **Status:** `201 Created`
- **Body:** Created module object, including:
  - `id` (module ID)
  - `categoryId`, `name`, `shortDescription`, `studentIds`, `mentorIds`
  - `coverImageUrl`: API path to load cover image (e.g. `/training/curriculum/modules/:id/cover`). Prepend your base URL.
  - `playlist`: array of playlist items (with `id`, `order`, `type`, `title`, `duration`, `sourceUrl`, `blogContent`, `quizData`, etc.)

**Example (minimal):**

```json
{
  "id": "module_id_xxx",
  "categoryId": "cat_id",
  "name": "Introduction to Next.js",
  "coverImageUrl": "/training/curriculum/modules/module_id_xxx/cover",
  "shortDescription": "...",
  "studentIds": ["s1"],
  "mentorIds": ["m1"],
  "playlist": [
    {
      "id": "item_id_1",
      "order": 1,
      "type": "video",
      "title": "Lesson 1",
      "duration": "10",
      "sourceUrl": "..."
    },
    {
      "id": "item_id_2",
      "order": 2,
      "type": "quiz",
      "title": "Quiz 1",
      "quizData": [...]
    }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## List modules

- **Method:** `GET`
- **URL:** `/v1/training/curriculum/modules`
- **Auth:** Required (`modules.read`)
- **Query (optional):** `categoryId`, `status`, `search`, `sortBy`, `limit`, `page`

**Success:** `200 OK` – Paginated result: `{ results: Module[], page, limit, totalPages, totalResults }`.

---

## Update module

You can update modules using **JSON** or **multipart**. Multipart behaves like create: you can replace the cover image and playlist videos/PDFs in the same request.

- **Method:** `PATCH`
- **URL:** `/v1/training/curriculum/modules/:moduleId`
- **Auth:** Required (`modules.manage`)

### Option A – JSON

- **Content-Type:** `application/json`
- **Body:** Any subset of the following (at least one field required):

```json
{
  "categoryId": "698982b214353658c22a3af8",
  "name": "Updated name",
  "shortDescription": "Updated description",
  "studentIds": ["studentId1", "studentId2"],
  "mentorIds": ["mentorId1"],
  "status": "active",
  "coverImageKey": "new-s3-key-optional",
  "coverImageUrl": "/training/curriculum/modules/:id/cover",
  "playlist": [
    {
      "order": 1,
      "type": "video",
      "title": "Lesson 1",
      "duration": "10",
      "sourceKey": "...",
      "sourceUrl": "...",
      "blogContent": "...",
      "quizData": [...]
    }
  ]
}
```

### Option B – Multipart (replace cover and/or playlist files)

- **Content-Type:** `multipart/form-data`
- **Fields:** Same as create:

| Field               | Type   | Required | Description |
|---------------------|--------|----------|-------------|
| `categoryId`        | string | No       | New category ID. |
| `name`              | string | No       | New module name. |
| `shortDescription`  | string | No       | New summary. |
| `studentIds`        | string | No       | JSON stringified array of student IDs. |
| `mentorIds`         | string | No       | JSON stringified array of mentor IDs. |
| `playlist`          | string | No       | JSON stringified playlist array (replaces existing playlist if provided). |
| `coverImage`        | file   | No       | New cover image file (replaces existing cover). |
| `playlistItemFiles` | file[] | No       | New video/PDF files for playlist items. Same rule as create: files must be in the same order as video/pdf items in the (final) playlist. |

If `playlist` is included in the update, it becomes the new playlist before assigning `playlistItemFiles`.

Notes:

- If `categoryId` is provided, it must reference an existing category.
- If `playlist` is provided, it **replaces** the existing playlist and must follow the same structure and quiz rules as in create.
- If you send `playlistItemFiles`, their count must equal the number of items with `type: "video"` or `type: "pdf"` in the playlist after the update; the k‑th file is applied to the k‑th such item.

**Success:** `200 OK` – Updated module object.

**Errors:** `400` validation, mismatched `playlistItemFiles` count, or invalid quiz data. `404` module or category not found.

---

## Delete module

- **Method:** `DELETE`
- **URL:** `/v1/training/curriculum/modules/:moduleId`
- **Auth:** Required (`modules.manage`)

**Success:** `204 No Content`

**Errors:** `404` – Module not found.

> Note: Deleting a module currently does **not** delete associated S3 files (cover image, videos, PDFs). Those can be cleaned up separately if needed.

---

## Get module by ID

- **Method:** `GET`
- **URL:** `/v1/training/curriculum/modules/:moduleId`
- **Auth:** Required (`modules.read`)

**Success:** `200 OK` – Single module object.

**Errors:** `404` – Module not found.

---

## Get cover image

- **Method:** `GET`
- **URL:** `/v1/training/curriculum/modules/:moduleId/cover`
- **Auth:** Required (`modules.read`)
- **Response:** **302 redirect** to a short-lived presigned S3 URL for the cover image.

Use `module.coverImageUrl` from the create/get response to build the full URL: **baseUrl + coverImageUrl** (e.g. `https://api.example.com/v1` + `/training/curriculum/modules/:id/cover`).

**Errors:** `404` – Module has no cover image. `503` – S3 not configured.

---

## Get playlist item source (video/PDF)

- **Method:** `GET`
- **URL:** `/v1/training/curriculum/modules/:moduleId/items/:itemId/source`
- **Auth:** Required (`modules.read`)
- **Response:** **302 redirect** to a short-lived presigned S3 URL for the video or PDF file.

Use `item.sourceUrl` from the module’s playlist (e.g. `/training/curriculum/modules/:moduleId/items/:itemId/source`) and **baseUrl** to build the full URL. Use this URL in `<video src="...">`, `<a href="...">` for download, or an iframe/embed for PDFs.

**Errors:** `404` – Playlist item has no source file. `503` – S3 not configured.

---

## Error responses (create)

| Status | When |
|--------|------|
| `400`  | Validation failure (missing required field, invalid type, bad quiz data). |
| `401`  | Not authenticated. |
| `403`  | Not allowed to create modules. |
| `404`  | Referenced category not found. |
| `503`  | S3 not configured (when sending cover file). |

---

## Summary

- **One form:** Course info + playlist in **one** create-module request.
- **One endpoint:** `POST /v1/training/curriculum/modules`.
- **Image & video upload (Option A – multipart):**
  - **Cover image:** Form field `coverImage` (one file). Stored in S3; load via GET `/v1/training/curriculum/modules/:moduleId/cover` (redirects to S3).
  - **Playlist video/PDF:** Form field `playlistItemFiles` (multiple files). Send files in the **same order** as video/pdf items in the playlist. Stored in S3; load via GET `/v1/training/curriculum/modules/:moduleId/items/:itemId/source` (redirects to S3).
- **Payload:** Either `multipart/form-data` (cover + optional playlistItemFiles + form fields) or `application/json` (with optional `coverImageKey`/`coverImageUrl` and item `sourceKey`/`sourceUrl` from prior uploads).
- **Cover URL:** Returned as `coverImageUrl` (path without `/v1`); prepend base URL.
- **Playlist item source URL:** Returned as `sourceUrl` on each video/pdf item (path without `/v1`); prepend base URL to load or play the file.
- **Playlist:** Ordered array of items with `type`, `title`, `order`, `duration`, and type-specific fields (`sourceUrl`, `blogContent`, `quizData`, etc.).
