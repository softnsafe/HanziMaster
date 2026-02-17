
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from './Button';
import { Student, StoreItem } from '../types';
import { STICKER_CATALOG, convertDriveLink } from '../utils/stickerData';
import { sheetService } from '../services/sheetService';
import { generateSticker } from '../services/geminiService';

interface StickerStoreProps {
  student: Student;
  onUpdateStudent: (updates: Partial<Student>) => void;
  onClose: () => void;
  initialTab?: 'CATALOG' | 'AI_LAB' | 'COLLECTION';
}

// Client-side resizing optimized for Google Drive storage (v3.0)
const resizeImage = (base64Str: string, maxWidth = 256): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`;
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Keep aspect ratio
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Use PNG to preserve transparency and better quality
          resolve(canvas.toDataURL('image/png', 0.8));
      } else {
          resolve(base64Str); // Fallback
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const StickerStore: React.FC<StickerStoreProps> = ({ student, onUpdateStudent, onClose, initialTab = 'CATALOG' }) => {
  // AI_LAB option preserved in type for compatibility, but hidden in UI
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'AI_LAB' | 'COLLECTION'>(initialTab === 'AI_LAB' ? 'CATALOG' : initialTab);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loadingStore, setLoadingStore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [selectedCategory, setSelectedCategory] = useState<string>('Misc.');
  
  // AI Lab State
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [aiCost] = useState(100);

  // Preview State
  const [previewItem, setPreviewItem] = useState<any | null>(null);

  useEffect(() => {
      if (activeTab === 'CATALOG') {
          loadStore();
      }
  }, [activeTab]);

  const loadStore = async () => {
      setLoadingStore(true);
      const items = await sheetService.getStoreItems();
      setStoreItems(items);
      setLoadingStore(false);
  };

  // Derive categories dynamically from loaded items
  const dynamicCategories = useMemo(() => {
      if (storeItems.length === 0) return [];
      const cats = new Set(storeItems.map(i => i.category || 'Misc.'));
      return Array.from(cats).sort();
  }, [storeItems]);

  // Ensure selected category is valid when items load
  useEffect(() => {
      if (dynamicCategories.length > 0 && !dynamicCategories.includes(selectedCategory)) {
          setSelectedCategory(dynamicCategories[0]);
      }
  }, [dynamicCategories, selectedCategory]);

  const handleRefreshCollection = async () => {
      setIsRefreshing(true);
      setErrorMsg('');
      try {
          // Force refresh data from sheet (true = skip cache)
          const allData = await sheetService.getAllStudentProgress(true);
          const freshProfile = allData.find(s => s.id === student.id);
          
          if (freshProfile) {
              onUpdateStudent({
                  points: freshProfile.points,
                  stickers: freshProfile.stickers,
                  customStickers: freshProfile.customStickers
              });
          } else {
              setErrorMsg("Could not sync profile.");
          }
      } catch (e) {
          console.error("Refresh failed", e);
          setErrorMsg("Sync failed. Check connection.");
      } finally {
          setIsRefreshing(false);
      }
  };

  const handlePurchase = async (stickerId: string, cost: number) => {
      if (student.points < cost) return;
      
      setPurchasingId(stickerId);
      setErrorMsg('');
      
      const result = await sheetService.purchaseSticker(student.id, stickerId, cost);
      
      setPurchasingId(null);
      if (result.success && result.points !== undefined && result.stickers) {
          onUpdateStudent({ points: result.points, stickers: result.stickers });
      } else {
          // Display the backend error message if available, otherwise generic
          setErrorMsg(result.message || "Purchase failed. Try again.");
      }
  };

  const handleGenerate = async () => {
      if (!prompt.trim()) return;
      if (student.points < aiCost) {
          setErrorMsg("Not enough points!");
          return;
      }
      
      setIsGenerating(true);
      setErrorMsg('');
      setGeneratedImage(null);
      
      const imageBase64 = await generateSticker(prompt);
      
      if (imageBase64) {
          setGeneratedImage(imageBase64);
      } else {
          setErrorMsg("Failed to generate. Please try a different prompt.");
      }
      setIsGenerating(false);
  };

  const handleSaveCustomSticker = async () => {
      if (!generatedImage) return;
      
      setIsGenerating(true); // Re-use loading state
      
      // Compress before sending
      const compressedImage = await resizeImage(generatedImage, 256); 
      
      const result = await sheetService.saveCustomSticker(student.id, compressedImage, prompt, aiCost);
      
      if (result.success && result.points !== undefined && result.sticker) {
          const newCustomList = [...(student.customStickers || []), {
              id: result.sticker.id,
              studentId: student.id,
              dataUrl: result.sticker.dataUrl,
              prompt: result.sticker.prompt
          }];
          const newStickersList = [...(student.stickers || []), result.sticker.id];
          
          onUpdateStudent({ 
              points: result.points, 
              stickers: newStickersList,
              customStickers: newCustomList
          });
          
          // Reset
          setGeneratedImage(null);
          setPrompt('');
          setActiveTab('COLLECTION'); // Go to collection to see result
      } else {
          // Check for detailed message from backend (e.g., "Drive Save Failed: ...")
          const msg = (result as any).message;
          setErrorMsg(msg || "Failed to save sticker to cloud.");
      }
      setIsGenerating(false);
  };

  const ownedIds = student.stickers || [];
  
  // Categorize stickers
  // We will treat the Backend Store Items as the main catalog now.
  // STICKER_CATALOG (legacy) is only used for backward compatibility if store is empty or for fallback.
  
  const myStandardStickers = [...storeItems, ...STICKER_CATALOG].filter(s => ownedIds.includes(s.id));
  
  // De-duplicate standard stickers based on ID
  const uniqueOwnedStandard = Array.from(new Set(myStandardStickers.map(s => s.id)))
      .map(id => myStandardStickers.find(s => s.id === id));

  const myCustomStickers = student.customStickers || [];

  return (
    <div className="fixed inset-0 bg-slate-100/50 backdrop-blur-md z-50 flex flex-col animate-fade-in">
        <div className="max-w-4xl w-full mx-auto h-full flex flex-col bg-white shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={onClose}>← Back</Button>
                    <div>
                        <h2 className="text-2xl font-extrabold text-slate-800">StickerStar Store</h2>
                        <p className="text-slate-500 font-medium text-sm">Spend your stars on cool stickers!</p>
                    </div>
                </div>
                <div className="bg-amber-100 px-4 py-2 rounded-2xl border-2 border-amber-200 text-amber-700 font-black flex items-center gap-2">
                    <span className="text-xl">⭐</span>
                    <span className="text-xl">{student.points}</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100">
                <button 
                    onClick={() => setActiveTab('CATALOG')}
                    className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'CATALOG' ? 'text-indigo-600 border-b-4 border-indigo-500' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    🛍️ Catalog
                </button>
                {/* AI Lab Disabled */}
                <button 
                    onClick={() => setActiveTab('COLLECTION')}
                    className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'COLLECTION' ? 'text-emerald-600 border-b-4 border-emerald-500' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    💖 My Collection
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                {errorMsg && <div className="mb-4 p-3 bg-rose-100 text-rose-700 rounded-xl font-bold text-center">{errorMsg}</div>}
                
                {activeTab === 'CATALOG' && (
                    <>
                        {loadingStore ? (
                            <div className="text-center py-20 text-slate-400">Loading Store...</div>
                        ) : (
                            <div>
                                <h3 className="text-slate-400 font-black uppercase text-xs tracking-wider mb-3">Today's Specials</h3>
                                {storeItems.length === 0 ? (
                                    <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
                                        <p className="text-slate-400 font-bold">The teacher hasn't added any stickers yet!</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Dynamic Category Filter */}
                                        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 no-scrollbar">
                                            {dynamicCategories.map(cat => (
                                                 <button 
                                                    key={cat}
                                                    onClick={() => setSelectedCategory(cat)}
                                                    className={`whitespace-nowrap px-4 py-2 rounded-full font-bold text-xs transition-all ${selectedCategory === cat ? 'bg-indigo-500 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>

                                        {(() => {
                                            const filteredItems = storeItems.filter(item => (item.category || 'Misc.') === selectedCategory);
                                            
                                            if (filteredItems.length === 0) {
                                                return (
                                                    <div className="py-12 text-center opacity-60">
                                                        <div className="text-4xl mb-2 grayscale">📂</div>
                                                        <p className="text-slate-400 font-bold text-sm">No stickers in "{selectedCategory}" yet.</p>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    {filteredItems.map(item => {
                                                        const isOwned = ownedIds.includes(item.id);
                                                        const canAfford = student.points >= item.cost;
                                                        // Apply conversion here to ensure image loads
                                                        const displayImage = convertDriveLink(item.imageUrl);

                                                        return (
                                                            <div key={item.id} className={`p-4 rounded-2xl border-2 flex flex-col items-center transition-all ${isOwned ? 'bg-emerald-50 border-emerald-200' : 'bg-[#fff5eb] border-orange-100 hover:border-orange-300 shadow-sm'}`}>
                                                                <div 
                                                                    className="aspect-square w-full mb-3 rounded-xl overflow-hidden bg-white relative cursor-zoom-in group"
                                                                    onClick={() => setPreviewItem(item)}
                                                                >
                                                                    {/* 
                                                                        VISUAL DISTINCTION: 
                                                                        If not owned, apply grayscale and lower opacity to make it look "locked".
                                                                        Use object-contain to prevent cropping of irregular shaped stickers.
                                                                    */}
                                                                    <img 
                                                                        src={displayImage} 
                                                                        alt={item.name} 
                                                                        className={`w-full h-full object-contain transition-transform group-hover:scale-110 ${!isOwned ? 'grayscale opacity-60' : ''}`} 
                                                                    />
                                                                    
                                                                    {!isOwned && (
                                                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                            <span className="text-4xl drop-shadow-md">🔒</span>
                                                                        </div>
                                                                    )}

                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                                        <span className="text-white opacity-0 group-hover:opacity-100 font-bold text-2xl drop-shadow-md">🔍</span>
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Updated Text Container: Allow wrapping and ensure centering */}
                                                                <div className="font-bold text-slate-700 text-sm text-center leading-tight line-clamp-2 min-h-[2.5em] flex items-center justify-center w-full">
                                                                    {item.name}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 font-bold mb-2">{item.category || 'Misc.'}</div>
                                                                
                                                                {isOwned ? (
                                                                    <div className="mt-2 px-3 py-1 bg-emerald-200 text-emerald-800 rounded-full text-xs font-bold uppercase flex items-center gap-1">
                                                                        <span>✓</span> Owned
                                                                    </div>
                                                                ) : (
                                                                    <button 
                                                                        onClick={() => handlePurchase(item.id, item.cost)}
                                                                        disabled={!canAfford || purchasingId === item.id}
                                                                        className={`mt-2 w-full py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all ${canAfford ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-[0_3px_0_#4338ca] active:shadow-none active:translate-y-1' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                                                    >
                                                                        {purchasingId === item.id ? (
                                                                            <span className="animate-spin">⏳</span>
                                                                        ) : (
                                                                            <>
                                                                                <span>⭐</span> {item.cost}
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'COLLECTION' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-slate-400 font-black uppercase text-xs tracking-wider">Your Stash</h3>
                            <button 
                                onClick={handleRefreshCollection}
                                disabled={isRefreshing}
                                className="text-xs font-bold text-indigo-500 hover:bg-indigo-50 px-3 py-1 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                                {isRefreshing ? <span className="animate-spin">🔄</span> : '🔄'} Sync Collection
                            </button>
                        </div>

                        {uniqueOwnedStandard.length === 0 && myCustomStickers.length === 0 ? (
                            <div className="text-center py-20 opacity-50">
                                <div className="text-6xl mb-4 grayscale">🛍️</div>
                                <h3 className="text-xl font-bold text-slate-500">Your collection is empty</h3>
                                <p className="text-slate-400">Go to the Catalog to get some stickers!</p>
                            </div>
                        ) : (
                            <>
                                {uniqueOwnedStandard.length > 0 && (
                                    <div>
                                        <h4 className="text-slate-400 font-bold text-[10px] uppercase mb-3">Store Stickers</h4>
                                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                                            {uniqueOwnedStandard.map((s, idx) => {
                                                if (!s) return null;
                                                const displayImage = convertDriveLink(s.imageUrl || '');
                                                return (
                                                    <div 
                                                        key={`${s.id}-${idx}`} 
                                                        className="aspect-square bg-white rounded-2xl flex flex-col items-center justify-center border-2 border-slate-100 shadow-sm hover:scale-105 transition-transform overflow-hidden relative cursor-zoom-in group" 
                                                        title={s.name}
                                                        onClick={() => setPreviewItem(s)}
                                                    >
                                                        {/* Use object-contain to show full sticker in collection view, add padding for breathing room */}
                                                        {s.imageUrl ? <img src={displayImage} className="w-full h-full object-contain p-2" alt={s.name} /> : <div className="text-5xl drop-shadow-sm">{(s as any).emoji}</div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {myCustomStickers.length > 0 && (
                                    <div>
                                        <h4 className="text-purple-400 font-bold text-[10px] uppercase mb-3">My AI Creations / Gifts</h4>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                                            {myCustomStickers.map(s => (
                                                <div 
                                                    key={s.id} 
                                                    className="aspect-square bg-purple-50 rounded-2xl border-2 border-purple-100 overflow-hidden relative group hover:scale-105 transition-transform shadow-sm cursor-zoom-in"
                                                    onClick={() => setPreviewItem(s)}
                                                >
                                                    {/* Use object-contain here to fix visibility issue for gifted stickers that end up here */}
                                                    <img src={s.dataUrl} alt={s.prompt} className="w-full h-full object-contain p-2" />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                                                        <span className="text-[10px] text-white font-bold leading-tight line-clamp-3">{s.prompt}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'AI_LAB' && (
                    <div className="max-w-lg mx-auto">
                        {!student.canCreateStickers ? (
                            <div className="bg-white rounded-[2rem] p-8 text-center shadow-lg border-2 border-slate-100">
                                <div className="text-8xl mb-4 grayscale opacity-50">🔒</div>
                                <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Access Locked</h3>
                                <p className="text-slate-500 font-bold mb-4">
                                    Only students with a Teacher's Pass can create AI stickers.
                                </p>
                                <p className="text-sm text-indigo-500 font-bold bg-indigo-50 inline-block px-4 py-2 rounded-lg">
                                    Do a good job to earn access!
                                </p>
                            </div>
                        ) : (
                            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-[2rem] p-8 text-white shadow-xl text-center mb-8">
                                <h3 className="text-2xl font-extrabold mb-2">Create Your Own Sticker</h3>
                                <p className="opacity-90 text-sm mb-6">Describe anything you want, and AI will make it for you!</p>
                                
                                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2 mb-4">
                                    <input 
                                        type="text" 
                                        placeholder="e.g., A surfing pizza" 
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        className="w-full bg-transparent text-white placeholder-white/50 font-bold text-center outline-none py-2"
                                        disabled={isGenerating}
                                    />
                                </div>

                                {!generatedImage ? (
                                    <button 
                                        onClick={handleGenerate}
                                        disabled={isGenerating || !prompt}
                                        className="w-full bg-white text-indigo-600 py-3 rounded-xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                                    >
                                        {isGenerating ? 'Magic in progress...' : `Generate (⭐ ${aiCost})`}
                                    </button>
                                ) : (
                                    <div className="space-y-4 animate-fade-in">
                                        <div className="bg-white rounded-xl p-4 inline-block shadow-lg">
                                            <img src={generatedImage} alt="Generated" className="w-32 h-32 object-contain" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={handleSaveCustomSticker}
                                                disabled={isGenerating}
                                                className="flex-1 bg-emerald-400 text-emerald-900 py-3 rounded-xl font-black hover:bg-emerald-300 transition-colors"
                                            >
                                                Buy & Save
                                            </button>
                                            <button 
                                                onClick={() => setGeneratedImage(null)}
                                                className="flex-1 bg-white/20 text-white py-3 rounded-xl font-bold hover:bg-white/30 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        <div className="text-center text-slate-400 text-xs font-bold mt-8">
                            <p>Note: AI Stickers cost more because they are unique!</p>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* PREVIEW MODAL */}
        {previewItem && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setPreviewItem(null)}>
                <div className="bg-white rounded-3xl p-6 max-w-sm w-full relative shadow-2xl flex flex-col items-center text-center animate-bounce-in" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setPreviewItem(null)} className="absolute top-4 right-4 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">✕</button>
                    
                    <h3 className="text-xl font-extrabold text-slate-800 mb-4">{previewItem.name || previewItem.prompt || 'Sticker Preview'}</h3>
                    
                    {(() => {
                        const isOwned = ownedIds.includes(previewItem.id) || !!previewItem.studentId; // Custom stickers are always owned by definition here
                        return (
                            <div className="w-64 h-64 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 overflow-hidden border-2 border-slate-100 p-2 relative">
                                {previewItem.imageUrl || previewItem.dataUrl ? (
                                    <img 
                                        src={convertDriveLink(previewItem.imageUrl || previewItem.dataUrl)} 
                                        alt="Preview" 
                                        className={`w-full h-full object-contain ${!isOwned ? 'grayscale opacity-60' : ''}`} 
                                    />
                                ) : (
                                    <div className="text-9xl drop-shadow-md">{(previewItem as any).emoji}</div>
                                )}
                                
                                {!isOwned && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="text-6xl drop-shadow-md">🔒</span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {previewItem.category && (
                        <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-500 uppercase tracking-wide">
                            {previewItem.category}
                        </span>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};
