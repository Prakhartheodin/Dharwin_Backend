# Frontend Training Module API Documentation

## Overview

This document provides complete frontend integration guide for CRUD operations on **Training Modules**, including file uploads (cover images, videos, PDFs), playlist management, and quiz creation.

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Data Models](#data-models)
3. [Create Training Module](#create-training-module)
4. [Get Training Modules](#get-training-modules)
5. [Get Single Training Module](#get-single-training-module)
6. [Update Training Module](#update-training-module)
7. [Delete Training Module](#delete-training-module)
8. [File Uploads](#file-uploads)
9. [Complete React Examples](#complete-react-examples)
10. [Error Handling](#error-handling)
11. [Best Practices](#best-practices)

---

## API Endpoints

**Base URL**: `http://localhost:3000` (development) or your production URL

### Training Modules

- **Create**: `POST /v1/training/modules`
- **List**: `GET /v1/training/modules`
- **Get Single**: `GET /v1/training/modules/:moduleId`
- **Update**: `PATCH /v1/training/modules/:moduleId`
- **Delete**: `DELETE /v1/training/modules/:moduleId`

**Authentication**: All endpoints require Bearer token  
**Permissions**: 
- `training-modules.read` - for GET operations
- `training-modules.manage` - for POST, PATCH, DELETE operations

---

## Data Models

### Training Module Structure

```typescript
interface TrainingModule {
  id: string;
  categories: string[]; // Array of Category IDs
  moduleName: string;
  coverImage?: {
    key: string;
    url: string;
    originalName: string;
    size: number;
    mimeType: string;
    uploadedAt: string;
  };
  shortDescription: string;
  students: string[]; // Array of Student IDs
  mentorsAssigned: string[]; // Array of Mentor IDs
  playlist: PlaylistItem[];
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface PlaylistItem {
  contentType: 'upload-video' | 'youtube-link' | 'pdf-document' | 'blog' | 'quiz' | 'test';
  title: string;
  duration: number; // minutes
  order: number;
  // Content-specific fields (only one will be populated based on contentType)
  videoFile?: FileUpload;
  youtubeUrl?: string;
  pdfDocument?: FileUpload;
  blogContent?: string;
  quiz?: string; // Quiz ID
  testLinkOrReference?: string;
}

interface FileUpload {
  key: string;
  url: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}
```

---

## Create Training Module

### Endpoint Details

- **Method**: `POST`
- **URL**: `/v1/training/modules`
- **Content-Type**: `multipart/form-data` (for file uploads)
- **Authentication**: Required (Bearer token)
- **Permissions**: `training-modules.manage`

### Request Format

**Headers:**
```
Authorization: Bearer <access_token>
```

**Body (multipart/form-data):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categories` | JSON string | No | Array of category IDs: `["id1", "id2"]` |
| `moduleName` | string | Yes | Name of the training module |
| `coverImage` | File | Yes | Cover image file (image/*) |
| `shortDescription` | string | Yes | Brief description |
| `students` | JSON string | No | Array of student IDs: `["id1", "id2"]` |
| `mentorsAssigned` | JSON string | No | Array of mentor IDs: `["id1", "id2"]` |
| `playlist` | JSON string | No | Array of playlist items (see below) |
| `status` | string | No | `draft`, `published`, or `archived` (default: `draft`) |

**Playlist Item Fields** (within `playlist` JSON array):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contentType` | string | Yes | `upload-video`, `youtube-link`, `pdf-document`, `blog`, `quiz`, `test` |
| `title` | string | Yes | Lesson title |
| `duration` | number | No | Duration in minutes |
| `youtubeUrl` | string | Conditional | Required if `contentType` is `youtube-link` |
| `blogContent` | string | Conditional | Required if `contentType` is `blog` |
| `testLinkOrReference` | string | Conditional | Required if `contentType` is `test` |
| `quizId` | string | Conditional | Quiz ID if referencing existing quiz |
| `quizData` | object | Conditional | Quiz data if creating new quiz (see Quiz Structure) |
| `playlist[0].videoFile` | File | Conditional | Video file if `contentType` is `upload-video` |
| `playlist[0].pdfFile` | File | Conditional | PDF file if `contentType` is `pdf-document` |

**Quiz Structure** (for `quizData`):

```json
{
  "questions": [
    {
      "questionText": "What is JavaScript?",
      "allowMultipleAnswers": false,
      "options": [
        { "text": "A programming language", "isCorrect": true },
        { "text": "A coffee brand", "isCorrect": false },
        { "text": "A framework", "isCorrect": false }
      ]
    }
  ]
}
```

### Response Format

**Success (201 Created):**
```json
{
  "id": "66c9f2f0c5e2d9e3b9b12345",
  "categories": [
    { "id": "cat1", "name": "Technical Skills" }
  ],
  "moduleName": "Node.js & API Design",
  "coverImage": {
    "key": "training-module-cover-images/userId/timestamp-random.jpg",
    "url": "https://s3.amazonaws.com/bucket/...",
    "originalName": "cover.jpg",
    "size": 123456,
    "mimeType": "image/jpeg",
    "uploadedAt": "2026-02-11T10:00:00.000Z"
  },
  "shortDescription": "Learn Node.js and RESTful API design",
  "students": [
    { "id": "student1", "user": {...}, "phone": "..." }
  ],
  "mentorsAssigned": [
    { "id": "mentor1", "user": {...}, "phone": "..." }
  ],
  "playlist": [
    {
      "id": "playlist-item-1",
      "contentType": "upload-video",
      "title": "Introduction to Node.js",
      "duration": 15,
      "order": 0,
      "videoFile": {
        "key": "training-module-videos/userId/timestamp-random.mp4",
        "url": "https://s3.amazonaws.com/bucket/...",
        "originalName": "intro.mp4",
        "size": 5000000,
        "mimeType": "video/mp4",
        "uploadedAt": "2026-02-11T10:00:00.000Z"
      }
    },
    {
      "id": "playlist-item-2",
      "contentType": "quiz",
      "title": "Node.js Quiz",
      "duration": 10,
      "order": 1,
      "quiz": "quiz-id-123"
    }
  ],
  "status": "draft",
  "createdAt": "2026-02-11T10:00:00.000Z",
  "updatedAt": "2026-02-11T10:00:00.000Z"
}
```

### JavaScript/React Example

```javascript
/**
 * Create a training module
 * @param {string} baseUrl - API base URL
 * @param {string} token - Access token
 * @param {Object} moduleData - Module data
 * @returns {Promise<Object>} Created module
 */
async function createTrainingModule({ baseUrl, token, moduleData }) {
  const formData = new FormData();

  // Course Info fields
  formData.append('moduleName', moduleData.moduleName);
  formData.append('shortDescription', moduleData.shortDescription);
  formData.append('categories', JSON.stringify(moduleData.categories || []));
  formData.append('students', JSON.stringify(moduleData.students || []));
  formData.append('mentorsAssigned', JSON.stringify(moduleData.mentorsAssigned || []));
  formData.append('status', moduleData.status || 'draft');

  // Cover image
  if (moduleData.coverImage) {
    formData.append('coverImage', moduleData.coverImage);
  }

  // Playlist items
  const playlist = moduleData.playlist || [];
  formData.append('playlist', JSON.stringify(playlist.map((item, index) => {
    const playlistItem = {
      contentType: item.contentType,
      title: item.title,
      duration: item.duration || 0,
    };

    // Add content-specific fields
    switch (item.contentType) {
      case 'youtube-link':
        playlistItem.youtubeUrl = item.youtubeUrl;
        break;
      case 'blog':
        playlistItem.blogContent = item.blogContent;
        break;
      case 'test':
        playlistItem.testLinkOrReference = item.testLinkOrReference;
        break;
      case 'quiz':
        if (item.quizId) {
          playlistItem.quizId = item.quizId;
        } else if (item.quizData) {
          playlistItem.quizData = item.quizData;
        }
        break;
    }

    return playlistItem;
  })));

  // Add file uploads for playlist items
  playlist.forEach((item, index) => {
    if (item.contentType === 'upload-video' && item.videoFile) {
      formData.append(`playlist[${index}].videoFile`, item.videoFile);
    }
    if (item.contentType === 'pdf-document' && item.pdfFile) {
      formData.append(`playlist[${index}].pdfFile`, item.pdfFile);
    }
  });

  const response = await fetch(`${baseUrl}/v1/training/modules`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // DO NOT set Content-Type - browser will set it with boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create training module');
  }

  return await response.json();
}

// Usage example
const moduleData = {
  moduleName: 'Node.js & API Design',
  shortDescription: 'Learn Node.js and RESTful API design',
  categories: ['category-id-1', 'category-id-2'],
  students: ['student-id-1'],
  mentorsAssigned: ['mentor-id-1'],
  status: 'draft',
  coverImage: coverImageFile, // File object
  playlist: [
    {
      contentType: 'upload-video',
      title: 'Introduction to Node.js',
      duration: 15,
      videoFile: videoFile, // File object
    },
    {
      contentType: 'youtube-link',
      title: 'Advanced Node.js',
      duration: 20,
      youtubeUrl: 'https://www.youtube.com/watch?v=...',
    },
    {
      contentType: 'pdf-document',
      title: 'Node.js Cheat Sheet',
      duration: 5,
      pdfFile: pdfFile, // File object
    },
    {
      contentType: 'quiz',
      title: 'Node.js Quiz',
      duration: 10,
      quizData: {
        questions: [
          {
            questionText: 'What is Node.js?',
            allowMultipleAnswers: false,
            options: [
              { text: 'A JavaScript runtime', isCorrect: true },
              { text: 'A database', isCorrect: false },
            ],
          },
        ],
      },
    },
  ],
};

const createdModule = await createTrainingModule({
  baseUrl: 'http://localhost:3000',
  token: userToken,
  moduleData,
});
```

---

## Get Training Modules

### Endpoint Details

- **Method**: `GET`
- **URL**: `/v1/training/modules`
- **Authentication**: Required (Bearer token)
- **Permissions**: `training-modules.read`

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search in module name and description |
| `category` | string | Filter by category ID |
| `status` | string | Filter by status (`draft`, `published`, `archived`) |
| `sortBy` | string | Sort field and order (e.g., `moduleName:asc`, `createdAt:desc`) |
| `limit` | number | Results per page (default: 10) |
| `page` | number | Page number (default: 1) |

### Response Format

**Success (200 OK):**
```json
{
  "results": [
    {
      "id": "module-id-1",
      "moduleName": "Node.js & API Design",
      "coverImage": {
        "url": "https://s3.amazonaws.com/bucket/..."
      },
      "shortDescription": "...",
      "categories": [{ "id": "...", "name": "Technical Skills" }],
      "students": [...],
      "mentorsAssigned": [...],
      "playlist": [...],
      "status": "published",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 5,
  "totalResults": 50
}
```

### JavaScript/React Example

```javascript
async function getTrainingModules({ baseUrl, token, filters = {} }) {
  const params = new URLSearchParams();
  
  if (filters.search) params.append('search', filters.search);
  if (filters.category) params.append('category', filters.category);
  if (filters.status) params.append('status', filters.status);
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.limit) params.append('limit', filters.limit);
  if (filters.page) params.append('page', filters.page);

  const response = await fetch(`${baseUrl}/v1/training/modules?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch training modules');
  }

  return await response.json();
}
```

---

## Get Single Training Module

### Endpoint Details

- **Method**: `GET`
- **URL**: `/v1/training/modules/:moduleId`
- **Authentication**: Required (Bearer token)
- **Permissions**: `training-modules.read`

### Response Format

Same as Create response - returns full module object with all populated fields.

---

## Update Training Module

### Endpoint Details

- **Method**: `PATCH`
- **URL**: `/v1/training/modules/:moduleId`
- **Content-Type**: `multipart/form-data` (if files are being uploaded)
- **Authentication**: Required (Bearer token)
- **Permissions**: `training-modules.manage`

### Request Format

Same as Create, but all fields are optional. Only include fields you want to update.

**Note**: When updating playlist items:
- If you want to keep an existing file, don't include the file field
- If you want to replace a file, include the new file
- To remove a playlist item, send the updated playlist array without that item

### JavaScript/React Example

```javascript
async function updateTrainingModule({ baseUrl, token, moduleId, updates }) {
  const formData = new FormData();

  // Only append fields that are being updated
  if (updates.moduleName) formData.append('moduleName', updates.moduleName);
  if (updates.shortDescription) formData.append('shortDescription', updates.shortDescription);
  if (updates.categories) formData.append('categories', JSON.stringify(updates.categories));
  if (updates.students) formData.append('students', JSON.stringify(updates.students));
  if (updates.mentorsAssigned) formData.append('mentorsAssigned', JSON.stringify(updates.mentorsAssigned));
  if (updates.status) formData.append('status', updates.status);

  // Cover image (only if updating)
  if (updates.coverImage) {
    formData.append('coverImage', updates.coverImage);
  }

  // Playlist (only if updating)
  if (updates.playlist) {
    formData.append('playlist', JSON.stringify(updates.playlist));
    // Handle file uploads same as create
  }

  const response = await fetch(`${baseUrl}/v1/training/modules/${moduleId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update training module');
  }

  return await response.json();
}
```

---

## Delete Training Module

### Endpoint Details

- **Method**: `DELETE`
- **URL**: `/v1/training/modules/:moduleId`
- **Authentication**: Required (Bearer token)
- **Permissions**: `training-modules.manage`

### Response Format

**Success (204 No Content)** - Empty response body

### JavaScript/React Example

```javascript
async function deleteTrainingModule({ baseUrl, token, moduleId }) {
  const response = await fetch(`${baseUrl}/v1/training/modules/${moduleId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete training module');
  }

  return true;
}
```

---

## File Uploads

### Supported File Types

- **Cover Image**: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- **Video**: `video/mp4`, `video/webm`, `video/quicktime`
- **PDF**: `application/pdf`

### File Size Limits

- Maximum file size: **500MB** per file
- Recommended cover image size: < 5MB
- Recommended video size: < 500MB

### Upload Handling

Files are uploaded to AWS S3 and presigned URLs are generated for access. URLs expire after 7 days, but fresh URLs are generated on each GET request.

---

## Complete React Examples

### Training Module Form Component

```jsx
import React, { useState } from 'react';

function TrainingModuleForm({ baseUrl, token, moduleId, onSuccess }) {
  const [formData, setFormData] = useState({
    moduleName: '',
    shortDescription: '',
    categories: [],
    students: [],
    mentorsAssigned: [],
    status: 'draft',
    coverImage: null,
    playlist: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const moduleData = {
        ...formData,
        coverImage: formData.coverImage,
        playlist: formData.playlist.map((item, index) => ({
          ...item,
          videoFile: item.contentType === 'upload-video' ? item.videoFile : undefined,
          pdfFile: item.contentType === 'pdf-document' ? item.pdfFile : undefined,
        })),
      };

      let result;
      if (moduleId) {
        result = await updateTrainingModule({ baseUrl, token, moduleId, updates: moduleData });
      } else {
        result = await createTrainingModule({ baseUrl, token, moduleData });
      }

      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addPlaylistItem = () => {
    setFormData({
      ...formData,
      playlist: [
        ...formData.playlist,
        {
          contentType: 'upload-video',
          title: '',
          duration: 0,
          videoFile: null,
        },
      ],
    });
  };

  const removePlaylistItem = (index) => {
    setFormData({
      ...formData,
      playlist: formData.playlist.filter((_, i) => i !== index),
    });
  };

  const updatePlaylistItem = (index, updates) => {
    const newPlaylist = [...formData.playlist];
    newPlaylist[index] = { ...newPlaylist[index], ...updates };
    setFormData({ ...formData, playlist: newPlaylist });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Course Info Fields */}
      <div>
        <label>Module Name*</label>
        <input
          type="text"
          value={formData.moduleName}
          onChange={(e) => setFormData({ ...formData, moduleName: e.target.value })}
          required
        />
      </div>

      <div>
        <label>Cover Image*</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFormData({ ...formData, coverImage: e.target.files[0] })}
          required={!moduleId}
        />
      </div>

      <div>
        <label>Short Description*</label>
        <textarea
          value={formData.shortDescription}
          onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
          required
        />
      </div>

      {/* Categories, Students, Mentors - Multi-select components */}
      {/* ... */}

      {/* Playlist Items */}
      <div>
        <h3>Course Playlist</h3>
        <button type="button" onClick={addPlaylistItem}>
          + Add Item
        </button>

        {formData.playlist.map((item, index) => (
          <div key={index}>
            <select
              value={item.contentType}
              onChange={(e) => updatePlaylistItem(index, { contentType: e.target.value })}
            >
              <option value="upload-video">Upload Video</option>
              <option value="youtube-link">YouTube Link</option>
              <option value="pdf-document">PDF Document</option>
              <option value="blog">Blog</option>
              <option value="quiz">Quiz</option>
              <option value="test">Test</option>
            </select>

            <input
              type="text"
              placeholder="Lesson title"
              value={item.title}
              onChange={(e) => updatePlaylistItem(index, { title: e.target.value })}
            />

            {item.contentType === 'upload-video' && (
              <input
                type="file"
                accept="video/*"
                onChange={(e) => updatePlaylistItem(index, { videoFile: e.target.files[0] })}
              />
            )}

            {item.contentType === 'pdf-document' && (
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => updatePlaylistItem(index, { pdfFile: e.target.files[0] })}
              />
            )}

            {/* Other content type fields... */}

            <button type="button" onClick={() => removePlaylistItem(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      {error && <div style={{ color: 'red' }}>{error}</div>}

      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : moduleId ? 'Update Module' : 'Create Module'}
      </button>
    </form>
  );
}

export default TrainingModuleForm;
```

---

## Error Handling

### Common Error Codes

| Status Code | Meaning | Solution |
|------------|---------|----------|
| 400 | Bad Request | Check request body format and required fields |
| 401 | Unauthorized | Check if token is valid and included |
| 403 | Forbidden | User doesn't have required permissions |
| 404 | Not Found | Module ID doesn't exist |
| 413 | Payload Too Large | File size exceeds 500MB limit |
| 500 | Internal Server Error | Server issue - contact backend team |

---

## Best Practices

### 1. **Form Validation**

Validate on client-side before submission:

```javascript
function validateModuleData(data) {
  const errors = [];

  if (!data.moduleName || data.moduleName.trim().length === 0) {
    errors.push('Module name is required');
  }

  if (!data.shortDescription || data.shortDescription.trim().length === 0) {
    errors.push('Short description is required');
  }

  if (!data.coverImage && !data.moduleId) {
    errors.push('Cover image is required');
  }

  // Validate playlist items
  data.playlist?.forEach((item, index) => {
    if (!item.title) {
      errors.push(`Playlist item ${index + 1}: Title is required`);
    }
    if (item.contentType === 'upload-video' && !item.videoFile) {
      errors.push(`Playlist item ${index + 1}: Video file is required`);
    }
    // ... other validations
  });

  return errors;
}
```

### 2. **File Size Validation**

```javascript
function validateFileSize(file, maxSizeMB = 500) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error(`File size must be less than ${maxSizeMB}MB`);
  }
}
```

### 3. **Progressive Upload**

For large files, consider showing upload progress:

```javascript
async function uploadWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        onProgress(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200 || xhr.status === 201) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    // Set up form data and send
    const formData = new FormData();
    formData.append('file', file);
    
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}
```

### 4. **Draft Saving**

Save drafts periodically to prevent data loss:

```javascript
// Auto-save draft every 30 seconds
useEffect(() => {
  const interval = setInterval(() => {
    if (hasUnsavedChanges) {
      saveDraft();
    }
  }, 30000);

  return () => clearInterval(interval);
}, [hasUnsavedChanges]);
```

---

## Summary

### Quick Reference

**Create Module:**
```javascript
POST /v1/training/modules
Content-Type: multipart/form-data
Body: FormData with module fields and files
```

**Get Modules:**
```javascript
GET /v1/training/modules?search=node&status=published&page=1&limit=10
```

**Update Module:**
```javascript
PATCH /v1/training/modules/:moduleId
Content-Type: multipart/form-data
Body: FormData with fields to update
```

**Delete Module:**
```javascript
DELETE /v1/training/modules/:moduleId
```

**Key Points:**
- ✅ Use `multipart/form-data` for requests with file uploads
- ✅ Send arrays (categories, students, playlist) as JSON strings
- ✅ File fields use specific naming: `coverImage`, `playlist[0].videoFile`, `playlist[0].pdfFile`
- ✅ Presigned URLs expire after 7 days but are regenerated on GET requests
- ✅ Validate files on client-side before upload
- ✅ Handle large file uploads with progress indicators

---

## Support

For issues or questions, contact the backend team or refer to the API documentation.
