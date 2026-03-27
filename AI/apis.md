# MQA API Reference

Base URL: `http://localhost:8000`

Interactive docs: `http://localhost:8000/docs`

---

## Startup order

The pipeline **will not start** until `POST /sop` is called. Start the process first, then send the SOP.

```
python main.py --source 0
  → [WAIT] Waiting for SOP config on POST /sop ...

POST /sop   ← unblocks the pipeline and launches the GUI
GET /stream ← connect at any time to receive live events
```

---

## Endpoints

### `POST /sop`

Send the Standard Operating Procedure before the pipeline starts. Must be called exactly once per session.

**Request**

```
Content-Type: application/json
```

Body — JSON array of step objects:

| Field          | Type            | Required | Description                                      |
|----------------|-----------------|----------|--------------------------------------------------|
| `title`        | string          | yes      | Step name shown in the GUI and sent to GPT       |
| `instructions` | array\<string\> | no       | Free-text notes (not used in pipeline logic)     |
| `safety`       | array\<string\> | no       | Safety requirements GPT checks for this step     |

```json
[
  { "title": "Wear cap",                "safety": [] },
  { "title": "Take bottle",             "safety": ["Wear cap"] },
  { "title": "Drink water from bottle", "safety": ["Wear cap"] },
  { "title": "Keep bottle on table",    "safety": ["Wear cap"] },
  { "title": "Remove cap",              "safety": [] }
]
```

**Response `200 OK`**

```json
{ "status": "ok", "steps": 5 }
```

**Error `422 Unprocessable Entity`**

Returned when the array is empty or a step is missing `title`.

```json
{ "detail": "SOP must contain at least one step." }
```

**curl example**

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

---

### `GET /stream`

Server-Sent Events stream. Connect once and receive live events as the pipeline runs. The connection is kept open with a keepalive comment every 15 seconds.

**Response headers**

```
Content-Type:    text/event-stream
Cache-Control:   no-cache
X-Accel-Buffering: no
```

**Events**

#### `current_step`

Emitted after every GPT analysis cycle. Data is the **1-based** index of the step currently active (either the next expected step, or the blocked/missing step the operator must complete).

```
event: current_step
data: 1
```

| Value | Meaning                                   |
|-------|-------------------------------------------|
| `1`   | Step 1 is active (first step not yet done)|
| `3`   | Steps 1–2 done, step 3 is next            |

#### `safety_err`

Emitted when the pipeline detects a violation. Two sources:

- **SOP tracker** — operator skipped a step, jumped out of order, or is blocked
- **GPT safety check** — operator is not following the safety rules for the current step (e.g. not wearing required PPE)

```
event: safety_err
data: ⛔ BLOCKED — Complete Step 1 first: "Wear cap" No other step will be accepted until this is done.
```

```
event: safety_err
data: Please wear helmet before proceeding.
```

> Only one `safety_err` is emitted per GPT cycle. Tracker errors take priority over GPT safety messages.

**curl example**

```bash
curl -N http://localhost:8000/stream
```

**JavaScript example**

```js
const es = new EventSource('http://localhost:8000/stream');

es.addEventListener('current_step', (e) => {
  console.log('Active step:', parseInt(e.data));
});

es.addEventListener('safety_err', (e) => {
  console.warn('Safety/SOP error:', e.data);
});
```

---

### `GET /health`

Liveness check.

**Response `200 OK`**

```json
{ "status": "ok" }
```

**curl example**

```bash
curl http://localhost:8000/health
```
