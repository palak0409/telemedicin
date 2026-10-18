# Telemed — Telemedicine Video Consultations

A telemedicine web application: patients find verified doctors, book real time slots and meet them in a browser-to-browser **WebRTC** video consultation. Doctors manage their availability and appointments, and document visits with an optional **AI-assisted** workflow (Groq Whisper speech-to-text + Google Gemini summary, always reviewed and approved by the doctor). Administrators verify doctors and manage the platform.

| Layer | Technology |
|---|---|
| Frontend | React 19, JavaScript, Vite, React Router, plain CSS (no UI framework) |
| Backend | Python 3.10+, FastAPI, SQLAlchemy 2 (sync), Pydantic v2 |
| Database | MySQL 8+ (tested on 9.x) |
| Auth | JWT (HS256) + bcrypt |
| Real time | FastAPI WebSockets (notifications + WebRTC signaling) |
| Media | Browser WebRTC (`getUserMedia`, `RTCPeerConnection`), STUN/TURN |
| AI (optional) | Groq-hosted Whisper (`whisper-large-v3`), Google Gemini (`gemini-2.5-flash`) |

Detailed PDFs in [`docs/`](docs/): **Setup_and_Run_Guide.pdf** (step-by-step local setup and troubleshooting) and **Interview_Preparation_Guide.pdf**.

---

## Quick start

**Prerequisites:** Python 3.10+, Node.js 18+, MySQL 8+ running locally (`brew services start mysql` or `mysql.server start` on macOS).

```bash
./run.sh            # first run creates backend/.env and stops if DATABASE_URL still has the placeholder
# edit backend/.env → DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@127.0.0.1:3306/telemedicine
./run.sh            # installs deps, creates the database + tables, seeds data, starts API and web app
```

- Web app: http://localhost:5173
- API: http://localhost:8000 (interactive docs at http://localhost:8000/docs)

| Command | What it does |
|---|---|
| `./run.sh` | Install anything missing, prepare the DB, run API + web app (Ctrl+C stops both) |
| `./run.sh setup` | Install dependencies and create `backend/.env` / `frontend/.env` |
| `./run.sh db` | Create database/tables and seed data (idempotent) |
| `./run.sh demo-call` | Create a confirmed appointment **starting now** between the demo patient and Dr. Sarah Mitchell |
| `./run.sh backend` / `frontend` | Run one side only |
| `./run.sh test` | Backend tests + frontend production build |

### Demo accounts (development seed)

Passwords come from `backend/.env` (`run.sh` sets `Demo@12345` / `Admin@12345` for local use — change them).

| Role | Email |
|---|---|
| Patient | `patient@example.com` (also `jordan.lee@example.com`, `maria.gonzalez@example.com`) |
| Doctor | `sarah.mitchell@example.com` (available 08:00–20:00 every day) and 9 other verified doctors |
| Doctor (pending verification) | `thomas.weber@example.com`, `maria.santos@example.com` |
| Admin | `admin@example.com` |

All seeded people are fictional. The seed also includes past consultations, pending/confirmed appointments and one **approved AI-documented consultation with a Hinglish transcript**, so every screen can be explored without API keys.

---

## Testing the application

### Automated

```bash
# Unit tests only (slot generation, transcript merging):
./run.sh test
# Full integration suite against a real MySQL database (it is DROPPED and recreated — use a throwaway DB):
TEST_DATABASE_URL="mysql+pymysql://root:PASSWORD@127.0.0.1:3306/telemedicine_test" ./run.sh test
```

The 22 backend tests cover registration/login, role protection, doctor verification visibility, booking + conflict rules, **6 simultaneous bookings of one slot (exactly one succeeds)**, doctor access to patient data, availability validation, the full WebSocket signaling exchange (join → offer → answer → ICE → media-state → end), rejoin/peer-left, non-participant rejection, and the AI documentation pipeline (with Groq/Gemini faked): speaker interleaving, Hinglish preserved, drafts hidden from patients, approval, failure + retry, manual notes during failure.

### Manual: a video call on one computer

1. `./run.sh demo-call` (prints the appointment it created).
2. Open http://localhost:5173 in **two tabs** (the session token lives in `sessionStorage`, so each tab can hold a different user). Sign in as `patient@example.com` in one and `sarah.mitchell@example.com` in the other.
3. In both: open the appointment → **Join consultation** → allow camera/microphone → **Join**.
4. Check: remote video, *Connected · Direct connection* status, mute/camera toggles reflected on the other side, **End** ends it for both.

Camera access requires a secure context: `localhost` works; other devices need HTTPS (e.g. a tunnelling tool).

### Manual: TURN relay

Set `TURN_SERVER`, `TURN_USERNAME`, `TURN_PASSWORD` and `ICE_TRANSPORT_POLICY=relay` in `backend/.env`, restart, and join a call: the status bar should read **Relayed via TURN**. (`relay` without a TURN server is ignored so calls do not silently break.)

### Manual: AI documentation

1. Add `GROQ_API_KEY` (and `GEMINI_API_KEY`) to `backend/.env` and restart the API.
2. Start a call; as the doctor press **Record** (the patient sees *Recorded for clinical notes*). Speak in English, Hindi or Hinglish.
3. End the call → the doctor sees upload → transcription → draft summary progress, then the editable summary and transcript.
4. Edit, **Approve and finalize** → the patient receives a notification and sees the visit summary under the appointment and in *Medical History → Consultation history*.

Without keys the **Record** button is hidden and manual notes work as before. With an invalid key the failure is shown with **Retry** and the doctor can still write and approve notes manually.

---

## Architecture

```
┌────────────── Browser (React SPA) ───────────────┐          ┌──────────── FastAPI ─────────────┐
│ features/* pages ─ services/apiClient ── REST ───┼─ /api ──▶│ features/*/router → service      │──▶ MySQL
│ NotificationsContext ─── WebSocket ──────────────┼─ /ws/notifications ─▶ NotificationHub       │
│ useConsultationCall ──── WebSocket (signaling) ──┼─ /ws/consultations/{room} ─▶ RoomManager    │
│        │                                         │          │ documentation: BackgroundTasks ───┼──▶ Groq Whisper
│        └── RTCPeerConnection ◀═══ audio/video (SRTP, P2P or via TURN) ═══▶ other browser        │──▶ Google Gemini
└──────────────────────────────────────────────────┘          └───────────────────────────────────┘
```

- **WebSocket = signaling, WebRTC = media.** The server never sees audio or video during a call.
- In development Vite proxies `/api`, `/ws` and `/uploads` to FastAPI, so the browser talks to one origin (no CORS needed).

### Folder structure (feature-first)

```
telemedicine/
├── run.sh  README.md  .gitignore
├── backend/
│   ├── requirements.txt  .env.example
│   ├── app/
│   │   ├── main.py                 # app wiring: routers, CORS, static uploads
│   │   ├── core/                   # config, security (JWT/bcrypt), dates, errors, shared schemas, ws helpers
│   │   ├── database/               # engine/session, Base + UTC datetime type, init_db, seed
│   │   └── features/
│   │       ├── auth/               # register/login/me, auth dependencies (HTTP + WebSocket)
│   │       ├── users/              # User model, account settings, photo upload
│   │       ├── doctors/            # profiles, specializations, availability, slot generation, search
│   │       ├── patients/           # medical profile, doctor→patient access rule
│   │       ├── appointments/       # booking (row lock), lifecycle, listing
│   │       ├── consultations/      # rooms, join window, ICE config, signaling.py (WebSocket)
│   │       ├── documentation/      # recordings, Groq speech.py, Gemini summarizer.py, review/approval
│   │       ├── notifications/      # model, hub (live sockets), REST + WebSocket
│   │       └── admin/              # stats, verification, management endpoints
│   └── tests/
└── frontend/
    ├── vite.config.js  .env.example
    └── src/
        ├── main.jsx  App.jsx
        ├── services/               # apiClient (fetch + JWT + error normalization), socket, tokenStorage
        ├── context/                # AuthContext, ToastContext
        ├── hooks/                  # useApi, useAsyncAction, useDebouncedValue, useClickOutside
        ├── routes/                 # route table, role guards
        ├── components/ui|layout/   # Button, Field, Card, Modal, Tabs…; AppShell, sidebar, auth layout
        ├── styles/                 # design tokens + base/components/layout CSS
        ├── utils/                  # formatting, constants
        └── features/
            ├── auth/ doctors/ patients/ appointments/ notifications/ admin/
            ├── consultations/      # room page, useConsultationCall (WebRTC), useLocalMedia, connectionRoute
            └── documentation/      # useConsultationRecorder, DocumentationPanel, transcript, summary
```

Each feature owns its pages, components, hooks and `api.js`; shared pieces live in `components/`, `hooks/`, `services/`.

### State management

No global store. `AuthContext` holds the signed-in user, `NotificationsContext` the live notification feed, `ToastContext` transient messages; everything else is local component state loaded through `useApi`. Filters on search/admin lists live in the URL.

---

## Data model

| Table | Purpose / key columns |
|---|---|
| `users` | One login per person: `email` (unique), `password_hash`, `role` (patient/doctor/admin), `is_active` |
| `specializations` | Admin-managed list; `is_active` instead of hard deletes when in use |
| `doctor_profiles` | 1:1 with a doctor user: specialization FK, `license_number` (unique), qualifications, institution, clinic, years, `languages` (JSON), fee, bio, `consultation_duration_minutes`, `verification_status` (pending/verified/rejected/suspended) |
| `doctor_availability` | Weekly windows (`day_of_week`, `start_time`, `end_time`) in clinic time |
| `doctor_time_off` | Full days off (unique per doctor/date) |
| `patient_profiles` | 1:1 with a patient: DOB, gender, blood group, allergies, conditions, medications, surgeries, family history, emergency contact |
| `appointments` | `patient_id`, `doctor_id` (users), `start_time`/`end_time` (UTC), `reason`, `status`, `status_note` |
| `consultations` | 1:1 with an appointment: `room_id` (UUID), `status` (waiting/active/ended), `started_at`, `ended_at`, `notes` |
| `consultation_documentation` | 1:1 with a consultation: `status`, `transcript` (JSON, speaker-labelled), `ai_summary` (as generated), `draft_summary`, `approved_summary`, `approved_at/by`, failure stage/message |
| `notifications` | Per-user in-app notifications (`type`, `title`, `message`, `link`, `is_read`) |

**Time:** every timestamp is stored as UTC (a custom `UTCDateTime` column type returns timezone-aware values, so the API always emits `…Z`). Weekly availability is interpreted in `CLINIC_TIMEZONE`; the browser shows times in the viewer's zone.

**Schema management:** `Base.metadata.create_all` at startup of `init_db` (adds missing tables, never alters). A production system would use Alembic migrations.

---

## Key flows

### Appointment scheduling

- **Slots are computed, not stored:** weekly windows − time off − pending/confirmed appointments − the past (`doctors/slots.py`, a pure function). The same function renders slots and validates bookings, so they can never disagree.
- **Double booking:** booking locks the doctor's profile row (`SELECT … FOR UPDATE`) before re-checking the slot, so concurrent requests are serialized. The engine uses **READ COMMITTED** so the re-check sees rows committed by the request that held the lock (under MySQL's default REPEATABLE READ it could read a stale snapshot). Patients also cannot hold two overlapping appointments.
- **Lifecycle:** `pending → confirmed → completed`, or `rejected` / `cancelled`. Pending requests hold the slot. Cancelling is possible until the start time; the UI shows unanswered past requests as *Expired*.
- Doctors cannot mark a day off while they have active appointments that day.

### Real-time notifications

Every event (booking, accept/reject/cancel, room opened, consultation ended, verification decisions, AI draft ready, summary approved) is stored in `notifications` and pushed over `/ws/notifications`. Route handlers are synchronous (threadpool), so `NotificationHub.send_from_thread` schedules the push on the event loop. The client reconnects with exponential backoff and refetches on every reconnect; pages subscribe to refresh themselves.

### WebSocket protocol

Both sockets authenticate with their **first message** `{"type":"auth","token":"<jwt>"}` (a token in the URL would end up in access logs). Envelope: `{"type": string, "data": object}`.

| Direction | Type | Data |
|---|---|---|
| C→S | `offer` / `answer` | `{sdp}` |
| C→S | `ice-candidate` | `{candidate}` |
| C→S | `media-state` | `{audio, video}` (mute/camera indicators) |
| C→S | `recording-state` | `{recording}` (patient sees the recording indicator) |
| C→S | `end` / `leave` / `ping` | — |
| S→C | `joined` | `{self, peer|null}` |
| S→C | `peer-joined` / `peer-left` | `{peer}` |
| S→C | relayed types above | same data + `from` |
| S→C | `consultation-ended` | `{ended_by}` |
| S→C | `error` | `{message}` |

Close codes: `4401` unauthorized, `4403` not a participant / room unavailable, `4409` replaced by the same user's newer tab.

### WebRTC call (`features/consultations/hooks/useConsultationCall.js`)

1. **Lobby:** `getUserMedia` (falls back to audio-only if there is no camera; can join with no devices). The appointment's details are shown.
2. **Join:** `POST /api/consultations/join` checks the participant, appointment status and join window (`CONSULTATION_JOIN_WINDOW_MINUTES` before start / after end), creates the room on first entry, and returns `room_id` + ICE servers. The other participant is notified.
3. **Signaling:** open `/ws/consultations/{room_id}`. **Whoever was already in the room makes the offer** when it receives `peer-joined`. The server handles joins one at a time, so only one side offers ("glare" is impossible).
4. **SDP:** offerer `createOffer → setLocalDescription → send`; answerer `setRemoteDescription → createAnswer → setLocalDescription → send`. A side without a camera/mic adds `recvonly` transceivers so it still receives media.
5. **ICE:** candidates trickle through the socket. Candidates that arrive before the remote description is set are queued, then flushed. Messages are processed strictly in order through a promise queue.
6. **Connection state:** `connected` → the call is live; `getStats()` on the selected candidate pair shows *Direct connection* (host/srflx) or *Relayed via TURN* plus the round-trip time. `disconnected` → wait 4 s, then an **ICE restart** (`createOffer({iceRestart:true})`, driven only by the offerer, maximum 2). `failed` → a clear message with a TURN hint and **Try again**.
7. **Peer leaves / socket drops:** the peer connection is closed. The socket reconnects with backoff; on rejoin the waiting side offers again.
8. **End:** `end` marks the consultation ended and the appointment completed, and broadcasts `consultation-ended`. Tracks are stopped, the peer connection closed and sockets closed; unmounting the page cleans up the same way.

### STUN, TURN and NAT traversal

- **STUN** (`STUN_SERVER`) lets each browser discover its public address (server-reflexive candidate), which is enough for most home NATs.
- **TURN** (`TURN_SERVER`, `TURN_USERNAME`, `TURN_PASSWORD`) relays encrypted media when a direct path is impossible: symmetric NAT, corporate firewalls, some mobile carriers.
- ICE servers are delivered only to authenticated participants by the join endpoint. Nothing is hard-coded in the frontend.
- Production improvement: short-lived TURN credentials (TURN REST API / coturn `use-auth-secret`) instead of static ones.

### AI-assisted documentation (Phase 2)

```
doctor presses Record ─▶ browser records 2 tracks: doctor mic + incoming patient audio (MediaRecorder, Opus 32 kbps)
call ends ─▶ POST /consultations/{id}/documentation/recordings (multipart, per-speaker files + offsets) ─▶ 202
background task: Groq whisper-large-v3 per file ─▶ merge by timestamp into Doctor/Patient turns ─▶ delete audio
               ─▶ Gemini (JSON schema, temperature 0.1, "use only the transcript") ─▶ ready_for_review
doctor: transcript tab + editable summary + own notes ─▶ Save draft / Approve and finalize
approved summary + notes ─▶ patient's appointment page & consultation history (notification sent)
```

- **Speaker identity without diarization:** each recording holds exactly one speaker, so labels are exact; segments are shifted by each file's start offset to build one timeline. If the patient reconnects, the new audio track becomes an extra segment.
- **Languages:** Whisper's language is **not fixed** and the *translations* endpoint is never used, so English, Hindi and Hinglish are transcribed as spoken. The prompt lists only clinical vocabulary (drug names, units) to help spelling without steering the language. `whisper-large-v3` is Groq's most accurate multilingual model; `whisper-large-v3-turbo` is a faster, cheaper option through `GROQ_WHISPER_MODEL`.
- **Summary sections:** chief complaint, symptoms, relevant history, current medications, allergies, observations, assessment/diagnosis discussed, treatment/medication plan, follow-up. Empty means "not discussed"; the prompt forbids adding anything not said.
- **Human in the loop:** the original AI output (`ai_summary`), the working draft and the approved version are stored separately. Only `approved_summary` (plus the doctor's notes) ever reaches the patient or history endpoints. Transcripts and drafts are visible only to that appointment's doctor; admins see neither.
- **Failure handling:** the status records the failed stage (`transcription` / `summary`); **Retry** resumes there (a kept transcript is not re-sent). Processing stuck for more than 10 minutes (e.g. after a server restart) can also be retried. The consultation, appointment status and manual notes never depend on the AI succeeding.
- **Keys** (`GROQ_API_KEY`, `GEMINI_API_KEY`) are read only by the backend. The frontend only learns *whether* features are enabled (`GET /api/documentation/config`).
- **Privacy:** audio is stored outside the public `uploads/` folder in `backend/recordings/`, deleted as soon as it has been transcribed, and recording is visible to the patient for the whole time it is active.

---

## REST API overview

All under `/api`; JSON; `Authorization: Bearer <jwt>` unless noted. Full schemas at `/docs`.

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/register/patient`, `POST /auth/register/doctor`, `POST /auth/login`, `GET /auth/me` |
| Account | `PATCH /users/me`, `POST /users/me/password`, `POST /users/me/photo`, `DELETE /users/me/photo` |
| Specializations | `GET /specializations` (public) |
| Doctors | `GET /doctors?q&specialization_id&language&min_experience&available&sort&limit&offset`, `GET /doctors/languages`, `GET /doctors/{id}`, `GET /doctors/{id}/slots?start_date&days` |
| Doctor self | `GET/PUT /doctors/me/profile`, `GET/PUT /doctors/me/availability`, `POST /doctors/me/time-off`, `DELETE /doctors/me/time-off/{id}` |
| Patients | `GET/PUT /patients/me/medical-profile`; doctor: `GET /patients`, `GET /patients/{id}` (only with a care relationship) |
| Appointments | `POST /appointments`, `GET /appointments?scope&status`, `GET /appointments/{id}`, `POST /appointments/{id}/accept|reject|cancel` |
| Consultations | `POST /consultations/join`, `GET /consultations` (history), `PUT /consultations/{id}/notes` |
| Documentation | `GET /documentation/config`, `POST /consultations/{id}/documentation/recordings`, `GET/PUT /consultations/{id}/documentation`, `POST …/approve`, `POST …/retry` |
| Notifications | `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |
| Admin | `GET /admin/stats`, `GET /admin/doctors`, `GET /admin/doctors/{id}`, `PATCH /admin/doctors/{id}/verification`, `PATCH /admin/users/{id}/status`, `GET /admin/patients`, `GET /admin/appointments`, `POST /admin/appointments/{id}/cancel`, `GET /admin/consultations`, `GET/POST/PUT/DELETE /admin/specializations` |
| Health | `GET /health` |

---

## Environment configuration

`backend/.env` (template: `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `mysql+pymysql://USER:PASS@HOST:3306/telemedicine` (database auto-created if permitted) |
| `JWT_SECRET` | ≥ 32 characters; generated by `run.sh` |
| `JWT_EXPIRE_MINUTES` | Token lifetime (default 480) |
| `CORS_ORIGINS` | Needed only when not using the Vite proxy |
| `CLINIC_TIMEZONE` | IANA zone for weekly availability (`run.sh` uses your system zone) |
| `BOOKING_HORIZON_DAYS`, `CONSULTATION_JOIN_WINDOW_MINUTES` | Scheduling rules |
| `STUN_SERVER`, `TURN_SERVER`, `TURN_USERNAME`, `TURN_PASSWORD` | ICE servers (comma-separated URLs allowed) |
| `ICE_TRANSPORT_POLICY` | `all` or `relay` (force TURN for testing) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Admin account created on first `init_db` |
| `SEED_DEMO_DATA`, `DEMO_PASSWORD` | Demo users and history |
| `MAX_UPLOAD_MB` | Profile photo limit |
| `GROQ_API_KEY`, `GROQ_WHISPER_MODEL` | Speech-to-text (optional) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Summary generation (optional) |
| `MAX_RECORDING_MB` | Per-file audio limit (Groq free tier accepts 25 MB) |

`frontend/.env`: `VITE_API_BASE_URL` (default `/api`), `VITE_PROXY_TARGET` (default `http://localhost:8000`), `VITE_CURRENCY` (default `USD`).

Never commit real keys: `.env` files are git-ignored.

---

## Security considerations

- Passwords hashed with bcrypt; uniform "invalid email or password" message; deactivated users are rejected on every request (the user is re-loaded from the database for each token).
- Role checks on every backend route; frontend guards mirror them only for UX.
- **Least privilege for medical data:** doctors see a patient's medical profile only with a pending/confirmed/completed appointment between them (404 otherwise, to avoid probing). Admins never see medical profiles, reasons for visit, notes, transcripts or drafts. Patients see only approved summaries.
- WebSocket JWT sent as the first message (not in URLs); room membership is re-validated against the appointment; a relayed signaling message is limited to 64 KB.
- Upload validation (type, size, random file names); consultation audio is never publicly served and is deleted after transcription.
- Token storage in `sessionStorage` (per tab, cleared on close). Trade-off: like `localStorage` it is readable by injected scripts; an httpOnly-cookie session would be the hardening step.
- Not yet implemented (production checklist): rate limiting on login, refresh tokens/revocation, HTTPS termination, short-lived TURN credentials, audit log, Alembic migrations, encryption at rest for clinical data, explicit patient consent capture for recording.

## Scaling notes

- The API is stateless except for two in-memory registries: `NotificationHub` and the signaling `RoomManager`. Running several instances requires sticky sessions for sockets, or moving room state and fan-out to Redis pub/sub.
- Media never touches the API, so call load scales with clients and TURN capacity, not app servers. A coturn cluster near users matters most.
- Multi-party calls would need an SFU (e.g. mediasoup, LiveKit) instead of a mesh.
- AI processing runs in FastAPI background tasks; at volume, move it to a job queue (Celery/RQ/Arq) with retries.
- "Next available" in search is computed on the fly; at larger scale, cache it or materialize upcoming slots.

## Known limitations

- Recording happens in the doctor's browser; if the doctor closes the tab before ending the call, that recording is lost (manual notes remain).
- Appointment times are shown in the viewer's local zone while the booking date strip uses clinic dates. These match when both are in the same zone (the typical case).
- There is no payment step; the fee is informational.
