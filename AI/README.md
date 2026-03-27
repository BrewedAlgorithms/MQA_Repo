# Manufacturing QA Backend (FastAPI + YOLOv8)

Production-grade FastAPI backend that serves real-time video processing with YOLOv8 and SOP enforcement.

## Install

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Configure

Create `.env` and set:

```env
OPENAI_API_KEY=your_real_key
OPENAI_MODEL=gpt-4o
```

## Run API server

```bash
cd "C:\Users\tpara\Downloads\MAnifacturing QA"
$env:PYTHONPATH="C:/Users/tpara/Downloads/MAnifacturing QA/src"
.venv\Scripts\python -m uvicorn src.api:app --host 0.0.0.0 --port 8000
```

## Video sources

Mapping used by `/start`:

- 0 → webcam (`cv2.VideoCapture(0)`)
- 1 → secondary camera
- 2 → Media/neha2.mp4
- 3 → Media/neha3.mp4
- 4 → Media/worker4.mp4
- 5 → Media/worker5.mp4

## REST endpoints

- `POST /start` — starts or restarts pipeline with `{ "source": <0-5> }`.
- `POST /stop` — stops processing and releases resources.
- `GET /video` — multipart JPEG stream (boxes only, no overlays).
- `GET /events` — SSE state stream every 3s (step/status/safety).
- `GET /checkpoint` — returns all SOP steps with statuses.
- `POST /upload-sop` — replace SOP with validated payload.

## Quick usage (PowerShell)

```bash
curl -X POST http://localhost:8000/start -H "Content-Type: application/json" -d "{\"source\":2}"
curl -X GET http://localhost:8000/checkpoint
curl -X POST http://localhost:8000/stop
```

Open the video stream in a browser at `http://localhost:8000/video`. SSE stream is at `http://localhost:8000/events`.

## SOP upload schema

```json
{
  "steps": [
    {
      "id": 17,
      "title": "Press Seal Lower Side",
      "instructions": ["Use the tool to press the lower section of the seal."],
      "safety": ["Helmet", "Gloves"],
      "startTime": "7:26",
      "endTime": "8:18"
    }
  ]
}
```

After upload, the execution state resets and the new SOP is enforced immediately.
