import torch
from ultralytics import YOLO
print("torch:", torch.__version__, "cuda:", torch.version.cuda)
print("cuda is available:", torch.cuda.is_available())
print("device name:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)

m = YOLO("yolov8l.pt")
m.model.to("cuda")
print("model device:", next(m.model.parameters()).device)

# quick forward to warm up
import torch as t
x = t.randn(1, 3, 640, 640, device="cuda")
with t.no_grad():
    m.model(x)
print("done")
