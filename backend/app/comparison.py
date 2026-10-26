
import cv2
import numpy as np

from .quality import analyze_image


def gamma_correction(image, gamma=1.2):
    gamma = max(float(gamma), 0.01)

    table = np.array([
        ((i / 255.0) ** (1.0 / gamma)) * 255
        for i in range(256)
    ], dtype=np.uint8)

    return cv2.LUT(image, table)


def clahe_enhancement(image, clip_limit=2.0):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(
        clipLimit=float(clip_limit),
        tileGridSize=(8, 8)
    )

    enhanced_l = clahe.apply(l)

    return cv2.cvtColor(
        cv2.merge((enhanced_l, a, b)),
        cv2.COLOR_LAB2BGR
    )


def denoise_image(image, strength=10):
    return cv2.fastNlMeansDenoisingColored(
        image,
        None,
        h=float(strength),
        hColor=float(strength),
        templateWindowSize=7,
        searchWindowSize=21
    )


def sharpen_image(image, strength=1.0):
    blurred = cv2.GaussianBlur(image, (0, 0), 1.0)

    return cv2.addWeighted(
        image,
        1.0 + float(strength),
        blurred,
        -float(strength),
        0
    )


def combined_enhancement(
    image,
    gamma=1.2,
    clip_limit=2.0,
    denoise_strength=10,
    sharpen_strength=1.0
):
    result = gamma_correction(image, gamma)
    result = clahe_enhancement(result, clip_limit)
    result = denoise_image(result, denoise_strength)
    result = sharpen_image(result, sharpen_strength)

    return result


def generate_comparisons(
    image,
    gamma=1.2,
    clip_limit=2.0,
    denoise_strength=10,
    sharpen_strength=1.0
):
    results = {
        "original": image.copy(),
        "gamma": gamma_correction(image, gamma),
        "clahe": clahe_enhancement(image, clip_limit),
        "denoised": denoise_image(image, denoise_strength),
        "sharpened": sharpen_image(image, sharpen_strength),
        "combined": combined_enhancement(
            image,
            gamma,
            clip_limit,
            denoise_strength,
            sharpen_strength
        )
    }

    return results


def encode_image(image):
    import base64

    success, encoded = cv2.imencode(".jpg", image)

    if not success:
        raise ValueError("Image encoding failed")

    return base64.b64encode(encoded.tobytes()).decode("utf-8")


def comparison_report(image, **parameters):
    results = generate_comparisons(image, **parameters)

    report = {}

    for name, result in results.items():
        report[name] = {
            "image": encode_image(result),
            "metrics": analyze_image(result)
        }

    return report
