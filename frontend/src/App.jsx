import { useState, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, SlidersHorizontal, Download, Layers, Loader2, Sparkles, LayoutGrid, CheckCircle, Palette, Utensils, ShoppingBag, Wand2, Crop, Rocket, Store, FileText } from 'lucide-react';
import axios from 'axios';

// --- API SERVICES (Consolidated) ---
const API_BASE_URL = `http://${window.location.hostname}:8000/api/v1/images`;

const api = {
  upload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axios.post(`${API_BASE_URL}/upload`, formData);
    return res.data;
  },
  process: async (filename, config) => {
    const res = await axios.post(`${API_BASE_URL}/process/${filename}`, config);
    return res.data;
  },
  describe: async (filename) => {
    const res = await axios.post(`${API_BASE_URL}/describe/${filename}`);
    return res.data;
  },
  getDownloadUrl: (filename) => `${API_BASE_URL}/download/${filename}`
};

const TEMPLATES = [
  { id: 'transparent', icon: '🫥', label: 'Transparent', css: 'bg-[#1a1a1a] shadow-inner rounded-3xl' },
  { id: 'studio-white', icon: '🤍', label: 'Studio White', css: 'bg-white shadow-[0_20px_60px_rgba(0,0,0,0.1)] rounded-xl border border-gray-100' },
  { id: 'fine-dining', icon: '🍽️', label: 'Fine Dining', css: 'bg-gradient-to-b from-zinc-800 to-black border border-zinc-700 shadow-2xl rounded-full' },
  { id: 'sunset-pop', icon: '🌅', label: 'Sunset Pop', css: 'bg-gradient-to-br from-orange-400 via-rose-400 to-purple-500 rounded-full shadow-[0_20px_50px_rgba(244,63,94,0.4)] border-4 border-white' },
  { id: 'fresh-mint', icon: '🌿', label: 'Fresh Mint', css: 'bg-gradient-to-t from-emerald-100 to-teal-50 rounded-3xl border border-emerald-200 shadow-xl' },
  { id: 'kraft-paper', icon: '🛍️', label: 'Kraft Market', css: 'bg-[#e4d0b6] border-dashed border-4 border-[#b5926c] rounded-lg shadow-md' },
  { id: 'cyberpunk', icon: '⚡', label: 'Neon Cyber', css: 'bg-black border-2 border-fuchsia-500 shadow-[0_0_40px_rgba(217,70,239,0.5)] rounded-2xl' },
  { id: 'soft-pastel', icon: '🌸', label: 'Soft Pastel', css: 'bg-gradient-to-tr from-pink-100 to-fuchsia-100 rounded-[3rem] shadow-lg' },
];

const MARKETPLACES = [
  { id: 'none', label: 'Default' },
  { id: 'amazon', label: 'Amazon (1000px)' },
  { id: 'ebay', label: 'eBay (1600px)' },
  { id: 'shopify', label: 'Shopify (2048px)' },
];

function App() {
  const [images, setImages] = useState([]); // { file, preview, id, processed, status, description }
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTemplate, setActiveTemplate] = useState('transparent');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  
  // New Feature States
  const [aiEnhance, setAiEnhance] = useState(false);
  const [smartCrop, setSmartCrop] = useState(false);
  const [marketplaceTarget, setMarketplaceTarget] = useState('none');
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [viewMode, setViewMode] = useState('editor'); // 'editor' or 'gallery'
  
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    const startIndex = images.length;
    
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      processed: null,
      id: null,
      status: 'uploading',
      description: ''
    }));
    
    setImages(prev => [...prev, ...newImages]);
    setActiveIndex(startIndex);
    
    for (let i = 0; i < newImages.length; i++) {
       const globalIdx = startIndex + i;
       try {
         const res = await api.upload(newImages[i].file);
         setImages(prev => {
            const next = [...prev];
            next[globalIdx] = { ...next[globalIdx], id: res.filename, status: 'ready' };
            return next;
         });

       } catch (error) {
         setImages(prev => {
            const next = [...prev];
            next[globalIdx] = { ...next[globalIdx], status: 'error' };
            return next;
         });
       }
    }
  };

  const triggerProcessing = async (imageId, index) => {
      setImages(prev => {
         const next = [...prev];
         next[index] = { ...next[index], status: 'processing' };
         return next;
      });

      try {
         const config = { 
            remove_bg: true, 
            brightness: 1.0, 
            contrast: 1.0, 
            sharpness: 1.0, 
            background_color: null,
            ai_enhance: aiEnhance,
            smart_crop: smartCrop,
            marketplace_target: marketplaceTarget !== 'none' ? marketplaceTarget : null
         };
         
         const res = await api.process(imageId, config);
         
         setImages(prev => {
            const next = [...prev];
            next[index] = { ...next[index], status: 'done', processed: `http://${window.location.hostname}:8000${res.processed_url}` };
            return next;
         });
      } catch (error) {
         setImages(prev => {
            const next = [...prev];
            next[index] = { ...next[index], status: 'error' };
            return next;
         });
      }
  };

  const handleGenerateDescription = async () => {
    if (!activeImage || !activeImage.id || isGeneratingDesc) return;
    
    setIsGeneratingDesc(true);
    try {
        const res = await api.describe(activeImage.id);
        const desc = res.description;
        
        setImages(prev => {
            const next = [...prev];
            next[activeIndex] = { ...next[activeIndex], description: desc };
            return next;
        });
    } catch (error) {
        console.error("Failed to generate description", error);
    } finally {
        setIsGeneratingDesc(false);
    }
  };

  const processBatch = async () => {
    setBatchProcessing(true);
    setProcessedCount(0);
    
    const indicesToProcess = images
       .map((img, idx) => ({ img, idx }))
       .filter(({ img }) => img.status === 'ready')
       .map(({ idx }) => idx);
    
    for (const index of indicesToProcess) {
       await triggerProcessing(images[index].id, index);
       setProcessedCount(prev => prev + 1);
    }
    
    setBatchProcessing(false);
  };

  const activeImage = images[activeIndex];
  const templateConfig = TEMPLATES.find(t => t.id === activeTemplate);

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-indigo-500/30 overflow-hidden flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-white/10 px-8 py-4 flex items-center justify-between bg-black/40 backdrop-blur-xl shrink-0 z-50 transition-all">
        <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
               <ShoppingBag size={18} className="text-white drop-shadow-md" />
            </div>
          <h1 className="text-xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-neutral-400">
            Snap<span className="text-indigo-400 font-extrabold">-to-</span>Sell
          </h1>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
           <button onClick={() => { setViewMode('editor'); fileInputRef.current?.click(); }} className="bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 active:scale-95 px-5 py-2.5 rounded-full font-bold transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2">
              <Layers size={18} /> Batch Upload
           </button>
           <button 
                onClick={() => setViewMode(viewMode === 'editor' ? 'gallery' : 'editor')}
                className={`flex items-center gap-2 px-4 py-2 transition-all rounded-full ${viewMode === 'gallery' ? 'bg-white text-black font-bold' : 'text-neutral-400 hover:text-white'}`}
           >
              <LayoutGrid size={18} /> {viewMode === 'gallery' ? 'Back to Editor' : 'Gallery'}
           </button>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: Controls & Templates */}
        <aside className="w-80 border-r border-white/10 bg-neutral-900/50 backdrop-blur-md overflow-y-auto px-6 py-8 flex flex-col gap-8 custom-scrollbar shrink-0">
          
          {activeImage && activeImage.processed && (
             <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-5 mb-2 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                      <Download size={20} className="text-white" />
                   </div>
                   <div>
                      <h4 className="font-bold text-sm">Design Ready!</h4>
                      <p className="text-[10px] text-indigo-300 uppercase tracking-widest font-bold">Marketplace Optimized</p>
                   </div>
                </div>
                <a 
                   href={activeImage.processed} 
                   download={`design-${activeImage.id}`}
                   className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                   <Download size={18} /> Download Now
                </a>
             </div>
          )}

          {/* Smart Features */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                <Rocket size={14} /> Smart Features
            </h2>
            <div className="space-y-3">
                <button 
                    onClick={() => setAiEnhance(!aiEnhance)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${aiEnhance ? 'bg-indigo-500/20 border-indigo-500 text-indigo-200' : 'bg-neutral-800 border-white/5 text-neutral-400 hover:border-white/10'}`}
                >
                    <div className="flex items-center gap-3">
                        <Sparkles size={18} />
                        <span className="text-sm font-semibold">AI Boost</span>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${aiEnhance ? 'bg-indigo-500' : 'bg-neutral-700'}`}>
                        <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${aiEnhance ? 'left-5' : 'left-1'}`}></div>
                    </div>
                </button>
                
                <button 
                    onClick={() => setSmartCrop(!smartCrop)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${smartCrop ? 'bg-indigo-500/20 border-indigo-500 text-indigo-200' : 'bg-neutral-800 border-white/5 text-neutral-400 hover:border-white/10'}`}
                >
                    <div className="flex items-center gap-3">
                        <Crop size={18} />
                        <span className="text-sm font-semibold">Smart Crop</span>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${smartCrop ? 'bg-indigo-500' : 'bg-neutral-700'}`}>
                        <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${smartCrop ? 'left-5' : 'left-1'}`}></div>
                    </div>
                </button>

                <div className="p-3 rounded-xl bg-neutral-800 border border-white/5 space-y-2">
                    <div className="flex items-center gap-3 text-neutral-400">
                        <Store size={18} />
                        <span className="text-sm font-semibold">Marketplace Export</span>
                    </div>
                    <select 
                        value={marketplaceTarget}
                        onChange={(e) => setMarketplaceTarget(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none"
                    >
                        {MARKETPLACES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                </div>
            </div>
          </div>

          <div className="h-px bg-white/5"></div>

          <div>
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Palette size={14} /> Instant Themes
            </h2>
            <div className="grid grid-cols-2 gap-3">
                {TEMPLATES.map(tmp => (
                    <button 
                        key={tmp.id}
                        onClick={() => setActiveTemplate(tmp.id)}
                        className={`
                            flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-300
                            ${activeTemplate === tmp.id 
                                ? 'bg-indigo-500/10 border-2 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)] scale-[1.02]' 
                                : 'bg-neutral-800 border-2 border-transparent hover:border-white/20 hover:bg-neutral-700/50'}
                        `}
                    >
                        <span className="text-2xl mb-2 drop-shadow-md">{tmp.icon}</span>
                        <span className="text-xs font-semibold text-center leading-tight">{tmp.label}</span>
                    </button>
                ))}
            </div>
          </div>

        </aside>

        {/* Center Canvas Area */}
        <div className="flex-1 flex flex-col relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
            
            {/* Gallery Strip Header with Batch Controls */}
            {images.length > 0 && (
                <div className="px-8 py-4 bg-black/40 backdrop-blur-md border-b border-white/5 space-y-4 shrink-0">
                    {/* Batch Progress Bar */}
                    {batchProcessing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
                                    <Loader2 size={16} className="animate-spin" />
                                    Batch Processing
                                </span>
                                <span className="text-xs text-neutral-400">{processedCount} / {images.filter(img => img.status === 'ready').length}</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-neutral-700 overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300"
                                    style={{ width: `${images.filter(img => img.status === 'ready').length > 0 ? (processedCount / images.filter(img => img.status === 'ready').length) * 100 : 0}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    {/* Batch Control Buttons */}
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/50 text-sm font-semibold text-indigo-300 hover:text-indigo-200 transition-all hover:scale-105 active:scale-95"
                        >
                            <UploadCloud size={16} /> Add More Photos
                        </button>
                        
                        {images.filter(img => img.status === 'ready').length > 0 && (
                            <button 
                                onClick={processBatch}
                                disabled={batchProcessing}
                                className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/20"
                            >
                                <Sparkles size={16} /> Process All ({images.filter(img => img.status === 'ready').length})
                            </button>
                        )}
                        
                        <div className="flex-1"></div>
                        <span className="text-xs text-neutral-500">
                            {images.length} image{images.length !== 1 ? 's' : ''} • {images.filter(img => img.status === 'done').length} done
                        </span>
                    </div>
                    
                    {/* Image Gallery Thumbnails */}
                    <div className="flex gap-4 overflow-x-auto custom-scrollbar">
                        {images.map((img, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => setActiveIndex(idx)}
                                className={`
                                    min-w-[80px] h-[80px] rounded-xl overflow-hidden cursor-pointer relative transition-all duration-300 
                                    ${activeIndex === idx ? 'border-2 border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.4)] scale-105' : 'border border-white/10 hover:border-white/30 opacity-60 hover:opacity-100'}
                                `}
                            >
                                <img src={img.processed || img.preview} className="w-full h-full object-cover bg-neutral-800" />
                                {img.status === 'processing' && <div className="absolute inset-0 bg-indigo-900/60 flex items-center justify-center backdrop-blur-[2px]"><Loader2 className="animate-spin text-white w-5 h-5"/></div>}
                                {img.status === 'done' && <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5 shadow-md"><CheckCircle className="text-white w-3 h-3"/></div>}
                            </div>
                        ))}
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="min-w-[80px] h-[80px] border-2 border-dashed border-white/20 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all hover:scale-105"
                        >
                            <UploadCloud size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* Main Editor View */}
            <div className="flex-1 flex items-center justify-center p-8 relative overflow-hidden">
                {!activeImage ? (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full max-w-xl aspect-[16/10] rounded-3xl border-2 border-dashed border-indigo-500/30 hover:border-indigo-400 bg-neutral-900/50 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_50px_rgba(99,102,241,0.1)] group"
                    >
                        <div className="p-6 rounded-3xl bg-indigo-500/10 mb-6 group-hover:bg-indigo-500/20 transition-colors">
                            <ImageIcon size={48} className="text-indigo-400 drop-shadow-lg" />
                        </div>
                        <h3 className="text-2xl font-bold mb-2 text-center px-4">Single Product Upload</h3>
                        <p className="text-neutral-400 text-sm max-w-xs text-center border-b border-white/5 pb-4 mb-4">Click to upload a single item and apply professional marketplace themes instantly.</p>
                        <div className="flex items-center gap-4 text-neutral-500 text-xs">
                           <span className="flex items-center gap-1"><CheckCircle size={14} className="text-green-500" /> Auto BG Removal</span>
                           <span className="flex items-center gap-1"><CheckCircle size={14} className="text-green-500" /> Studio Templates</span>
                        </div>
                    </div>
                ) : viewMode === 'gallery' ? (
                    <div className="w-full h-full overflow-y-auto custom-scrollbar p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                            {images.map((img, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => { setActiveIndex(idx); setViewMode('editor'); }}
                                    className="group relative aspect-square rounded-3xl overflow-hidden bg-neutral-900 border border-white/10 hover:border-indigo-500/50 transition-all cursor-pointer hover:scale-[1.02] shadow-xl hover:shadow-indigo-500/10"
                                >
                                    <div className={`absolute inset-0 ${templateConfig.css} opacity-40 group-hover:opacity-100 transition-opacity`}></div>
                                    <img 
                                        src={img.processed || img.preview} 
                                        className="absolute inset-0 w-full h-full object-contain p-4 drop-shadow-2xl z-10" 
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 flex flex-col justify-end p-4">
                                        <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">{img.status}</p>
                                        <h4 className="text-sm font-bold truncate">{img.file.name}</h4>
                                    </div>
                                    {img.status === 'done' && <CheckCircle size={20} className="absolute top-4 right-4 text-green-500 drop-shadow-md z-30" />}
                                </div>
                            ))}
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="aspect-square border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-3 text-neutral-500 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all"
                            >
                                <UploadCloud size={32} />
                                <span className="text-sm font-bold">Add More</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full h-full flex flex-col lg:flex-row gap-8">
                        {/* Image Preview Canvas */}
                        <div className={`relative flex-1 flex flex-col items-center justify-center transition-all duration-700 max-h-[80vh]`}>
                            <div className={`relative w-full h-full flex items-center justify-center ${templateConfig.css} transition-all duration-700 ease-in-out`}>
                                {activeImage.status === 'processing' || activeImage.status === 'uploading' ? (
                                    <div className="flex flex-col items-center space-y-6">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-50 animate-pulse rounded-full"></div>
                                            <Sparkles size={64} className="animate-spin-slow text-white drop-shadow-2xl relative z-10" />
                                        </div>
                                        <h2 className="text-xl font-bold animate-pulse text-white drop-shadow-md">
                                            {activeImage.status === 'uploading' ? 'Uploading...' : 'Extracting magic...'}
                                        </h2>
                                    </div>
                                ) : activeImage.processed ? (
                                    <img 
                                        src={activeImage.processed} 
                                        alt="Processed" 
                                        className="max-w-[80%] max-h-[80%] object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)] transition-all duration-500 hover:scale-105 hover:-translate-y-2 cursor-pointer z-10" 
                                    />
                                ) : (
                                    <div className="relative group w-full h-full flex items-center justify-center">
                                        <img 
                                            src={activeImage.preview} 
                                            alt="Original" 
                                            className="max-w-full max-h-[90%] object-contain rounded-2xl shadow-xl opacity-80 z-10" 
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl z-20">
                                             <button 
                                                onClick={() => triggerProcessing(activeImage.id, activeIndex)}
                                                className="bg-white text-black px-6 py-3 rounded-full font-bold shadow-xl hover:scale-105 transition-all"
                                             >
                                                Apply AI Filters & Background
                                             </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {activeImage.processed && (
                                <div className="absolute top-6 right-6 flex gap-3 z-30">
                                    <button 
                                        onClick={() => triggerProcessing(activeImage.id, activeIndex)}
                                        className="bg-white/10 backdrop-blur-md text-white p-3 rounded-2xl border border-white/10 hover:bg-white/20 transition-all hover:scale-105"
                                        title="Re-apply AI Filters"
                                    >
                                        <Sparkles size={24} />
                                    </button>
                                    <a 
                                        href={activeImage.processed} 
                                        download={`presentation-${activeImage.id}`}
                                        className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold shadow-2xl hover:bg-indigo-500 transition-all hover:scale-105 flex items-center gap-2 border border-indigo-400/50"
                                    >
                                        <Download size={20} /> Download Pro Shot
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* Right Sidebar: AI Description */}
                        <aside className="w-full lg:w-72 bg-neutral-900/50 backdrop-blur-md rounded-3xl p-6 border border-white/5 flex flex-col gap-4 overflow-y-auto">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                                    <FileText size={14} /> Description
                                </h2>
                                <button 
                                    onClick={handleGenerateDescription}
                                    disabled={isGeneratingDesc || activeImage.status !== 'ready' && activeImage.status !== 'done'}
                                    className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Auto-Generate Description"
                                >
                                    {isGeneratingDesc ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                </button>
                            </div>

                            <textarea 
                                value={activeImage.description}
                                onChange={(e) => {
                                    const next = [...images];
                                    next[activeIndex].description = e.target.value;
                                    setImages(next);
                                }}
                                placeholder="Click the magic wand to generate a description..."
                                className="flex-1 w-full bg-neutral-950 border border-white/5 rounded-xl p-4 text-sm text-neutral-300 focus:border-indigo-500 outline-none resize-none custom-scrollbar min-h-[200px]"
                            />
                            
                            <div className="space-y-2">
                                <p className="text-[10px] text-neutral-500 uppercase font-black">AI Suggestions</p>
                                <div className="flex flex-wrap gap-2 text-[10px]">
                                    <span className="px-2 py-1 bg-white/5 rounded-md text-neutral-400">#HighQuality</span>
                                    <span className="px-2 py-1 bg-white/5 rounded-md text-neutral-400">#Professional</span>
                                    <span className="px-2 py-1 bg-white/5 rounded-md text-neutral-400">#EcommerceReady</span>
                                </div>
                            </div>
                        </aside>
                    </div>
                )}
            </div>
            
            <input 
                type="file" 
                multiple
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*" 
            />
        </div>

      </main>
    </div>
  );
}

export default App;
