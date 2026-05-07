# Planify AI — Backend API Documentation

**Base URL:** `http://localhost:5000/api`  
**Auth:** Protected routes require `Authorization: Bearer <token>` header.  
**Success format:** `{ success: true, data }` or `{ success: true, count, total, page, pages, data }`  
**Error format:** `{ success: false, message: "..." }`

---

## 1. Auth — `/api/auth`
Rate limited: **20 req / 15 min / IP**

### POST `/api/auth/register`
Register a new user. Auto-creates Profile, UserPreference, and trial Subscription.

**Body:**
```json
{ "name": "Ahmed", "email": "ahmed@example.com", "password": "Test1234!" }
```
**Response `201`:**
```json
{ "success": true, "token": "<jwt>", "data": { "_id": "...", "name": "Ahmed", "plan": "free", "tokenBalance": 10000 } }
```
**Errors:** `400` User exists · `422` Validation failed

---

### POST `/api/auth/login`
**Body:** `{ "email": "...", "password": "..." }`  
**Response:** Same shape as register. Logs a SecurityLog entry.  
**Errors:** `401` Invalid credentials

---

### GET `/api/auth/me` 🔒
Returns current authenticated user without password.

### POST `/api/auth/logout` 🔒
Creates a SecurityLog entry. Returns `{ success: true, message: "Logout successful" }`

---

## 2. Users — `/api/users` 🔒

### GET `/api/users/me`
Returns current user document.

### PUT `/api/users/me`
**Body:** `{ "name": "New Name", "avatar": "https://..." }`

---

## 3. Profile — `/api/profile` 🔒

### GET `/api/profile/me`
Returns extended profile (always exists after register).

### PUT `/api/profile/me`
Upserts profile. All fields optional.

**Body:**
```json
{
  "fullName": "Ahmed Ben Ali",
  "university": "ENIT",
  "program": "Computer Science",
  "academicYear": "3rd Year",
  "bio": "Passionate about AI",
  "socialLinks": { "github": "https://github.com/ahmed" }
}
```

---

## 4. Courses — `/api/courses` 🔒

### GET `/api/courses`
| Param | Values |
|---|---|
| `search` | Searches `title` and `description` |
| `status` | `active` · `archived` · `completed` |
| `priority` | `low` · `medium` · `high` |
| `sort` | `newest` · `oldest` · `title` · `progress` |
| `page` / `limit` | Pagination (default 1/10) |

**Response:** `{ success, data, count, total, page, pages }`

### POST `/api/courses`
**Body:**
```json
{ "title": "Algorithms", "semester": "S5", "teacher": "Dr. Smith", "color": "#4f46e5", "priority": "high" }
```
**Response `201`:** `{ success: true, data: { ...course } }`

### GET `/api/courses/:id`
### PUT `/api/courses/:id` — Partial update, all fields optional.
### DELETE `/api/courses/:id`
**Errors (all):** `404` Course not found

---

## 5. Tasks — `/api/tasks` 🔒

### GET `/api/tasks`
| Param | Values |
|---|---|
| `search` | Searches `title` and `description` |
| `courseId` | Filter by course |
| `status` | `todo` · `in_progress` · `review` · `completed` |
| `priority` | `low` · `medium` · `high` |
| `sort` | `newest` · `oldest` · `deadline` · `priority` |
| `page` / `limit` | Pagination |

### POST `/api/tasks`
**Body:**
```json
{
  "title": "Prepare for Algorithms exam",
  "courseId": "<id>",
  "priority": "high",
  "deadline": "2026-05-20T10:00:00Z",
  "estimatedDuration": 120,
  "status": "todo"
}
```

### GET/PUT/DELETE `/api/tasks/:id`

---

## 6. Exams — `/api/exams` 🔒

### GET `/api/exams`
Default sort: `examDate ASC`

| Param | Values |
|---|---|
| `search` | Searches `title` |
| `courseId` | Filter by course |
| `status` | `upcoming` · `completed` · `missed` |
| `type` | `exam` · `quiz` · `test` · `tp` · `td` · `presentation` · `other` |
| `priority` | `low` · `medium` · `high` |
| `sort` | `date_asc` · `date_desc` · `newest` · `oldest` |
| `page` / `limit` | Pagination |

### POST `/api/exams`
**Body:**
```json
{
  "title": "Final Algorithms Exam",
  "examDate": "2026-06-15T09:00:00Z",
  "courseId": "<id>",
  "type": "exam",
  "priority": "high",
  "location": "Room B12",
  "topics": ["Sorting", "Graphs"]
}
```

### GET/PUT/DELETE `/api/exams/:id`

---

## 7. Schedules — `/api/schedules` 🔒

### GET `/api/schedules`
Default sort: `start ASC`

| Param | Values |
|---|---|
| `courseId` | Filter by course |
| `type` | `course` · `td` · `tp` · `exam` · `study_session` · `task` · `break` · `personal` · `other` |
| `status` | `scheduled` · `completed` · `cancelled` |
| `start` | ISO date — events starting on or after |
| `end` | ISO date — events starting on or before |
| `page` / `limit` | Pagination |

**Weekly view example:** `GET /api/schedules?start=2026-05-05T00:00:00Z&end=2026-05-11T23:59:59Z`

### POST `/api/schedules`
**Body:**
```json
{
  "title": "Algorithms Lecture",
  "type": "course",
  "start": "2026-05-08T08:00:00Z",
  "end": "2026-05-08T10:00:00Z",
  "courseId": "<id>",
  "location": "Amphitheater A",
  "color": "#4f46e5"
}
```
**Error:** `422` End must be after start

### GET/PUT/DELETE `/api/schedules/:id`

---

## 8. Study Sessions — `/api/study-sessions` 🔒

### GET `/api/study-sessions`
Returns all study sessions sorted by `startTime DESC`.

### POST `/api/study-sessions`
**Body:**
```json
{
  "title": "Algorithms Revision",
  "courseId": "<id>",
  "startTime": "2026-05-08T14:00:00Z",
  "endTime": "2026-05-08T16:00:00Z",
  "duration": 120,
  "status": "planned"
}
```

### GET/PUT/DELETE `/api/study-sessions/:id`

---

## 9. Files — `/api/files` 🔒

### GET `/api/files`
| Param | Values |
|---|---|
| `search` | Searches `originalName` and `tags` |
| `courseId` | Filter by course |
| `type` | `pdf` · `docx` · `xlsx` · `image` · `pptx` · `other` |
| `status` | `uploaded` · `processing` · `processed` · `failed` |
| `sort` | `newest` · `oldest` · `name` · `largest` |
| `page` / `limit` | Pagination |

### POST `/api/files/upload`
Content-Type: `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `file` | File | ✅ |
| `courseId` | string | ❌ |
| `description` | string | ❌ |
| `tags` | comma-separated string | ❌ |

**Allowed:** PDF, DOCX, XLSX, PNG, JPG, JPEG — **Max 20 MB**

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "originalName": "lecture.pdf",
    "fileName": "1746649200-987654.pdf",
    "type": "pdf",
    "size": 204800,
    "url": "/uploads/1746649200-987654.pdf",
    "status": "uploaded"
  }
}
```

### GET `/api/files/:id`
### DELETE `/api/files/:id`
Removes both DB record and physical file from disk.

**Errors:** `400` No file · `400` Unsupported type · `404` Not found

---

## 10. Tokens — `/api/tokens` 🔒

### GET `/api/tokens/balance`
```json
{ "success": true, "data": { "tokenBalance": 10000 } }
```

### GET `/api/tokens/history`
Returns all TokenTransaction records, newest first.
```json
{
  "success": true, "count": 2,
  "data": [
    { "type": "usage", "amount": -500, "reason": "AI daily_plan request", "balanceBefore": 10000, "balanceAfter": 9500 }
  ]
}
```

### POST `/api/tokens/buy-demo`
**Body:** `{ "amount": 5000 }` — integer, min 100, max 1,000,000

**Response `201`:**
```json
{ "success": true, "data": { "tokenBalance": 15000, "transaction": { ... } } }
```

---

## 11. Mock AI — `/api/ai` 🔒

All endpoints: check balance → deduct tokens → create AIRequest + TokenTransaction → return mock response.

| Endpoint | Cost |
|---|---|
| `POST /api/ai/daily-plan` | 500 tokens |
| `POST /api/ai/summarize` | 800 tokens |
| `POST /api/ai/generate-exercises` | 1000 tokens |
| `POST /api/ai/chat` | 300 tokens |

**Error:** `402` Insufficient token balance

### POST `/api/ai/daily-plan`
**Body:** `{ "date": "2026-05-08", "focusHours": 6, "courseIds": ["<id>"] }`

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": {
      "date": "2026-05-08",
      "plan": [{ "time": "08:00 - 10:00", "subject": "Mathematics", "activity": "Solve past exams", "priority": "high" }],
      "tip": "Take a 10-min break every 90 minutes."
    },
    "tokensUsed": 500
  }
}
```

### POST `/api/ai/summarize`
**Body:** `{ "fileId": "<id>", "courseId": "<id>", "text": "optional raw text" }`

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": { "summary": "...", "keyPoints": ["..."], "wordCount": 3200, "readingTime": "12 minutes" },
    "tokensUsed": 800
  }
}
```

### POST `/api/ai/generate-exercises`
**Body:** `{ "courseId": "<id>", "topic": "Sorting", "difficulty": "medium", "count": 3 }`

**Response:**
```json
{
  "success": true,
  "data": {
    "exercises": {
      "exercises": [{ "id": 1, "question": "...", "type": "mcq", "options": ["O(n)", "O(log n)"], "answer": "O(log n)" }]
    },
    "tokensUsed": 1000
  }
}
```

### POST `/api/ai/chat`
**Body:** `{ "message": "How should I study for my exam?", "courseId": "<id>" }`

**Response:** `{ "success": true, "data": { "reply": "Great question! ...", "tokensUsed": 300 } }`

---

## 12. Notifications — `/api/notifications` 🔒

### GET `/api/notifications`
Returns all notifications, newest first.

### POST `/api/notifications`
**Body:**
```json
{
  "title": "Exam tomorrow",
  "message": "Algorithms exam at 09:00.",
  "type": "exam",
  "actionUrl": "/exams/<id>"
}
```
**Types:** `info` · `success` · `warning` · `error` · `exam` · `task` · `ai` · `billing`

### PUT `/api/notifications/read-all`
Marks all unread notifications as read.

### PUT `/api/notifications/:id/read`
Marks one notification as read.

### DELETE `/api/notifications/:id`

---

## 13. Preferences — `/api/preferences` 🔒

### GET `/api/preferences/me`
Returns user preferences document.

### PUT `/api/preferences/me`
Upserts. All nested fields optional.

**Body (partial):**
```json
{
  "language": "fr",
  "theme": "dark",
  "timezone": "Africa/Casablanca",
  "study": { "focusSessionLength": 90, "breakLength": 15, "revisionStyle": "spaced_repetition" },
  "notifications": { "examAlerts": true, "pushNotifications": false },
  "ai": { "assistantTone": "friendly", "responseDetail": "detailed" }
}
```

---

## 14. Subscriptions — `/api/subscriptions` 🔒

### GET `/api/subscriptions/me`
```json
{ "success": true, "data": { "plan": "free", "status": "trial", "endsAt": "2026-05-14T..." } }
```

### POST `/api/subscriptions/demo-upgrade`
**Body:** `{ "plan": "student", "billingCycle": "monthly" }`

| Plan | Price | Tokens |
|---|---|---|
| `student` | $9.99 | 50,000/mo |
| `pro` | $19.99 | 150,000/mo |

Also updates `user.plan`. Response: updated Subscription document.

### POST `/api/subscriptions/cancel-demo`
Resets plan to `free`, sets status to `cancelled`.

---

## 15. Payments — `/api/payments` 🔒

### GET `/api/payments`
Returns all payments, newest first.

### POST `/api/payments/demo`
**Subscription payment:**
```json
{ "amount": 9.99, "type": "subscription", "description": "Student plan", "subscriptionId": "<id>" }
```

**Token pack purchase:**
```json
{ "amount": 4.99, "type": "token_pack", "tokenAmount": 25000, "description": "25k token pack" }
```

> `token_pack` automatically credits `tokenAmount` to `user.tokenBalance` and creates a TokenTransaction.

**Response `201`:**
```json
{
  "success": true,
  "data": { "amount": 9.99, "status": "paid", "provider": "demo", "invoiceNumber": "INV-1746649200000" }
}
```

---

## 16. Security Logs — `/api/security-logs` 🔒

### GET `/api/security-logs`
Returns all security events for current user, newest first.

```json
{
  "success": true,
  "count": 3,
  "data": [
    { "action": "login", "ipAddress": "::1", "status": "success", "createdAt": "..." },
    { "action": "failed_login", "status": "failed", "details": "Wrong password" }
  ]
}
```

**Logged actions:** `login` · `logout` · `failed_login` · `password_change` · `profile_update` · `token_purchase` · `security_update`

---

## Global Error Reference

| Code | Meaning |
|---|---|
| `400` | Bad request / missing required field |
| `401` | Unauthenticated — missing or invalid token |
| `402` | Insufficient token balance |
| `404` | Resource not found (wrong id or not owned) |
| `422` | Validation failed (Zod) — message lists all field errors |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Security Layers

| Layer | Config |
|---|---|
| CORS | Restricted to `CLIENT_URL` from `.env` |
| Helmet | Secure HTTP headers |
| Rate Limit — API | 200 req / 15 min / IP |
| Rate Limit — Auth | 20 req / 15 min / IP |
| Mongo Sanitize | Strips `$` / `.` injection from body/params/query |
| XSS Sanitize | Strips HTML tags from all string values |
| Body Limit | 1 MB max for JSON/urlencoded |
| Passwords | bcryptjs, 10 salt rounds |
| JWT | Signed with `JWT_SECRET`, expiry from `JWT_EXPIRES_IN` |

---

## Quick-Start Test Sequence

```
1. POST /api/auth/register          → save token
2. Authorization: Bearer <token>    → set header for all below
3. POST /api/courses                → save _id as courseId
4. POST /api/tasks                  → use courseId
5. POST /api/exams                  → use courseId
6. POST /api/files/upload           → multipart, field: file
7. GET  /api/tokens/balance         → verify 10000
8. POST /api/ai/chat                → { "message": "Help me study" }
9. GET  /api/tokens/history         → verify -300 deducted
10. POST /api/subscriptions/demo-upgrade → { "plan": "student" }
11. POST /api/payments/demo         → simulate payment
12. GET  /api/security-logs         → view activity trail
```
