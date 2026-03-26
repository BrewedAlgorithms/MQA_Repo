# Hybrid AI Manufacturing QA (YOLOv8 + MediaPipe + GPT-4o)

A beginner-friendly Python project for manufacturing quality control using:
- Video/webcam input
- YOLOv8 object detection (`bolt`, `washer`, `wrench`)
- MediaPipe hand analysis (position, proximity, motion)
- GPT-4o Vision for SOP step validation

## 1) Install

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 2) Configure API key

Create a `.env` file from `.env.example` and add your key:

```env
OPENAI_API_KEY=your_real_key
OPENAI_MODEL=gpt-4o
```

## 3) YOLO model

Set `YOLO_MODEL_PATH` in `src/main.py`.
- You can start with `yolov8n.pt` for testing.
- For `bolt/washer/wrench`, you should train or fine-tune your custom model.

## 4) Run

### Webcam

```bash
python src/main.py --source 0
```

### Video file

```bash
python src/main.py --source sample.mp4
```

Optional:

```bash
python src/main.py --source sample.mp4 --interval 2 --near-threshold 90
```

## 5) Output format

Printed per sampled frame:

```text
[Frame 10] Objects: bolt(0.95), washer(0.88). Right hand near bolt. Rotational motion detected.
[GPT] STEP_OK: Step 2: Insert bolt
```

or

```text
[GPT] FLAG: Washer missing before bolt insertion.
```

## 6) Default SOP

- Step 1: Place washer
- Step 2: Insert bolt
- Step 3: Tighten bolt using wrench

Update SOP in `src/main.py` as needed.
