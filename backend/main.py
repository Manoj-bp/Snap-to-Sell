import os
import uuid
import shutil
import time
import asyncio
from typing import List, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from PIL import Image, ImageEnhance, ImageColor
import numpy as np
import cv2
from rembg import remove

# --- CONFIG & SETUP ---
TEMP_DIR = "temp_storage"
os.makedirs(TEMP_DIR, exist_ok=True)
MAX_AGE_SECONDS = 24 * 60 * 60 # 24 hours

MARKETPLACE_SPECS = {
    "amazon": {"size": (1000, 1000), "padding": 0.85, "bg": (255, 255, 255)},
    "ebay": {"size": (1600, 1600), "padding": 0.90, "bg": (255, 255, 255)},
    "shopify": {"size": (2048, 2048), "padding": 0.80, "bg": (255, 255, 255)},
}

# --- MODELS ---
class ProcessConfig(BaseModel):
    remove_bg: bool = True
    brightness: float = 1.0
    contrast: float = 1.0
    sharpness: float = 1.0
    background_color: Optional[str] = None
    smart_crop: bool = False
    ai_enhance: bool = False
    marketplace_target: Optional[str] = None

# --- CORE SERVICES ---

def smart_crop_image(image_path: str, output_path: str, padding_percent: float = 0.05):
    try:
        img = Image.open(image_path).convert('RGBA')
        np_img = np.array(img)
        alpha = np_img[:, :, 3]
        
        # Heuristic 1: If we have an alpha mask (post-BG removal), use it with thresholding 
        # to ignore semi-transparent artifacts.
        coords = np.column_stack(np.where(alpha > 30))
        
        # Heuristic 2: If the image is mostly opaque (original photo), use Canny edge detection 
        # to find the most likely subject area.
        if coords.size == 0 or (coords.max(axis=0)[0] - coords.min(axis=0)[0]) > img.height * 0.95:
            # Fallback for original images - detect high-contrast areas (likely the product)
            gray = cv2.cvtColor(cv2.cvtColor(np_img[:, :, 0:3], cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            edged = cv2.Canny(blurred, 30, 150)
            coords = np.column_stack(np.where(edged > 0))

        if coords.size == 0: return image_path
        
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        
        padding = int(max(x_max - x_min, y_max - y_min) * padding_percent)
        left, top = max(0, x_min - padding), max(0, y_min - padding)
        right, bottom = min(img.width, x_max + padding), min(img.height, y_max + padding)
        
        img.crop((left, top, right, bottom)).save(output_path, "PNG")
        return output_path
    except: return image_path

def ai_boost(image_path: str, output_path: str):
    try:
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None or img.shape[2] != 4: return image_path
        bgr, alpha = img[:, :, 0:3], img[:, :, 3]
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
        enhanced_bgr = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
        sharpened = cv2.addWeighted(enhanced_bgr, 1.5, cv2.GaussianBlur(enhanced_bgr, (0, 0), 2.0), -0.5, 0)
        cv2.imwrite(output_path, cv2.merge((sharpened[:, :, 0], sharpened[:, :, 1], sharpened[:, :, 2], alpha)))
        return output_path
    except: return image_path

def apply_marketplace_template(image_path: str, output_path: str, target: str):
    try:
        spec = MARKETPLACE_SPECS.get(target.lower())
        if not spec: return image_path
        img = Image.open(image_path).convert('RGBA')
        t_w, t_h = spec["size"]
        max_dim = int(min(t_w, t_h) * spec["padding"])
        ratio = min(max_dim / img.width, max_dim / img.height)
        new_size = (int(img.width * ratio), int(img.height * ratio))
        rescaled = img.resize(new_size, Image.Resampling.LANCZOS)
        final_img = Image.new("RGB", spec["size"], spec["bg"])
        final_img.paste(rescaled, ((t_w - new_size[0]) // 2, (t_h - new_size[1]) // 2), rescaled)
        final_img.save(output_path, "JPEG", quality=95)
        return output_path
    except: return image_path

def run_image_pipeline(input_filename: str, output_filename: str, config: ProcessConfig):
    input_path = os.path.join(TEMP_DIR, input_filename)
    temp_path = os.path.join(TEMP_DIR, f"temp_{output_filename}.png")
    final_path = os.path.join(TEMP_DIR, output_filename)
    curr = input_path
    try:
        if config.remove_bg: curr = remove_background(curr, temp_path)
        if config.smart_crop: curr = smart_crop_image(curr, temp_path)
        if config.ai_enhance: curr = ai_boost(curr, temp_path)
        
        # Apply standard enhancements
        img = Image.open(curr).convert('RGBA')
        if config.brightness != 1.0: img = ImageEnhance.Brightness(img).enhance(config.brightness)
        if config.contrast != 1.0: img = ImageEnhance.Contrast(img).enhance(config.contrast)
        if config.sharpness != 1.0: img = ImageEnhance.Sharpness(img).enhance(config.sharpness)
        img.save(temp_path, "PNG")
        curr = temp_path

        if config.marketplace_target:
            apply_marketplace_template(curr, final_path, config.marketplace_target)
        elif config.background_color:
            bg_color = ImageColor.getcolor(config.background_color, "RGB")
            bg = Image.new("RGB", img.size, bg_color)
            bg.paste(img, mask=img.split()[3])
            bg.save(final_path, "JPEG", quality=95)
        else:
            shutil.copyfile(curr, final_path)
    finally:
        if os.path.exists(temp_path) and temp_path != final_path: os.remove(temp_path)

def remove_background(input_path: str, output_path: str):
    try:
        print(f"DEBUG: Starting background removal for {input_path}")
        input_image = Image.open(input_path)
        
        # rembg.remove handles the model loading automatically
        output_image = remove(input_image)
        
        if output_image is None:
            print(f"ERROR: rembg returned None for {input_path}")
            return input_path
            
        output_image.save(output_path, "PNG")
        print(f"DEBUG: Background removed successfully: {output_path}")
        return output_path
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR in remove_background: {str(e)}")
        # If it fails, we still want to move on but without transparency
        return input_path

async def cleanup_loop():
    while True:
        try:
            now = time.time()
            for f in os.listdir(TEMP_DIR):
                path = os.path.join(TEMP_DIR, f)
                if os.path.isfile(path) and now - os.path.getmtime(path) > MAX_AGE_SECONDS:
                    os.remove(path)
        except: pass
        await asyncio.sleep(3600)

# --- API ROUTES ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()

app = FastAPI(title="Snap-to-Sell API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/v1/health")
async def health_check():
    """Checks if AI models are loaded and working."""
    try:
        # Test rembg with a tiny 1x1 image
        test_img = Image.new('RGB', (10, 10), color='red')
        res = remove(test_img)
        return {
            "status": "healthy",
            "ai_models": "loaded",
            "temp_storage": "accessible" if os.path.exists(TEMP_DIR) else "missing"
        }
    except Exception as e:
        return {
            "status": "degraded",
            "error": str(e),
            "tip": "This often means the AI models are still downloading (~100MB). Wait 1-2 minutes and try again."
        }

@app.post("/api/v1/images/upload")
async def upload_image(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    filename = f"{file_id}{os.path.splitext(file.filename or '')[1] or '.jpg'}"
    with open(os.path.join(TEMP_DIR, filename), "wb") as b: shutil.copyfileobj(file.file, b)
    return {"image_id": file_id, "filename": filename, "url": f"/api/v1/images/download/{filename}"}

@app.post("/api/v1/images/process/{filename}")
async def process_image(filename: str, config: ProcessConfig):
    job_uuid = str(uuid.uuid4())
    ext = ".jpg" if config.background_color or config.marketplace_target else ".png"
    out_file = f"proc_{job_uuid}{ext}"
    run_image_pipeline(filename, out_file, config)
    return {"processed_url": f"/api/v1/images/download/{out_file}"}

@app.post("/api/v1/images/describe/{filename}")
async def describe_image(filename: str):
    return {"description": "Professional Studio Shot\n\nOptimized for marketplace compliance with clean lighting and professional clarity."}

@app.get("/api/v1/images/download/{filename}")
async def download_image(filename: str):
    path = os.path.join(TEMP_DIR, filename)
    return FileResponse(path) if os.path.exists(path) else {"error": "Not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
