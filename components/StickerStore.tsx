
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
  const myStandardStickers = [...storeItems, ...STICKER_CATALOG].filter(s => ownedIds.includes(s.id));
  const uniqueOwnedStandard = Array.from(new Set(myStandardStickers.map(s => s.id)))
      .map(id => myStandardStickers.find(s => s.id === id));
  
  const myCustomStickers = student.customStickers || [];
  // Separate Teacher Gifts from AI Creations
  const myAiStickers = myCustomStickers.filter(s => !s.id.startsWith('gift-'));
  const myGiftStickers = myCustomStickers.filter(s => s.id.startsWith('gift-'));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6 animate-fade-in bg-indigo-500/20 backdrop-blur-lg font-nunito">
        <div className="w-full max-w-5xl h-full md:h-[90vh] bg-[#f8fafc] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden relative border-4 border-white">
            
            {/* Header */}
            <div className="bg-white p-6 flex flex-col md:flex-row justify-between items-center gap-4 z-20 shadow-sm border-b border-slate-100 shrink-0 relative">
                <div className="flex items-center gap-4 w-full md:w-auto relative z-10">
                    <Button variant="ghost" onClick={onClose} className="shrink-0 aspect-square w-12 h-12 rounded-full bg-slate-50 hover:bg-slate-200 flex items-center justify-center p-0 text-slate-500">
                        <span className="text-2xl">✕</span>
                    </Button>
                    <div>
                        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Sticker Shop</h2>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-wider">Customize your profile</p>
                    </div>
                </div>
                
                <div className="bg-gradient-to-r from-amber-300 to-orange-400 px-6 py-2 rounded-full shadow-lg shadow-orange-100 text-white font-black flex items-center gap-3 transform hover:scale-105 transition-transform cursor-default select-none border-2 border-white/20">
                    <span className="text-2xl drop-shadow-sm">⭐</span>
                    <span className="text-3xl tracking-wide drop-shadow-sm">{student.points}</span>
                </div>

                {/* Decorative Background for Header */}
                <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-indigo-50/50 to-transparent pointer-events-none"></div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-6 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0 border-b border-slate-100">
                <div className="bg-slate-100 p-1.5 rounded-2xl flex font-bold text-slate-500 max-w-lg mx-auto">
                    <button 
                        onClick={() => setActiveTab('CATALOG')}
                        className={`flex-1 py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm ${activeTab === 'CATALOG' ? 'bg-white text-indigo-600 shadow-sm scale-[1.02] ring-1 ring-black/5' : 'hover:bg-slate-200/50 hover:text-slate-600'}`}
                    >
                        <span className="text-xl">🛍️</span> Catalog
                    </button>
                    <button 
                        onClick={() => setActiveTab('COLLECTION')}
                        className={`flex-1 py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm ${activeTab === 'COLLECTION' ? 'bg-white text-emerald-600 shadow-sm scale-[1.02] ring-1 ring-black/5' : 'hover:bg-slate-200/50 hover:text-slate-600'}`}
                    >
                        <span className="text-xl">🎒</span> My Stash
                    </button>
                </div>
            </div>

            {/* Main Content Area - Added generous bottom padding */}
            <div className="flex-1 overflow-y-auto px-6 pb-40 pt-6 scroll-smooth bg-slate-50/50">
                
                {errorMsg && (
                    <div className="mb-6 p-4 bg-rose-50 text-rose-600 rounded-2xl font-bold text-center border border-rose-100 animate-bounce-in shadow-sm">
                        {errorMsg}
                    </div>
                )}
                
                {activeTab === 'CATALOG' && (
                    <>
                        {loadingStore ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-50">
                                <div className="text-6xl animate-bounce mb-4">🏬</div>
                                <div className="font-black text-slate-400">Opening Store...</div>
                            </div>
                        ) : (
                            <div className="max-w-5xl mx-auto">
                                {storeItems.length === 0 ? (
                                    <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
                                        <div className="text-6xl mb-4 grayscale opacity-30">📦</div>
                                        <p className="text-slate-400 font-bold">The shelves are empty right now!</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Categories */}
                                        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar snap-x">
                                            {dynamicCategories.map(cat => (
                                                 <button 
                                                    key={cat}
                                                    onClick={() => setSelectedCategory(cat)}
                                                    className={`
                                                        whitespace-nowrap px-5 py-2.5 rounded-full font-bold text-sm transition-all border-2 snap-center
                                                        ${selectedCategory === cat 
                                                            ? 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-200' 
                                                            : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-500'
                                                        }
                                                    `}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>

                                        {(() => {
                                            const filteredItems = storeItems.filter(item => (item.category || 'Misc.') === selectedCategory);
                                            
                                            if (filteredItems.length === 0) {
                                                return (
                                                    <div className="py-20 text-center opacity-60">
                                                        <div className="text-6xl mb-4 grayscale opacity-30">🕸️</div>
                                                        <p className="text-slate-400 font-bold">Sold out in "{selectedCategory}".</p>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                                    {filteredItems.map(item => {
                                                        const isOwned = ownedIds.includes(item.id);
                                                        const canAfford = student.points >= item.cost;
                                                        const displayImage = convertDriveLink(item.imageUrl);

                                                        return (
                                                            <div key={item.id} className={`
                                                                relative bg-white rounded-[2rem] p-4 flex flex-col items-center transition-all duration-300 group
                                                                ${isOwned 
                                                                    ? 'border-4 border-emerald-100 shadow-none opacity-80' 
                                                                    : 'border-2 border-slate-100 hover:border-indigo-200 hover:shadow-xl hover:-translate-y-1'
                                                                }
                                                            `}>
                                                                <div 
                                                                    className="aspect-square w-full mb-3 rounded-2xl overflow-hidden bg-white relative cursor-pointer"
                                                                    onClick={() => setPreviewItem(item)}
                                                                >
                                                                    <img 
                                                                        src={displayImage} 
                                                                        alt={item.name} 
                                                                        className={`w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-110 
                                                                            ${!isOwned ? 'blur-[2px] grayscale opacity-60' : ''}`} 
                                                                    />
                                                                    
                                                                    {!isOwned && (
                                                                        <div className="absolute top-2 right-2 bg-slate-900/10 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center">
                                                                            <span className="text-sm">🔒</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                
                                                                <div className="text-center w-full mb-3">
                                                                    <div className="font-black text-slate-700 text-sm leading-tight line-clamp-1">{item.name}</div>
                                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">{item.category}</div>
                                                                </div>
                                                                
                                                                {isOwned ? (
                                                                    <div className="w-full py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-black uppercase text-center flex items-center justify-center gap-1">
                                                                        <span>✓</span> Owned
                                                                    </div>
                                                                ) : (
                                                                    <button 
                                                                        onClick={() => handlePurchase(item.id, item.cost)}
                                                                        disabled={!canAfford || purchasingId === item.id}
                                                                        className={`
                                                                            w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all
                                                                            ${canAfford 
                                                                                ? 'bg-indigo-500 text-white shadow-[0_4px_0_#4338ca] hover:bg-indigo-600 active:translate-y-1 active:shadow-none' 
                                                                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                            }
                                                                        `}
                                                                    >
                                                                        {purchasingId === item.id ? (
                                                                            <span className="animate-spin">⏳</span>
                                                                        ) : (
                                                                            <>
                                                                                <span className="text-amber-300 drop-shadow-sm">⭐</span> {item.cost}
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
                    <div className="max-w-5xl mx-auto animate-slide-up">
                        <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-xl">🎒</div>
                                <div>
                                    <h3 className="font-extrabold text-slate-700 text-sm">Your Stash</h3>
                                    <p className="text-slate-400 text-xs font-bold">
                                        {uniqueOwnedStandard.length + myCustomStickers.length} Items Collected
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={handleRefreshCollection}
                                disabled={isRefreshing}
                                className="text-xs font-bold text-indigo-500 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors flex items-center gap-2 border border-transparent hover:border-indigo-100"
                            >
                                {isRefreshing ? <span className="animate-spin">🔄</span> : '🔄'} Sync
                            </button>
                        </div>

                        {uniqueOwnedStandard.length === 0 && myCustomStickers.length === 0 ? (
                            <div className="text-center py-24 opacity-60">
                                <div className="text-8xl mb-6 grayscale opacity-20">🎒</div>
                                <h3 className="text-2xl font-black text-slate-400 mb-2">Empty Backpack!</h3>
                                <p className="text-slate-400 font-medium">Buy some stickers from the Catalog.</p>
                                <Button className="mt-6" onClick={() => setActiveTab('CATALOG')}>Go Shopping</Button>
                            </div>
                        ) : (
                            <div className="space-y-12">
                                {myGiftStickers.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-4 ml-2">
                                            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-lg">🎁</div>
                                            <h4 className="text-amber-600 font-black text-xs uppercase tracking-widest">Teacher Gifts</h4>
                                        </div>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                            {myGiftStickers.map(s => (
                                                <div 
                                                    key={s.id} 
                                                    className="aspect-square bg-gradient-to-br from-amber-50 to-white rounded-2xl border-2 border-amber-200 overflow-hidden relative group hover:scale-105 transition-transform shadow-md cursor-zoom-in p-2 ring-2 ring-amber-100 ring-offset-2"
                                                    onClick={() => setPreviewItem(s)}
                                                >
                                                    <img 
                                                        src={convertDriveLink(s.dataUrl)} 
                                                        alt={s.prompt} 
                                                        className="w-full h-full object-contain drop-shadow-md" 
                                                    />
                                                    <div className="absolute top-2 right-2 bg-amber-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                                        GIFT
                                                    </div>
                                                    <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm p-2 text-center transform translate-y-full group-hover:translate-y-0 transition-transform">
                                                        <span className="text-[10px] text-amber-900 font-bold leading-tight line-clamp-2">{s.prompt}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {uniqueOwnedStandard.length > 0 && (
                                    <div>
                                        <h4 className="text-slate-400 font-black text-xs uppercase tracking-widest mb-4 ml-2">Store Stickers</h4>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-4">
                                            {uniqueOwnedStandard.map((s, idx) => {
                                                if (!s) return null;
                                                const displayImage = convertDriveLink(s.imageUrl || '');
                                                return (
                                                    <div 
                                                        key={`${s.id}-${idx}`} 
                                                        className="aspect-square bg-white rounded-2xl flex flex-col items-center justify-center border-2 border-slate-100 shadow-sm hover:scale-105 transition-transform overflow-hidden relative cursor-zoom-in group p-3" 
                                                        title={s.name}
                                                        onClick={() => setPreviewItem(s)}
                                                    >
                                                        {s.imageUrl ? <img src={displayImage} className="w-full h-full object-contain filter drop-shadow-sm" alt={s.name} /> : <div className="text-5xl drop-shadow-md">{(s as any).emoji}</div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {myAiStickers.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-4 ml-2">
                                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-lg">🎨</div>
                                            <h4 className="text-purple-500 font-black text-xs uppercase tracking-widest">My Studio Creations</h4>
                                        </div>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                            {myAiStickers.map(s => (
                                                <div 
                                                    key={s.id} 
                                                    className="aspect-square bg-gradient-to-br from-purple-50 to-white rounded-2xl border-2 border-purple-100 overflow-hidden relative group hover:scale-105 transition-transform shadow-md cursor-zoom-in p-2"
                                                    onClick={() => setPreviewItem(s)}
                                                >
                                                    <img src={s.dataUrl} alt={s.prompt} className="w-full h-full object-contain drop-shadow-md" />
                                                    <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm p-2 text-center transform translate-y-full group-hover:translate-y-0 transition-transform">
                                                        <span className="text-[10px] text-slate-600 font-bold leading-tight line-clamp-2">{s.prompt}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* AI Lab Tab Logic Preserved but Hidden via UI unless manually enabled */}
                {activeTab === 'AI_LAB' && (
                    <div className="max-w-lg mx-auto pb-32">
                        {/* ... Existing AI Lab Logic ... */}
                    </div>
                )}
            </div>
        </div>

        {/* PREVIEW MODAL */}
        {previewItem && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-indigo-500/20 backdrop-blur-lg p-6 animate-fade-in" onClick={() => setPreviewItem(null)}>
                <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full relative shadow-2xl flex flex-col items-center text-center animate-bounce-in border-4 border-white/20" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setPreviewItem(null)} className="absolute top-6 right-6 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200 text-xl transition-colors">✕</button>
                    
                    <h3 className="text-2xl font-extrabold text-slate-800 mb-2 mt-4">{previewItem.name || previewItem.prompt || 'Sticker Preview'}</h3>
                    <div className="w-16 h-1 bg-indigo-100 rounded-full mb-8"></div>
                    
                    {(() => {
                        const isOwned = ownedIds.includes(previewItem.id) || !!previewItem.studentId; 
                        return (
                            <div className="w-full aspect-square bg-slate-50 rounded-[2rem] flex items-center justify-center mb-8 relative border-4 border-slate-100 p-8 shadow-inner">
                                {/* Checkered Background for Transparency */}
                                <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>

                                {previewItem.imageUrl || previewItem.dataUrl ? (
                                    <img 
                                        src={convertDriveLink(previewItem.imageUrl || previewItem.dataUrl)} 
                                        alt="Preview" 
                                        className={`w-full h-full object-contain filter drop-shadow-xl ${!isOwned ? 'blur-[8px] grayscale opacity-50' : ''}`} 
                                    />
                                ) : (
                                    <div className="text-9xl drop-shadow-2xl">{(previewItem as any).emoji}</div>
                                )}
                                
                                {!isOwned && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                                        <div className="bg-white/90 backdrop-blur rounded-full w-20 h-20 flex items-center justify-center shadow-lg mb-2">
                                            <span className="text-5xl">🔒</span>
                                        </div>
                                        <span className="bg-rose-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">Locked</span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {previewItem.category && (
                        <span className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-full text-xs font-black uppercase tracking-widest">
                            {previewItem.category}
                        </span>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};
