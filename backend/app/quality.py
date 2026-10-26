
import cv2
import numpy as np


def calculate_brightness(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return round(float(np.mean(gray)), 2)


def calculate_contrast(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return round(float(np.std(gray)), 2)


def calculate_blur_score(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    return round(float(laplacian.var()), 2)


def calculate_histogram(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    histogram = cv2.calcHist(
        [gray], [0], None, [256], [0, 256]
    )

    return histogram.flatten().astype(int).tolist()


def calculate_psnr(reference, processed):
    if reference.shape != processed.shape:
        raise ValueError("Images must have the same dimensions")

    diff = reference.astype(np.float64) - processed.astype(np.float64)
    mse = np.mean(diff ** 2)

    if mse == 0:
        return None  # Identical images: infinite PSNR

    psnr = 10 * np.log10((255.0 ** 2) / mse)
    return round(float(psnr), 2)


def calculate_ssim(reference, processed):
    from skimage.metrics import structural_similarity

    if reference.shape != processed.shape:
        raise ValueError("Images must have the same dimensions")

    ref_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    proc_gray = cv2.cvtColor(processed, cv2.COLOR_BGR2GRAY)

    if min(ref_gray.shape) < 7:
        raise ValueError("Images must be at least 7x7 pixels")

    score = structural_similarity(ref_gray, proc_gray)
    return round(float(score), 4)


def analyze_image(image):
    return {
        "brightness": calculate_brightness(image),
        "contrast": calculate_contrast(image),
        "blur_score": calculate_blur_score(image),
        "histogram": calculate_histogram(image)
    }


def compare_quality(original, enhanced):
    if original.shape != enhanced.shape:
        raise ValueError(
            "Images must have the same dimensions for comparison"
        )

    return {
        "original": analyze_image(original),
        "enhanced": analyze_image(enhanced),
        "comparison": {
            "brightness_change": round(
                calculate_brightness(enhanced)
                - calculate_brightness(original), 2
            ),
            "contrast_change": round(
                calculate_contrast(enhanced)
                - calculate_contrast(original), 2
            ),
            "blur_score_change": round(
                calculate_blur_score(enhanced)
                - calculate_blur_score(original), 2
            ),
            "psnr": calculate_psnr(original, enhanced),
            "ssim": calculate_ssim(original, enhanced)
        }
    }
