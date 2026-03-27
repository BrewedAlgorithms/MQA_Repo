# MQA API Reference

Base URL: `http://localhost:8000`

Interactive docs: `http://localhost:8000/docs`

---

## Startup order

The pipeline **will not start** until `POST /sop` is called. Start the process first, then send the SOP.

```
python main.py
  → [INFO] Source → HLS/RTSP stream  rtsp://localhost:8554/cam
  → [WAIT] Waiting for SOP config on POST /sop ...

POST /sop   ← unblocks the pipeline and launches the GUI
GET /stream ← connect at any time to receive live events
```

Source priority (resolved from `.env`):
1. `$RTSP` — RTSP stream from the video streamer (**preferred**, OpenCV reads this natively)
2. `$HLS`  — HLS stream (fallback; requires FFmpeg with HLS support)
3. `0`     — webcam index fallback

Start the video streamer first (from `utilities/video_streamer/`):
```bash
py streamer.py
# choose stream name: cam
# choose source: 2 (webcam) or 1 (video file)
# → RTSP → rtsp://localhost:8554/cam
```

---

## Quick test sequence

Open three terminals and run these in order:

```bash
# Terminal 1 — start the video streamer
cd utilities/video_streamer && py streamer.py

# Terminal 2 — start the pipeline (blocks until SOP is POSTed)
python main.py

# Terminal 2 — send the SOP (unblocks the pipeline)
curl -X POST http://localhost:8000/sop \
  -H "Content-Type: application/json" \
  -d '[
    {"title": "Wear cap",                "safety": []},
    {"title": "Take bottle",             "safety": ["Wear cap"]},
    {"title": "Drink water from bottle", "safety": ["Wear cap"]},
    {"title": "Keep bottle on table",    "safety": ["Wear cap"]},
    {"title": "Remove cap",              "safety": []}
  ]'

# Terminal 3 — listen to the live SSE stream
curl -N http://localhost:8000/stream
```

---

## Endpoints

---

### `POST /sop`

Send the Standard Operating Procedure. **Must be called once before the pipeline starts.**

**Request**

```
Content-Type: application/json
```

Body — JSON array of step objects:

| Field          | Type            | Required | Description                                  |
|----------------|-----------------|----------|----------------------------------------------|
| `title`        | string          | yes      | Step name shown in the GUI and sent to GPT   |
| `instructions` | array\<string\> | no       | Free-text notes (not used in pipeline logic) |
| `safety`       | array\<string\> | no       | Safety requirements GPT checks for this step |

**Response `200 OK`**

```json
{ "status": "ok", "steps": 5 }
```

**Error `422 Unprocessable Entity`**

```json
{ "detail": "SOP must contain at least one step." }
```

---

#### curl — send a 5-step SOP

```bash
curl -X POST http://localhost:8000/sop \
  -H "Content-Type: application/json" \
  -d '[
    {"title": "Wear cap",                "safety": []},
    {"title": "Take bottle",             "safety": ["Wear cap"]},
    {"title": "Drink water from bottle", "safety": ["Wear cap"]},
    {"title": "Keep bottle on table",    "safety": ["Wear cap"]},
    {"title": "Remove cap",              "safety": []}
  ]'
```

Expected response:

```json
{ "status": "ok", "steps": 5 }
```

---

#### curl — send SOP with instructions field

```bash
curl -X POST http://localhost:8000/sop \
  -H "Content-Type: application/json" \
  -d '[
    {
      "title": "Wear cap",
      "instructions": ["Put on the white hairnet before entering the line"],
      "safety": []
    },
    {
      "title": "Take bottle",
      "instructions": ["Pick up the bottle from the conveyor"],
      "safety": ["Wear cap"]
    }
  ]'
```

Expected response:

```json
{ "status": "ok", "steps": 2 }
```

---

#### curl — error: empty array

```bash
curl -X POST http://localhost:8000/sop \
  -H "Content-Type: application/json" \
  -d '[]'
```

Expected response `422`:

```json
{ "detail": "SOP must contain at least one step." }
```

---

#### curl — verbose (see full request/response headers)

```bash
curl -v -X POST http://localhost:8000/sop \
  -H "Content-Type: application/json" \
  -d '[{"title": "Wear cap", "safety": []}]'
```

---

### `GET /stream`

Server-Sent Events stream. Connect once and receive live events as the pipeline runs.
The connection stays open; a keepalive comment (`: keepalive`) is sent every 15 seconds.

**Response headers**

```
Content-Type:      text/event-stream
Cache-Control:     no-cache
X-Accel-Buffering: no
```

**Events**

#### `current_step`

Emitted after every GPT analysis cycle. Data is the **1-based** index of the step currently active.

```
event: current_step
data: 1
```

| Value | Meaning                                    |
|-------|--------------------------------------------|
| `1`   | Step 1 is active (no steps done yet)       |
| `3`   | Steps 1–2 done, step 3 is next             |

#### `safety_err`

Emitted when a violation is detected. Two sources:

- **SOP tracker** — operator skipped / jumped out of order / is blocked
- **GPT safety check** — operator is not following PPE rules for the current step

```
event: safety_err
data: ⛔ BLOCKED — Complete Step 1 first: "Wear cap" No other step will be accepted until this is done.
```

```
event: safety_err
data: Please wear helmet before proceeding.
```

> Only one `safety_err` is emitted per GPT cycle. Tracker errors take priority over GPT safety messages.

---

#### curl — connect and listen (stays open)

```bash
curl -N http://localhost:8000/stream
```

---

#### curl — listen and prefix each line with a timestamp

```bash
curl -N http://localhost:8000/stream | while IFS= read -r line; do
  echo "$(date +%H:%M:%S)  $line"
done
```

---

#### curl — capture first 10 events then disconnect

```bash
curl -N http://localhost:8000/stream | head -n 30
```

> Each event is 3 lines (`event:`, `data:`, blank), so 30 lines ≈ 10 events.

---

#### curl — verbose (see response headers)

```bash
curl -Nv http://localhost:8000/stream
```

---

#### JavaScript — browser / Node.js

```js
const es = new EventSource('http://localhost:8000/stream');

es.addEventListener('current_step', (e) => {
  console.log('Active step:', parseInt(e.data, 10));
});

es.addEventListener('safety_err', (e) => {
  console.warn('Safety/SOP error:', e.data);
});

es.onerror = (err) => {
  console.error('SSE connection error', err);
};
```

---

### `GET /health`

Liveness check. Use this to confirm the server is up before POSTing the SOP.

**Response `200 OK`**

```json
{ "status": "ok" }
```

---

#### curl — basic check

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{ "status": "ok" }
```

---

#### curl — check with HTTP status code printed

```bash
curl -o /dev/null -w "%{http_code}\n" http://localhost:8000/health
```

Expected output: `200`

---

#### curl — poll until server is ready (use before POSTing SOP)

```bash
until curl -sf http://localhost:8000/health > /dev/null; do
  echo "Waiting for server…"
  sleep 1
done
echo "Server is up"
```
