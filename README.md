# Snap-to-Sell (ProductPop)
### AI-Powered Marketplace Photography Suite

Transform simple product photos into professional, marketplace-ready imagery for Amazon, eBay, and Shopify in seconds.

## ✨ Key Features

### 1. AI Smart Processing
- **AI Background Removal**: Instant, professional cutouts using deep learning (rembg).
- **AI Boost**: Professional-grade sharpening and contrast enhancement (OpenCV CLAHE).
- **Smart Crop**: Automatic product-centric cropping with intelligent padding.

### 2. Marketplace Export Engine
One-click formatting for major platforms:
- **Amazon**: 1000px square, compliant white background.
- **eBay**: 1600px square, high-fidelity resolution.
- **Shopify**: 2048px square, optimized for fashion and jewelry.

### 3. AI Content & Workflow
- **Auto Description**: Professional product listing drafts using AI Vision.
- **Grid Gallery**: Manage and batch process multiple products in a sleek, modern UI.
- **Real-time Theming**: Instantly preview your products in Studio, Sunset, or Cyber environments.

## 🛠 Technical Stack

### Backend (Python/FastAPI)
- **FastAPI**: High-performance asynchronous API.
- **OpenCV**: Advanced image processing (CLAHE, Unsharp Masking).
- **rembg**: AI-powered background extraction.
- **NumPy & PIL**: Core image manipulation and matrix operations.

### Frontend (React/Vite)
- **React 18**: Component-based UI with modern state management.
- **Tailwind CSS**: Premium glassmorphism design system.
- **Lucide-Icons**: Sleek, consistent iconography.
- **Axios**: Efficient backend communication.

## 🚀 Getting Started

### 1. Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---
*Created for professional marketplace sellers who need studio-quality results without the studio cost.*
