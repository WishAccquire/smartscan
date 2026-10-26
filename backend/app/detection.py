
import base64
import cv2
import numpy as np

from functools import lru_cache
from ultralytics import YOLO


MODEL_NAME = "yolo11n.pt"


@lru_cache(maxsize=1)
def get_model():
    return YOLO(MODEL_NAME)


def encode_image(image):
    success, encoded = cv2.imencode(".jpg", image)

    if not success:
        raise ValueError("Unable to encode detection image")

    return base64.b64encode(
        encoded.tobytes()
    ).decode("utf-8")


def detect_objects(image, confidence=0.25):
    model = get_model()

    results = model.predict(
        source=image,
        conf=confidence,
        imgsz=640,
        verbose=False
    )

    result = results[0]

    detections = []

    for box in result.boxes:
        class_id = int(box.cls[0].item())
        score = float(box.conf[0].item())

        coordinates = (
            box.xyxy[0]
            .cpu()
            .numpy()
            .tolist()
        )

        detections.append({
            "class_id": class_id,
            "object": result.names[class_id],
            "confidence": round(score, 4),
            "bbox": [
                round(float(value), 2)
                for value in coordinates
            ]
        })

    annotated = result.plot()

    average_confidence = (
        round(
            sum(d["confidence"] for d in detections)
            / len(detections),
            4
        )
        if detections else None
    )

    return {
        "image": encode_image(annotated),
        "detection_count": len(detections),
        "average_confidence": average_confidence,
        "detections": detections
    }


def compare_detections(
    original,
    enhanced,
    confidence=0.25
):
    original_result = detect_objects(
        original, confidence
    )

    enhanced_result = detect_objects(
        enhanced, confidence
    )

    original_count = original_result["detection_count"]
    enhanced_count = enhanced_result["detection_count"]

    return {
        "original": original_result,
        "enhanced": enhanced_result,
        "comparison": {
            "original_count": original_count,
            "enhanced_count": enhanced_count,
            "detection_difference": (
                enhanced_count - original_count
            ),
            "original_average_confidence":
                original_result["average_confidence"],
            "enhanced_average_confidence":
                enhanced_result["average_confidence"]
        }
    }
