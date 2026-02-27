import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Lesson } from '../types';
import { HanziPlayer } from './HanziPlayer';
import { generateStoryBuilderImage, getCharacterDetails, getSentencePinyin, playPronunciation } from '../services/geminiService';
import { pinyinify } from '../utils/pinyinUtils';

interface StoryBuilderGameProps {
  lesson: Lesson;
  initialCharacters: string[];
  onComplete: () => void;
  onExit: () => void;
  onRecordResult: (char: string, score: number, type: 'STORY_BUILDER') => void;
  dictionary?: Record<string, {pinyin: string, definition: string, audio: string}>;
}

type Step = 'PRACTICE_WORDS' | 'PINYIN_PHRASE' | 'RECORD_AUDIO' | 'BUILD_SENTENCE';

export const StoryBuilderGame: React.FC<StoryBuilderGameProps> = ({ lesson, initialCharacters, onComplete, onExit, onRecordResult, dictionary = {} }) => {
  const sentences = initialCharacters && initialCharacters.length > 0 ? initialCharacters : lesson.characters;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState<Step>('PRACTICE_WORDS');

  // Parsed data for current item
  const [targetWord, setTargetWord] = useState('');
  const [phrases, setPhrases] = useState('');
  const [sentenceChars, setSentenceChars] = useState<string[]>([]);

  // Image state
  const [storyImage, setStoryImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [practiceCount, setPracticeCount] = useState(0);
  const [hanziKey, setHanziKey] = useState(0);

  // Character Details state
  const [charDetails, setCharDetails] = useState<{ radical: string; strokeCount: number; pinyin?: string } | null>(null);

  // Sentence Pinyin state
  const [sentencePinyin, setSentencePinyin] = useState<string[]>([]);

  // Step 2: PINYIN_PHRASE state
  const [pinyinInput, setPinyinInput] = useState('');
  const [pinyinFeedback, setPinyinFeedback] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Step 3: RECORD_AUDIO state
  const [isRecording, setIsRecording] = useState(false);
  const [audioSaved, setAudioSaved] = useState(false);

  // Step 4: BUILD_SENTENCE state
  const [shuffledWords, setShuffledWords] = useState<{word: string, id: string, origIdx: number}[]>([]);
  const [selectedWords, setSelectedWords] = useState<{word: string, id: string, origIdx: number}[]>([]);

  const currentItem = sentences[currentIndex];

  useEffect(() => {
    if (currentItem) {
      const parts = currentItem.split('|').map(s => s.trim());
      let word = '';
      let phrs = '';
      let sent = '';

      if (parts.length >= 3) {
        word = parts[0];
        phrs = parts[1];
        sent = parts[2];
      } else {
        // Fallback
        sent = currentItem;
        word = currentItem.charAt(0);
        phrs = currentItem;
      }

      setTargetWord(word);
      setPhrases(phrs);

      const chars = sent.replace(/[.,!?，。！？]/g, '').split('');
      setSentenceChars(chars);
      
      setPracticeCount(0);
      setHanziKey(prev => prev + 1);
      setPinyinInput('');
      setPinyinFeedback('');
      setAudioSaved(false);
      setSelectedWords([]);
      setStoryImage(null);
      setCharDetails(null);
      setSentencePinyin([]);
      
      const wordObjects = chars.map((char, idx) => ({
        word: char,
        id: `${char}-${idx}`,
        origIdx: idx
      }));
      const shuffled = [...wordObjects].sort(() => Math.random() - 0.5);
      setShuffledWords(shuffled);

      // Fetch character details
      if (word) {
        getCharacterDetails(word).then(details => {
          if (details) {
            setCharDetails({ radical: details.radical, strokeCount: details.strokeCount, pinyin: details.pinyin });
          }
        });
      }

      // Fetch sentence pinyin
      if (sent) {
        getSentencePinyin(sent).then(pinyinArray => {
          setSentencePinyin(pinyinArray);
        });
      }

      // Generate image in the background
      setIsGeneratingImage(true);
      generateStoryBuilderImage(sent).then(img => {
          setStoryImage(img);
          setIsGeneratingImage(false);
      });
    }
  }, [currentIndex, currentItem]);

  if (!currentItem) return null;

  const handleNextStep = () => {
    if (step === 'PRACTICE_WORDS') {
      setStep('PINYIN_PHRASE');
    } else if (step === 'PINYIN_PHRASE') {
      setStep('RECORD_AUDIO');
    } else if (step === 'RECORD_AUDIO') {
      setStep('BUILD_SENTENCE');
    } else if (step === 'BUILD_SENTENCE') {
      onRecordResult(currentItem, 100, 'STORY_BUILDER');
      if (currentIndex < sentences.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setStep('PRACTICE_WORDS');
      } else {
        onComplete();
      }
    }
  };

  // --- Step 1: PRACTICE_WORDS ---
  const handleHanziComplete = () => {
    if (practiceCount < 2) {
      setPracticeCount(prev => prev + 1);
      setHanziKey(prev => prev + 1);
    } else {
      setTimeout(() => {
        handleNextStep();
      }, 500);
    }
  };

  // --- Step 2: PINYIN_PHRASE ---
  const handlePlayAudio = async () => {
      if (isPlayingAudio) return;
      setIsPlayingAudio(true);
      // Try phrase audio first, then target word audio
      const audioUrl = dictionary[phrases]?.audio || dictionary[targetWord]?.audio;
      // Pass phrases as text, audioUrl as override, and pinyin if available
      await playPronunciation(phrases, audioUrl);
      setIsPlayingAudio(false);
  };

  const handleCheckPinyin = () => {
    if (pinyinInput.trim().length > 0) {
      setPinyinFeedback('Great job! 🌟');
      setTimeout(() => {
        handleNextStep();
      }, 1000);
    } else {
      setPinyinFeedback('Please type the pinyin.');
    }
  };

  // --- Step 3: RECORD_AUDIO ---
  const handleRecord = () => {
    setIsRecording(true);
    setTimeout(() => {
      setIsRecording(false);
      setAudioSaved(true);
      setTimeout(() => {
        handleNextStep();
      }, 1500);
    }, 3000);
  };

  // --- Step 4: BUILD_SENTENCE ---
  const handleSelectWord = (item: {word: string, id: string, origIdx: number}, index: number) => {
    setSelectedWords([...selectedWords, item]);
    const newShuffled = [...shuffledWords];
    newShuffled.splice(index, 1);
    setShuffledWords(newShuffled);
  };

  const handleUndoWord = (item: {word: string, id: string, origIdx: number}, index: number) => {
    const newSelected = [...selectedWords];
    newSelected.splice(index, 1);
    setSelectedWords(newSelected);
    setShuffledWords([...shuffledWords, item]);
  };

  const handleCheckLego = () => {
    if (selectedWords.map(w => w.word).join('') === sentenceChars.join('')) {
      handleNextStep();
    } else {
      setSelectedWords([]);
      const wordObjects = sentenceChars.map((char, idx) => ({
        word: char,
        id: `${char}-${idx}`,
        origIdx: idx
      }));
      setShuffledWords(wordObjects.sort(() => Math.random() - 0.5));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-sky-50 flex flex-col font-nunito animate-fade-in overflow-hidden">
      {/* Playful Background Elements */}
      <div className="absolute top-10 left-10 text-6xl opacity-20 animate-bounce-slow pointer-events-none">☁️</div>
      <div className="absolute top-20 right-20 text-6xl opacity-20 animate-pulse pointer-events-none">⭐</div>
      <div className="absolute bottom-10 left-20 text-6xl opacity-20 animate-bounce pointer-events-none">🎈</div>
      <div className="absolute bottom-20 right-10 text-6xl opacity-20 animate-pulse pointer-events-none">🚀</div>

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md px-6 py-4 flex justify-between items-center shadow-sm border-b border-sky-100 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onExit} className="text-slate-400 hover:text-rose-500 font-bold">✕ Exit</Button>
          <div className="h-8 w-px bg-slate-200"></div>
          <div>
            <h2 className="font-extrabold text-sky-600 tracking-tight flex items-center gap-2">
              <span>🧱</span> Story Builder
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Story Part {currentIndex + 1} of {sentences.length}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {sentences.map((_, i) => (
            <div key={i} className={`h-3 w-10 rounded-full shadow-inner transition-all duration-500 ${i < currentIndex ? 'bg-emerald-400' : i === currentIndex ? 'bg-sky-500 scale-110' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 overflow-y-auto">
        
        {step === 'PRACTICE_WORDS' && (
          <div className="flex flex-col items-center text-center animate-slide-up max-w-md w-full">
            <div className="bg-white/90 backdrop-blur-sm p-8 rounded-[3rem] shadow-2xl border-4 border-sky-100 mb-8 w-full flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute -top-4 -right-4 text-6xl opacity-20 rotate-12">✍️</div>
              <h3 className="text-2xl font-black text-sky-700 mb-6">Let's write this word!</h3>
              
              {charDetails && (
                <div className="flex gap-4 mb-6 bg-sky-50 px-6 py-3 rounded-2xl border-2 border-sky-100">
                  {charDetails.pinyin && (
                      <>
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-bold text-sky-400 uppercase tracking-wider">Pinyin</span>
                            <span className="text-2xl font-bold text-sky-700">{pinyinify(charDetails.pinyin)}</span>
                          </div>
                          <div className="w-px bg-sky-200"></div>
                      </>
                  )}
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-sky-400 uppercase tracking-wider">Radical</span>
                    <span className="text-2xl font-serif-sc text-sky-700 font-bold">{charDetails.radical}</span>
                  </div>
                  <div className="w-px bg-sky-200"></div>
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-sky-400 uppercase tracking-wider">Strokes</span>
                    <span className="text-2xl font-bold text-sky-700">{charDetails.strokeCount}</span>
                  </div>
                </div>
              )}

              <HanziPlayer 
                key={hanziKey}
                character={targetWord} 
                initialMode="quiz" 
                onComplete={handleHanziComplete} 
              />
              <div className="mt-8 flex gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-4 h-4 rounded-full ${i < practiceCount ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                ))}
              </div>
              <span className="text-lg font-bold text-slate-400 mt-2">Practice {practiceCount + 1} of 3</span>
            </div>
          </div>
        )}

        {step === 'PINYIN_PHRASE' && (
          <div className="flex flex-col items-center text-center animate-slide-up max-w-lg w-full">
            <div className="bg-white/90 backdrop-blur-sm p-10 rounded-[3rem] shadow-2xl border-4 border-amber-100 mb-8 w-full relative overflow-hidden">
              <div className="absolute -top-4 -left-4 text-6xl opacity-20 -rotate-12">🔤</div>
              <h3 className="text-2xl font-black text-amber-600 mb-8">Type the pinyin!</h3>
              <div className="bg-amber-50 p-6 rounded-[2rem] border-2 border-amber-100 mb-8 flex flex-col items-center gap-4">
                <span className="text-5xl font-serif-sc text-slate-800 font-bold">{phrases}</span>
                <button 
                    onClick={handlePlayAudio}
                    disabled={isPlayingAudio}
                    className="px-4 py-2 rounded-full bg-amber-200 text-amber-800 font-bold flex items-center gap-2 hover:bg-amber-300 transition-colors shadow-sm text-sm disabled:opacity-50"
                    title="Play Audio"
                >
                    {isPlayingAudio ? <span className="animate-pulse">🔊 Playing...</span> : '🔊 Listen'}
                </button>
              </div>
              <input 
                type="text" 
                value={pinyinInput}
                onChange={(e) => setPinyinInput(e.target.value)}
                placeholder="e.g. shui guo"
                className="w-full px-6 py-4 text-2xl font-bold text-center bg-white border-4 border-amber-200 rounded-2xl focus:border-amber-400 outline-none mb-4 shadow-inner text-slate-700"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCheckPinyin()}
              />
              {pinyinFeedback && (
                <div className={`text-xl font-black mb-4 animate-bounce ${pinyinFeedback.includes('Great') ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {pinyinFeedback}
                </div>
              )}
              <Button onClick={handleCheckPinyin} className="w-full text-xl py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200 text-white border-none">
                Check Answer
              </Button>
            </div>
          </div>
        )}

        {step === 'RECORD_AUDIO' && (
          <div className="flex flex-col items-center text-center animate-slide-up max-w-lg w-full">
            <div className="bg-white/90 backdrop-blur-sm p-10 rounded-[3rem] shadow-2xl border-4 border-rose-100 mb-8 w-full flex flex-col items-center relative overflow-hidden">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-20 rotate-12">🗣️</div>
              <h3 className="text-2xl font-black text-rose-600 mb-8">Read it out loud!</h3>
              <div className="bg-rose-50 p-6 rounded-[2rem] border-2 border-rose-100 mb-10 w-full">
                <span className="text-5xl font-serif-sc text-slate-800 font-bold">{phrases}</span>
              </div>
              
              <button 
                onClick={handleRecord}
                disabled={isRecording || audioSaved}
                className={`w-36 h-36 rounded-full flex items-center justify-center text-6xl transition-all duration-300 shadow-2xl border-4
                  ${isRecording ? 'bg-rose-500 text-white animate-pulse scale-110 shadow-rose-300 border-rose-400' : 
                    audioSaved ? 'bg-emerald-500 text-white scale-100 shadow-emerald-200 border-emerald-400' : 
                    'bg-white text-rose-500 hover:bg-rose-50 hover:scale-105 shadow-rose-200 border-rose-200'}
                `}
              >
                {isRecording ? '🎙️' : audioSaved ? '✨' : '🎤'}
              </button>
              <p className={`mt-6 text-xl font-black ${isRecording ? 'text-rose-500 animate-pulse' : audioSaved ? 'text-emerald-500' : 'text-slate-400'}`}>
                {isRecording ? 'Listening...' : audioSaved ? 'Awesome!' : 'Tap to Record'}
              </p>
            </div>
          </div>
        )}

        {step === 'BUILD_SENTENCE' && (
          <div className="flex flex-col items-center text-center animate-slide-up max-w-3xl w-full">
            
            {/* Story Image Area */}
            <div className="w-full max-w-xl aspect-video bg-white rounded-[2rem] shadow-xl border-4 border-white mb-8 overflow-hidden relative flex items-center justify-center group">
                {isGeneratingImage ? (
                    <div className="flex flex-col items-center text-sky-400">
                        <span className="text-4xl animate-spin mb-2">🪄</span>
                        <span className="font-bold text-sm uppercase tracking-wider">Drawing your story...</span>
                    </div>
                ) : storyImage ? (
                    <img src={storyImage} alt="Story illustration" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                    <div className="text-slate-300 font-bold flex flex-col items-center">
                        <span className="text-4xl mb-2">🖼️</span>
                        <span>Picture unavailable</span>
                    </div>
                )}
                <div className="absolute inset-0 shadow-inner pointer-events-none rounded-[2rem]"></div>
            </div>

            <h3 className="text-3xl font-black text-sky-700 mb-6 drop-shadow-sm">Build the sentence!</h3>
            
            {/* Target Area */}
            <div className="bg-white/80 backdrop-blur-sm min-h-[140px] w-full rounded-[2.5rem] shadow-inner border-4 border-sky-200 mb-8 p-6 flex flex-wrap gap-4 items-center justify-center">
              {selectedWords.length === 0 && <span className="text-sky-300 font-black text-2xl opacity-50">Drag or tap words here</span>}
              {selectedWords.map((item, idx) => {
                const pinyin = sentencePinyin[item.origIdx] || '';
                const isFirst = item.origIdx === 0;
                return (
                  <button 
                    key={`sel-${item.id}-${idx}`}
                    onClick={() => handleUndoWord(item, idx)}
                    className={`flex flex-col items-center px-6 py-3 text-white rounded-2xl shadow-[0_6px_0_rgba(0,0,0,0.2)] hover:translate-y-1 hover:shadow-[0_2px_0_rgba(0,0,0,0.2)] transition-all animate-bounce-in border-2 border-white/20
                        ${isFirst ? 'bg-rose-500' : 'bg-sky-500'}
                    `}
                  >
                    {pinyin && <span className="text-sm font-bold text-white/80 mb-1">{pinyin}</span>}
                    <span className="text-4xl font-serif-sc font-bold">{item.word}</span>
                  </button>
                );
              })}
            </div>

            {/* Source Area */}
            <div className="flex flex-wrap gap-4 justify-center min-h-[100px]">
              {shuffledWords.map((item, idx) => {
                const pinyin = sentencePinyin[item.origIdx] || '';
                const isFirst = item.origIdx === 0;
                return (
                  <button 
                    key={`src-${item.id}-${idx}`}
                    onClick={() => handleSelectWord(item, idx)}
                    className={`flex flex-col items-center px-6 py-3 bg-white border-4 rounded-2xl shadow-[0_6px_0_#e2e8f0] hover:translate-y-1 hover:shadow-[0_2px_0_#bae6fd] transition-all
                        ${isFirst ? 'text-rose-600 border-rose-200 hover:border-rose-400' : 'text-slate-700 border-slate-200 hover:border-sky-400 hover:text-sky-600'}
                    `}
                  >
                    {pinyin && <span className="text-sm font-bold text-slate-400 mb-1">{pinyin}</span>}
                    <span className="text-4xl font-serif-sc font-bold">{item.word}</span>
                  </button>
                );
              })}
            </div>

            {shuffledWords.length === 0 && (
              <Button 
                onClick={handleCheckLego}
                className="mt-12 w-full max-w-md text-2xl py-5 rounded-[2rem] shadow-[0_8px_0_#059669] bg-emerald-500 hover:bg-emerald-600 hover:translate-y-2 hover:shadow-none transition-all text-white font-black border-none"
              >
                Check Answer ✨
              </Button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
