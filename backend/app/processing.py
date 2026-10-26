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
