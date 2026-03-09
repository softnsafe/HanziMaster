import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Lesson } from '../types';
import { HanziPlayer } from './HanziPlayer';
import { getCharacterDetails, getSentenceMetadata, playPronunciation } from '../services/geminiService';
import { pinyinify, comparePinyin } from '../utils/pinyinUtils';

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
  
  // New state for practicing all characters
  const [practiceChars, setPracticeChars] = useState<string[]>([]);
  const [practiceCharIndex, setPracticeCharIndex] = useState(0);

  // Image state removed
  const [practiceCount, setPracticeCount] = useState(0);
  const [hanziKey, setHanziKey] = useState(0);

  // Character Details state
  const [charDetails, setCharDetails] = useState<{ radical: string; strokeCount: number; pinyin?: string; definition?: string } | null>(null);
  const [exampleSentences, setExampleSentences] = useState<{chinese: string, pinyin?: string, english: string}[]>([]);

  // Sentence Metadata state
  const [sentencePinyin, setSentencePinyin] = useState<string[]>([]);
  const [sentenceTranslation, setSentenceTranslation] = useState('');
  const [phrasePinyin, setPhrasePinyin] = useState('');

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
  const [legoFeedback, setLegoFeedback] = useState('');

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

      // Determine what to practice (Word if explicit, otherwise Sentence)
      let practiceSource = word;
      if (parts.length < 3) {
          // If fallback, practice the whole sentence characters
          practiceSource = sent;
      }
      
      // Clean and get unique characters for practice
      const cleanPractice = practiceSource.replace(/[^\p{L}\p{N}]/gu, '');
      const uniqueChars = Array.from(new Set([...cleanPractice]));
      
      setPracticeChars(uniqueChars);
      setPracticeCharIndex(0);
      setTargetWord(uniqueChars[0] || '');
      
      setPhrases(phrs);

      // Strip ALL punctuation, symbols, and spaces. Only keep letters (including Chinese) and numbers.
      // This prevents "invisible" blocks or confusing punctuation blocks (like quotes, commas, etc.)
      const cleanSent = sent.replace(/[^\p{L}\p{N}]/gu, '');
      const chars = [...cleanSent]; // Use spread syntax to handle surrogate pairs correctly
      setSentenceChars(chars);
      
      setPracticeCount(0);
      setHanziKey(prev => prev + 1);
      setPinyinInput('');
      setPinyinFeedback('');
      setPhrasePinyin('');
      setAudioSaved(false);
      setSelectedWords([]);
      setLegoFeedback('');
      setCharDetails(null);
      setSentencePinyin([]);
      
      const wordObjects = chars.map((char, idx) => ({
        word: char,
        id: `${char}-${idx}`,
        origIdx: idx
      }));
      const shuffled = [...wordObjects].sort(() => Math.random() - 0.5);
      setShuffledWords(shuffled);

      // Fetch phrase pinyin
      if (phrs) {
          if (dictionary[phrs]) {
              setPhrasePinyin(dictionary[phrs].pinyin);
          } else {
              // Use API for both phrase and word cases if not in dictionary
              getSentenceMetadata(phrs).then(meta => {
                  if (meta && meta.pinyin) {
                      setPhrasePinyin(meta.pinyin.join(' '));
                  }
              });
          }
      }

      // Fetch sentence metadata
      if (sent) {
        getSentenceMetadata(sent).then(meta => {
          if (meta) {
            setSentencePinyin(meta.pinyin);
            setSentenceTranslation(meta.translation);
          }
        });
      }

      // Image generation removed for simplicity
    }
  }, [currentIndex, currentItem]);

  // Fetch character details when targetWord changes
  useEffect(() => {
    if (targetWord) {
      setExampleSentences([]);
      getCharacterDetails(targetWord).then(details => {
        if (details) {
          setCharDetails({ 
              radical: details.radical, 
              strokeCount: details.strokeCount, 
              pinyin: details.pinyin,
              definition: details.definition
          });
        }
      });
      fetch(`/api/example-sentences?query=${encodeURIComponent(targetWord)}`)
        .then(res => res.json())
        .then(data => {
            if (data.sentences) {
                setExampleSentences(data.sentences);
            }
        }).catch(e => console.error(e));
    }
  }, [targetWord]);

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
      // Finished 3 times for current char
      if (practiceCharIndex < practiceChars.length - 1) {
         // Move to next char
         const nextIndex = practiceCharIndex + 1;
         setPracticeCharIndex(nextIndex);
         setTargetWord(practiceChars[nextIndex]);
         setPracticeCount(0);
         setHanziKey(prev => prev + 1);
      } else {
         // All chars done
         setTimeout(() => {
           handleNextStep();
         }, 500);
      }
    }
  };

  // --- Step 2: PINYIN_PHRASE ---
  const handlePlayAudio = async () => {
      if (isPlayingAudio) return;
      setIsPlayingAudio(true);
      // Try phrase audio first. If phrase IS the target word, fallback to targetWord audio.
      let audioUrl = dictionary[phrases]?.audio;
      if (!audioUrl && phrases === targetWord) {
          audioUrl = dictionary[targetWord]?.audio;
      }
      
      // Pass phrases as text, audioUrl as override, and pinyin if available
      await playPronunciation(phrases, audioUrl, phrasePinyin);
      setIsPlayingAudio(false);
  };

  const handleCheckPinyin = () => {
    // If we have the correct pinyin, validate against it
    if (phrasePinyin) {
        if (comparePinyin(pinyinInput, phrasePinyin)) {
            setPinyinFeedback('Great job! 🌟');
            setTimeout(() => {
                handleNextStep();
            }, 1000);
        } else {
            setPinyinFeedback(`Incorrect. Try: ${phrasePinyin}`);
        }
    } else {
        // Fallback if pinyin data is missing
        if (pinyinInput.trim().length > 0) {
            setPinyinFeedback('Good effort!');
            setTimeout(() => {
                handleNextStep();
            }, 1000);
        } else {
            setPinyinFeedback('Please type the pinyin.');
        }
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
    const attempt = selectedWords.map(w => w.word).join('');
    const target = sentenceChars.join('');
    console.log('StoryBuilder Check:', { attempt, target, match: attempt === target });

    if (attempt === target) {
      setLegoFeedback('Correct! 🎉');
      setTimeout(() => handleNextStep(), 1000);
    } else {
      setLegoFeedback('Incorrect order. Try again!');
      setTimeout(() => {
          setLegoFeedback('');
          setSelectedWords([]);
          const wordObjects = sentenceChars.map((char, idx) => ({
            word: char,
            id: `${char}-${idx}`,
            origIdx: idx
          }));
          setShuffledWords(wordObjects.sort(() => Math.random() - 0.5));
      }, 1500);
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
            <div className="bg-white/90 backdrop-blur-sm p-4 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-2xl border-4 border-sky-100 mb-8 w-full flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute -top-4 -right-4 text-6xl opacity-20 rotate-12">✍️</div>
              <h3 className="text-xl md:text-2xl font-black text-sky-700 mb-4 md:mb-6">Let's write this word!</h3>
              
              {charDetails && (
                <div className="flex gap-2 md:gap-4 mb-4 md:mb-6 bg-sky-50 px-4 md:px-6 py-3 rounded-2xl border-2 border-sky-100 flex-wrap justify-center">
                  {charDetails.pinyin && charDetails.pinyin !== '?' && (
                      <>
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] md:text-sm font-bold text-sky-400 uppercase tracking-wider">Pinyin</span>
                            <span className="text-xl md:text-2xl font-bold text-sky-700">{pinyinify(charDetails.pinyin)}</span>
                          </div>
                          <div className="w-px bg-sky-200 hidden md:block"></div>
                      </>
                  )}
                  {charDetails.radical && charDetails.radical !== '?' && (
                      <>
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] md:text-sm font-bold text-sky-400 uppercase tracking-wider">Radical</span>
                            <span className="text-xl md:text-2xl font-serif-sc text-sky-700 font-bold">{charDetails.radical}</span>
                          </div>
                          <div className="w-px bg-sky-200 hidden md:block"></div>
                      </>
                  )}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] md:text-sm font-bold text-sky-400 uppercase tracking-wider">Strokes</span>
                    <span className="text-xl md:text-2xl font-bold text-sky-700">{charDetails.strokeCount > 0 ? charDetails.strokeCount : '-'}</span>
                  </div>
                </div>
              )}

              {charDetails?.definition && (
                  <div className="w-full max-w-xs text-center bg-white/60 backdrop-blur-sm rounded-xl py-2 px-4 border border-sky-100 animate-fade-in shadow-sm mb-4">
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block mb-1">Meaning</span>
                      <span className="text-sm md:text-lg font-bold text-slate-600 leading-tight">{charDetails.definition}</span>
                  </div>
              )}

              <HanziPlayer 
                key={hanziKey}
                character={targetWord} 
                initialMode="quiz" 
                onComplete={handleHanziComplete} 
              />
              
              {exampleSentences.length > 0 && (
                  <div className="mt-6 w-full max-w-sm bg-sky-50/50 p-4 rounded-2xl border border-sky-100 animate-fade-in text-left">
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block mb-2">Example</span>
                      <ul className="space-y-3">
                          {exampleSentences.slice(0, 1).map((ex, i) => (
                              <li key={i} className="text-sm">
                                  <div className="font-bold text-slate-700">{ex.chinese}</div>
                                  {ex.pinyin && <div className="text-slate-500 text-xs font-mono">{pinyinify(ex.pinyin)}</div>}
                                  <div className="text-slate-500 italic">{ex.english}</div>
                              </li>
                          ))}
                      </ul>
                  </div>
              )}

              <div className="mt-6 md:mt-8 flex gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${i < practiceCount ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                ))}
              </div>
              <span className="text-sm md:text-lg font-bold text-slate-400 mt-2">Practice {practiceCount + 1} of 3</span>
            </div>
          </div>
        )}

        {step === 'PINYIN_PHRASE' && (
          <div className="flex flex-col items-center text-center animate-slide-up max-w-lg w-full">
            <div className="bg-white/90 backdrop-blur-sm p-4 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-2xl border-4 border-amber-100 mb-8 w-full relative overflow-hidden">
              <div className="absolute -top-4 -left-4 text-6xl opacity-20 -rotate-12">🔤</div>
              <h3 className="text-xl md:text-2xl font-black text-amber-600 mb-4 md:mb-8">Type the pinyin!</h3>
              <div className="bg-amber-50 p-4 md:p-6 rounded-[2rem] border-2 border-amber-100 mb-6 md:mb-8 flex flex-col items-center gap-4">
                <span className="text-3xl md:text-5xl font-serif-sc text-slate-800 font-bold break-words max-w-full">{phrases}</span>
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
                placeholder="e.g. shui3 guo3"
                className="w-full px-4 md:px-6 py-3 md:py-4 text-xl md:text-2xl font-bold text-center bg-white border-4 border-amber-200 rounded-2xl focus:border-amber-400 outline-none mb-4 shadow-inner text-slate-700"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCheckPinyin()}
              />
              {pinyinFeedback && (
                <div className={`text-lg md:text-xl font-black mb-4 animate-bounce ${pinyinFeedback.includes('Great') ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {pinyinFeedback}
                </div>
              )}
              <Button onClick={handleCheckPinyin} className="w-full text-lg md:text-xl py-3 md:py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200 text-white border-none">
                Check Answer
              </Button>
            </div>
          </div>
        )}

        {step === 'RECORD_AUDIO' && (
          <div className="flex flex-col items-center text-center animate-slide-up max-w-lg w-full">
            <div className="bg-white/90 backdrop-blur-sm p-4 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-2xl border-4 border-rose-100 mb-8 w-full flex flex-col items-center relative overflow-hidden">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-20 rotate-12">🗣️</div>
              <h3 className="text-xl md:text-2xl font-black text-rose-600 mb-4 md:mb-8">Read it out loud!</h3>
              <div className="bg-rose-50 p-4 md:p-6 rounded-[2rem] border-2 border-rose-100 mb-6 md:mb-10 w-full">
                <span className="text-3xl md:text-5xl font-serif-sc text-slate-800 font-bold break-words max-w-full">{phrases}</span>
              </div>
              
              <button 
                onClick={handleRecord}
                disabled={isRecording || audioSaved}
                className={`w-28 h-28 md:w-36 md:h-36 rounded-full flex items-center justify-center text-4xl md:text-6xl transition-all duration-300 shadow-2xl border-4
                  ${isRecording ? 'bg-rose-500 text-white animate-pulse scale-110 shadow-rose-300 border-rose-400' : 
                    audioSaved ? 'bg-emerald-500 text-white scale-100 shadow-emerald-200 border-emerald-400' : 
                    'bg-white text-rose-500 hover:bg-rose-50 hover:scale-105 shadow-rose-200 border-rose-200'}
                `}
              >
                {isRecording ? '🎙️' : audioSaved ? '✨' : '🎤'}
              </button>
              <p className={`mt-4 md:mt-6 text-lg md:text-xl font-black ${isRecording ? 'text-rose-500 animate-pulse' : audioSaved ? 'text-emerald-500' : 'text-slate-400'}`}>
                {isRecording ? 'Listening...' : audioSaved ? 'Awesome!' : 'Tap to Record'}
              </p>
            </div>
          </div>
        )}

        {step === 'BUILD_SENTENCE' && (
          <div className="flex flex-col items-center text-center animate-slide-up max-w-3xl w-full">
            
            {/* Story Image Area - Simplified */}
            <div className="w-full max-w-xl bg-sky-50 rounded-[1.5rem] md:rounded-[2rem] border-4 border-sky-100 mb-6 md:mb-8 p-8 flex items-center justify-center shadow-inner">
                <div className="text-center opacity-50">
                    <span className="text-6xl block mb-2 grayscale">🧱</span>
                    <span className="font-black text-sky-400 uppercase tracking-widest text-xl">Build The Sentence</span>
                </div>
            </div>

            <h3 className="text-2xl md:text-3xl font-black text-sky-700 mb-2 drop-shadow-sm">Build the sentence!</h3>
            {sentencePinyin.length > 0 && (
                <p className="text-xl md:text-2xl font-bold text-sky-600 mb-4 md:mb-6 tracking-wide">{sentencePinyin.join(' ')}</p>
            )}
            
            {/* Target Area */}
            <div className="bg-white/80 backdrop-blur-sm min-h-[100px] md:min-h-[140px] w-full rounded-[2rem] md:rounded-[2.5rem] shadow-inner border-4 border-sky-200 mb-4 p-4 md:p-6 flex flex-wrap gap-2 md:gap-4 items-center justify-center">
              {selectedWords.length === 0 && <span className="text-sky-300 font-black text-xl md:text-2xl opacity-50">Drag or tap words here</span>}
              {selectedWords.map((item, idx) => {
                const pinyin = sentencePinyin[item.origIdx] || '';
                const isFirst = item.origIdx === 0;
                return (
                  <button 
                    key={`sel-${item.id}-${idx}`}
                    onClick={() => handleUndoWord(item, idx)}
                    className={`flex flex-col items-center px-4 py-2 md:px-6 md:py-3 text-white rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.2)] md:shadow-[0_6px_0_rgba(0,0,0,0.2)] hover:translate-y-1 hover:shadow-[0_2px_0_rgba(0,0,0,0.2)] transition-all animate-bounce-in border-2 border-white/20
                        ${isFirst ? 'bg-rose-500' : 'bg-sky-500'}
                    `}
                  >
                    {pinyin && <span className="text-xs md:text-sm font-bold text-white/80 mb-1">{pinyin}</span>}
                    <span className="text-2xl md:text-4xl font-serif-sc font-bold">{item.word}</span>
                  </button>
                );
              })}
            </div>

            {sentenceTranslation && (
                <p className="text-lg md:text-xl font-bold text-slate-500 mb-6 md:mb-8 italic">"{sentenceTranslation}"</p>
            )}

            {/* Source Area */}
            <div className="flex flex-wrap gap-2 md:gap-4 justify-center min-h-[80px] md:min-h-[100px]">
              {shuffledWords.map((item, idx) => {
                const pinyin = sentencePinyin[item.origIdx] || '';
                const isFirst = item.origIdx === 0;
                return (
                  <button 
                    key={`src-${item.id}-${idx}`}
                    onClick={() => handleSelectWord(item, idx)}
                    className={`flex flex-col items-center px-4 py-2 md:px-6 md:py-3 bg-white border-4 rounded-2xl shadow-[0_4px_0_#e2e8f0] md:shadow-[0_6px_0_#e2e8f0] hover:translate-y-1 hover:shadow-[0_2px_0_#bae6fd] transition-all
                        ${isFirst ? 'text-rose-600 border-rose-200 hover:border-rose-400' : 'text-slate-700 border-slate-200 hover:border-sky-400 hover:text-sky-600'}
                    `}
                  >
                    {pinyin && <span className="text-xs md:text-sm font-bold text-slate-400 mb-1">{pinyin}</span>}
                    <span className="text-2xl md:text-4xl font-serif-sc font-bold">{item.word}</span>
                  </button>
                );
              })}
            </div>

            {shuffledWords.length === 0 && (
              <>
                {legoFeedback && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in pointer-events-none">
                        <div className={`text-6xl md:text-8xl font-black p-12 rounded-[3rem] shadow-2xl animate-bounce-in transform scale-110 border-8 border-white/50 flex items-center gap-4 ${legoFeedback.includes('Correct') ? 'bg-emerald-500 text-white rotate-3' : 'bg-rose-500 text-white -rotate-3'}`}>
                            <span className="text-8xl filter drop-shadow-lg">{legoFeedback.includes('Correct') ? '🎉' : '🤔'}</span>
                            <span className="filter drop-shadow-lg">{legoFeedback}</span>
                        </div>
                    </div>
                )}
                <Button 
                    onClick={handleCheckLego}
                    className="mt-4 w-full max-w-md text-2xl py-5 rounded-[2rem] shadow-[0_8px_0_#059669] bg-emerald-500 hover:bg-emerald-600 hover:translate-y-2 hover:shadow-none transition-all text-white font-black border-none"
                >
                    Check Answer ✨
                </Button>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
