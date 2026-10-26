import cv2
import numpy as np


def decode_image(content: bytes):
    image = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError('Invalid or unsupported image')
    return image


def order_points(points):
    pts = np.asarray(points, dtype='float32').reshape(4, 2)
    sums = pts.sum(axis=1)
    diffs = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(sums)], pts[np.argmin(diffs)], pts[np.argmax(sums)], pts[np.argmax(diffs)]], dtype='float32')


def detect_and_warp(image):
    h, w = image.shape[:2]
    ratio = max(h, w) / 900.0
    resized = cv2.resize(image, (int(w / ratio), int(h / ratio))) if ratio > 1 else image.copy()
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    quad = None
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:20]:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) == 4 and cv2.isContourConvex(approx) and cv2.contourArea(approx) > resized.shape[0] * resized.shape[1] * 0.1:
            quad = approx.reshape(4, 2).astype('float32')
            break
    if quad is None:
        return image, False
    scale = ratio if ratio > 1 else 1
    tl, tr, br, bl = order_points(quad * scale)
    out_w = max(1, int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl))))
    out_h = max(1, int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl))))
    dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype='float32')
    matrix = cv2.getPerspectiveTransform(np.array([tl, tr, br, bl]), dst)
    return cv2.warpPerspective(image, matrix, (out_w, out_h)), True


def enhance(image, mode='color'):
    if mode == 'color':
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
        return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if mode == 'gray':
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    if mode == 'bw':
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        bw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
        return cv2.cvtColor(bw, cv2.COLOR_GRAY2BGR)
    raise ValueError('Unknown enhancement mode')


# ==========================================
# MODULE A: ADVANCED IMAGE ENHANCEMENT
# ==========================================

def gamma_correction(image, gamma=1.2):
    """Gamma > 1 brightens the image."""
    gamma = float(gamma)
    if not 0.2 <= gamma <= 3.0:
        raise ValueError("Gamma must be between 0.2 and 3.0")

    table = np.array([
        np.clip(((i / 255.0) ** (1.0 / gamma)) * 255, 0, 255)
        for i in range(256)
    ], dtype=np.uint8)

    return cv2.LUT(image, table)


def apply_clahe(image, clip_limit=2.0):
    """Improve local contrast while preserving colors."""
    if not 1.0 <= clip_limit <= 5.0:
        raise ValueError("CLAHE clip limit must be 1 to 5")

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
    """Reduce noise using Non-Local Means denoising."""
    if not 1 <= strength <= 30:
        raise ValueError("Denoising strength must be 1 to 30")

    return cv2.fastNlMeansDenoisingColored(
        image,
        None,
        float(strength),
        float(strength),
        7,
        21
    )


def sharpen_image(image, strength=1.0):
    """Sharpen edges using unsharp masking."""
    if not 0 <= strength <= 3:
        raise ValueError("Sharpening strength must be 0 to 3")

    blurred = cv2.GaussianBlur(image, (0, 0), 1.2)

    return cv2.addWeighted(
        image,
        1.0 + float(strength),
        blurred,
        -float(strength),
        0
    )


def advanced_enhance(
    image,
    method="combined",
    gamma=1.2,
    clip_limit=2.0,
    denoise_strength=10,
    sharpen_strength=1.0
):
    """Apply an individual or combined enhancement method."""

    if method == "original":
        return image.copy()

    if method == "gamma":
        return gamma_correction(image, gamma)

    if method == "clahe":
        return apply_clahe(image, clip_limit)

    if method == "denoise":
        return denoise_image(image, denoise_strength)

    if method == "sharpen":
        return sharpen_image(image, sharpen_strength)

    if method == "combined":
        result = denoise_image(image, denoise_strength)
        result = gamma_correction(result, gamma)
        result = apply_clahe(result, clip_limit)
        result = sharpen_image(result, sharpen_strength)
        return result

    raise ValueError("Unknown enhancement method")

