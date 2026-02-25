
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from './Button';
import { Student, StoreItem } from '../types';
import { STICKER_CATALOG, convertDriveLink } from '../utils/stickerData';
import { sheetService } from '../services/sheetService';
import { useTracking } from '../hooks/useTracking';

interface StickerStoreProps {
  student: Student;
  onUpdateStudent: (updates: Partial<Student>) => void;
  onClose: () => void;
  initialTab?: 'CATALOG' | 'AI_LAB' | 'COLLECTION';
}

export const StickerStore: React.FC<StickerStoreProps> = ({ student, onUpdateStudent, onClose, initialTab = 'CATALOG' }) => {
  const { track } = useTracking();
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'AI_LAB' | 'COLLECTION'>(initialTab === 'AI_LAB' ? 'CATALOG' : initialTab);
  
  // Book state: Open = pages visible, Closed = cover visible
  // Only applies when activeTab is COLLECTION
  const [isBookOpen, setIsBookOpen] = useState(initialTab !== 'COLLECTION'); // Start closed if entering collection directly
  const [isOpening, setIsOpening] = useState(false);

  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loadingStore, setLoadingStore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [selectedCategory, setSelectedCategory] = useState<string>('Misc.');
  
  // Preview State
  const [previewItem, setPreviewItem] = useState<any | null>(null);

  // Book Page
  const [bookPage, setBookPage] = useState(0);

  useEffect(() => {
      // Load store data in background
      loadStore();
  }, []);

  const loadStore = async () => {
      setLoadingStore(true);
      const items = await sheetService.getStoreItems();
      setStoreItems(items);
      setLoadingStore(false);
  };

  const dynamicCategories = useMemo(() => {
      if (storeItems.length === 0) return [];
      const cats = new Set(storeItems.map(i => i.category || 'Misc.'));
      return Array.from(cats).sort();
  }, [storeItems]);

  useEffect(() => {
      if (dynamicCategories.length > 0 && !dynamicCategories.includes(selectedCategory)) {
          setSelectedCategory(dynamicCategories[0]);
      }
  }, [dynamicCategories, selectedCategory]);

  const handleOpenBook = () => {
      setIsOpening(true);
      setTimeout(() => {
          setIsBookOpen(true);
          setIsOpening(false);
      }, 600); // Sync with CSS transition
  };

  const handleRefreshCollection = async () => {
      setIsRefreshing(true);
      setErrorMsg('');
      try {
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
          track(student, 'PURCHASE_STICKER', `Purchased sticker: ${stickerId}`, { stickerId, cost });
          onUpdateStudent({ points: result.points, stickers: result.stickers });
      } else {
          setErrorMsg(result.message || "Purchase failed. Try again.");
      }
  };

  const ownedIds = student.stickers || [];
  const myStandardStickers = [...storeItems, ...STICKER_CATALOG].filter(s => ownedIds.includes(s.id));
  const uniqueOwnedStandard = Array.from(new Set(myStandardStickers.map(s => s.id)))
      .map(id => myStandardStickers.find(s => s.id === id));
  
  const myCustomStickers = student.customStickers || [];
  const myAiStickers = myCustomStickers.filter(s => !s.id.startsWith('gift-'));
  const myGiftStickers = myCustomStickers.filter(s => s.id.startsWith('gift-'));

  const allCollectedStickers = useMemo(() => {
      const list: any[] = [];
      myGiftStickers.forEach(s => list.push({ ...s, _type: 'GIFT', name: s.prompt, category: 'Gifts' }));
      uniqueOwnedStandard.forEach(s => {
          if (s) list.push({ ...s, _type: 'STORE', category: s.category || 'Misc' });
      });
      myAiStickers.forEach(s => list.push({ ...s, _type: 'AI', name: s.prompt, category: 'AI Lab' }));
      
      return list.sort((a, b) => {
          const catA = a.category || 'Misc';
          const catB = b.category || 'Misc';
          return catA.localeCompare(catB) || (a.name || '').localeCompare(b.name || '');
      });
  }, [myGiftStickers, uniqueOwnedStandard, myAiStickers]);

  const ITEMS_PER_PAGE = 6; 
  const totalPages = Math.max(1, Math.ceil(allCollectedStickers.length / ITEMS_PER_PAGE));
  
  useEffect(() => {
      if (bookPage >= totalPages) setBookPage(0);
  }, [totalPages, allCollectedStickers.length]);

  const currentBookStickers = allCollectedStickers.slice(bookPage * ITEMS_PER_PAGE, (bookPage + 1) * ITEMS_PER_PAGE);

  const toggleView = () => {
      if (activeTab === 'CATALOG') {
          // Go to Book (Closed initially to show cover effect)
          setActiveTab('COLLECTION');
          setIsBookOpen(false);
      } else {
          // Go to Store (Grid view)
          setActiveTab('CATALOG');
      }
  };

  // --- RENDER COVER (ONLY IF IN COLLECTION MODE AND NOT OPEN) ---
  if (activeTab === 'COLLECTION' && !isBookOpen) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-indigo-900/60 backdrop-blur-md animate-fade-in font-nunito">
            <div 
                onClick={handleOpenBook}
                className={`
                    relative w-full max-w-md aspect-[3/4] rounded-[2rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] 
                    cursor-pointer transform transition-all duration-700 ease-in-out group hover:-translate-y-2 hover:shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)]
                    flex flex-col overflow-hidden border-r-8 border-b-8 border-red-950
                    ${isOpening ? 'scale-110 opacity-0 rotate-y-180' : 'scale-100 opacity-100'}
                `}
                style={{
                    backgroundColor: '#7f1d1d', // Red-900 base
                    backgroundImage: `
                        linear-gradient(90deg, rgba(0,0,0,0.3) 0%, rgba(255,255,255,0.1) 10%, rgba(0,0,0,0) 15%),
                        url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E")
                    `
                }}
            >
                <div className="absolute top-0 bottom-0 left-0 w-12 bg-gradient-to-r from-red-950 to-red-800 border-r border-red-950/50 z-10 flex flex-col justify-center items-center gap-4">
                    <div className="w-full h-[2px] bg-yellow-600/50"></div>
                    <div className="w-full h-[2px] bg-yellow-600/50"></div>
                    <div className="w-full h-[2px] bg-yellow-600/50"></div>
                </div>

                <div className="flex-1 ml-12 p-8 flex flex-col items-center justify-between border-l border-white/10 h-full relative">
                    <div className="absolute inset-6 ml-14 border-4 border-yellow-500/60 rounded-xl pointer-events-none">
                        <div className="absolute inset-1 border border-yellow-500/30 rounded-lg"></div>
                        <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-yellow-500 rounded-tl-lg"></div>
                        <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-yellow-500 rounded-tr-lg"></div>
                        <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-yellow-500 rounded-bl-lg"></div>
                        <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-yellow-500 rounded-br-lg"></div>
                    </div>

                    <div className="mt-12 text-center z-10">
                        <h1 className="font-serif-sc text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-200 via-yellow-400 to-yellow-600 drop-shadow-sm tracking-widest mb-2">
                            STICKER
                        </h1>
                        <h2 className="font-serif-sc text-3xl font-bold text-yellow-600/80 tracking-widest uppercase">
                            Collection
                        </h2>
                    </div>

                    <div className="w-32 h-32 bg-red-950/30 rounded-full flex items-center justify-center border-4 border-yellow-500/40 shadow-inner z-10">
                        <span className="text-6xl filter drop-shadow-lg grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500">🏆</span>
                    </div>

                    <div className="mb-12 text-center z-10">
                        <div className="bg-black/20 px-6 py-2 rounded-lg backdrop-blur-sm border border-white/10">
                            <p className="text-yellow-100 font-bold font-mono tracking-widest text-sm uppercase">Property of</p>
                            <p className="text-white font-black text-xl tracking-wide">{student.name}</p>
                        </div>
                        <p className="text-yellow-600/60 text-[10px] mt-4 font-bold uppercase tracking-[0.2em]">Tap to Open</p>
                    </div>
                </div>
            </div>
            
            <button 
                onClick={onClose}
                className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white font-bold backdrop-blur-sm transition-all border border-white/20"
            >
                ✕
            </button>
        </div>
      );
  }

  // --- RENDER MAIN VIEW (STORE OR OPEN BOOK) ---
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6 animate-fade-in bg-indigo-900/60 backdrop-blur-lg font-nunito">
        <div className="w-full max-w-5xl h-full md:h-[90vh] bg-[#f8fafc] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden relative border-4 border-white transition-all duration-500 animate-slide-up">
            
            {/* BOOKMARK - Toggles between Store and Book */}
            <div 
                onClick={toggleView}
                className="absolute top-0 right-12 z-50 cursor-pointer group transition-all duration-300 hover:-translate-y-1"
                title={activeTab === 'CATALOG' ? "Open My Book" : "Go to Store"}
            >
                <div className="w-12 h-32 bg-rose-600 shadow-lg rounded-b-lg relative border-x-2 border-b-2 border-rose-800 flex flex-col items-center justify-end pb-4 transition-all group-hover:h-36 group-hover:bg-rose-500">
                    <div className="absolute top-0 inset-x-0 h-4 bg-black/20"></div>
                    <div className="absolute inset-x-1 bottom-2 top-0 border-x border-dashed border-white/30"></div>
                    
                    <span className="text-white font-black text-xs uppercase tracking-widest vertical-text drop-shadow-md select-none" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                        {activeTab === 'CATALOG' ? 'MY BOOK' : 'STORE'}
                    </span>
                    <div className="w-8 h-8 bg-white/20 rounded-full mt-2 flex items-center justify-center text-lg shadow-inner">
                        {activeTab === 'CATALOG' ? '📖' : '🛍️'}
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="bg-white p-6 flex flex-col md:flex-row justify-between items-center gap-4 z-20 shadow-sm border-b border-slate-100 shrink-0 relative">
                <div className="flex items-center gap-4 w-full md:w-auto relative z-10">
                    <Button variant="ghost" onClick={onClose} className="shrink-0 aspect-square w-12 h-12 rounded-full bg-slate-50 hover:bg-slate-200 flex items-center justify-center p-0 text-slate-500 border border-slate-200">
                        <span className="text-2xl font-bold">✕</span>
                    </Button>
                    <div>
                        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                            {activeTab === 'CATALOG' ? 'Sticker Shop' : 'My Album'}
                        </h2>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-wider">
                            {activeTab === 'CATALOG' ? 'Spend your points' : 'Your Collection'}
                        </p>
                    </div>
                </div>
                
                <div className="bg-gradient-to-r from-amber-300 to-orange-400 px-6 py-2 rounded-full shadow-lg shadow-orange-100 text-white font-black flex items-center gap-3 transform hover:scale-105 transition-transform cursor-default select-none border-2 border-white/20">
                    <span className="text-2xl drop-shadow-sm">⭐</span>
                    <span className="text-3xl tracking-wide drop-shadow-sm">{student.points}</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div className={`flex-1 w-full relative flex flex-col ${activeTab === 'COLLECTION' ? 'bg-[#2c3e50] overflow-y-auto' : 'bg-slate-50 overflow-hidden'}`}>
                
                {errorMsg && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-rose-50 text-rose-600 rounded-full font-bold text-sm border border-rose-200 shadow-lg animate-bounce-in">
                        {errorMsg}
                    </div>
                )}
                
                {activeTab === 'CATALOG' && (
                    <div className="flex-1 overflow-y-auto px-6 pb-40 pt-6 scroll-smooth">
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
                                        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar snap-x sticky top-0 bg-slate-50/95 backdrop-blur-sm py-2 z-30">
                                            {dynamicCategories.map(cat => (
                                                 <button 
                                                    key={cat}
                                                    onClick={() => setSelectedCategory(cat)}
                                                    className={`
                                                        whitespace-nowrap px-5 py-2.5 rounded-full font-bold text-sm transition-all border-2 snap-center
                                                        ${selectedCategory === cat 
                                                            ? 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-200 scale-105' 
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
                                                                relative bg-white rounded-[2rem] p-3 flex flex-col items-center transition-all duration-300 group
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
                    </div>
                )}

                {/* STICKER BOOK VIEW (COLLECTION) */}
                {activeTab === 'COLLECTION' && (
                    <div className="w-full min-h-full flex flex-row items-center justify-center p-4 relative gap-6">
                        {/* Background Wood Texture */}
                        <div className="absolute inset-0 bg-[#2c3e50] opacity-100" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #34495e 25%, transparent 25%, transparent 75%, #34495e 75%, #34495e), repeating-linear-gradient(45deg, #34495e 25%, #2c3e50 25%, #2c3e50 75%, #34495e 75%, #34495e)', backgroundPosition: '0 0, 10px 10px', backgroundSize: '20px 20px' }}></div>

                        {/* SIDEBAR Controls */}
                        <div className="flex flex-col gap-4 z-20 shrink-0">
                            <button 
                                onClick={() => setIsBookOpen(false)}
                                className="w-14 h-14 rounded-2xl bg-rose-500/80 backdrop-blur-sm border border-white/10 flex flex-col items-center justify-center text-white hover:bg-rose-600 transition-all shadow-lg"
                                title="Close Book"
                            >
                                <span className="text-2xl mb-1">📕</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider">Close</span>
                            </button>

                            <button 
                                onClick={handleRefreshCollection}
                                disabled={isRefreshing}
                                className="w-14 h-14 rounded-2xl bg-black/20 backdrop-blur-sm border border-white/10 flex flex-col items-center justify-center text-slate-300 hover:text-white hover:bg-black/30 transition-all shadow-lg"
                                title="Sync Collection"
                            >
                                <span className={`text-2xl mb-1 ${isRefreshing ? 'animate-spin' : ''}`}>🔄</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider">Sync</span>
                            </button>
                            
                            <div className="flex flex-col items-center gap-2 bg-black/30 backdrop-blur rounded-2xl p-2 shadow-lg border border-white/10 text-white">
                                <button 
                                    disabled={bookPage === 0} 
                                    onClick={() => setBookPage(p => p - 1)} 
                                    className="w-10 h-10 rounded-xl hover:bg-white/20 flex items-center justify-center disabled:opacity-30 font-bold transition-colors"
                                >
                                    ▲
                                </button>
                                
                                <div className="flex flex-col items-center py-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page</span>
                                    <span className="font-mono font-bold text-xl">{bookPage + 1}</span>
                                    <div className="w-8 h-[1px] bg-white/20 my-1"></div>
                                    <span className="font-mono text-sm text-slate-400">{totalPages}</span>
                                </div>

                                <button 
                                    disabled={bookPage >= totalPages - 1} 
                                    onClick={() => setBookPage(p => p + 1)} 
                                    className="w-10 h-10 rounded-xl hover:bg-white/20 flex items-center justify-center disabled:opacity-30 font-bold transition-colors"
                                >
                                    ▼
                                </button>
                            </div>
                        </div>

                        {/* THE OPEN BOOK */}
                        <div className="relative bg-[#fdfbf7] w-full max-w-4xl aspect-[4/3] max-h-[85vh] rounded-r-2xl rounded-l-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex overflow-hidden border-r-8 border-b-8 border-[#e3dccb]">
                            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black/20 to-transparent z-20 pointer-events-none"></div>
                            <div className="absolute inset-0 opacity-40 pointer-events-none z-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E")` }}></div>

                            <div className="flex-1 p-6 sm:p-10 flex flex-col relative z-10 ml-4">
                                <div className="grid grid-cols-3 grid-rows-2 gap-6 h-full w-full">
                                    {[...Array(ITEMS_PER_PAGE)].map((_, i) => {
                                        const item = currentBookStickers[i];
                                        if (!item) return <div key={`empty-${i}`} className="w-full h-full border-2 border-dashed border-stone-200 rounded-lg flex items-center justify-center"><span className="text-stone-300 font-black text-2xl opacity-50">+</span></div>;

                                        const displayImage = convertDriveLink(item.imageUrl || item.dataUrl);
                                        const rotate = [-2, 1.5, -1, 2, -1.5, 1][(bookPage * 6 + i) % 6];
                                        
                                        return (
                                            <div 
                                                key={`${item.id}-${i}`}
                                                onClick={() => setPreviewItem(item)}
                                                className="relative cursor-pointer group flex items-center justify-center p-2 transition-transform duration-300 hover:scale-105 hover:z-20"
                                                style={{ transform: `rotate(${rotate}deg)` }}
                                            >
                                                <div className="bg-white p-3 pb-8 shadow-md border border-stone-200 w-full h-full flex flex-col items-center transform transition-shadow group-hover:shadow-2xl">
                                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-8 bg-white/40 backdrop-blur-sm border-l border-r border-white/60 shadow-sm transform -rotate-1 z-10 opacity-70"></div>
                                                    <div className="flex-1 w-full bg-stone-100 overflow-hidden flex items-center justify-center relative border border-stone-100">
                                                        {item.imageUrl || item.dataUrl ? (
                                                            <img src={displayImage} alt={item.name} className="max-w-full max-h-full object-contain" />
                                                        ) : (
                                                            <div className="text-5xl">{(item as any).emoji}</div>
                                                        )}
                                                    </div>
                                                    <div className="absolute bottom-2 left-0 right-0 text-center font-serif-sc text-stone-600 font-bold text-xs truncate px-2">{item.name}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
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
                    <div className="w-full aspect-square bg-slate-50 rounded-[2rem] flex items-center justify-center mb-8 relative border-4 border-slate-100 p-8 shadow-inner">
                        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                        {previewItem.imageUrl || previewItem.dataUrl ? <img src={convertDriveLink(previewItem.imageUrl || previewItem.dataUrl)} alt="Preview" className="w-full h-full object-contain filter drop-shadow-xl" /> : <div className="text-9xl drop-shadow-2xl">{(previewItem as any).emoji}</div>}
                    </div>
                    {previewItem.category && <span className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-full text-xs font-black uppercase tracking-widest">{previewItem.category}</span>}
                </div>
            </div>
        )}
    </div>
  );
};
