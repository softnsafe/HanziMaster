
const TONE_MARKS: Record<string, string> = {
    a: 'āáǎàa',
    e: 'ēéěèe',
    i: 'īíǐìi',
    o: 'ōóǒòo',
    u: 'ūúǔùu',
    v: 'ǖǘǚǜü',
    ü: 'ǖǘǚǜü',
};

const REVERSE_TONE_MAP: Record<string, {char: string, tone: number}> = {};
// Build reverse map
Object.keys(TONE_MARKS).forEach(base => {
    const marks = TONE_MARKS[base];
    for (let i = 0; i < marks.length; i++) {
        REVERSE_TONE_MAP[marks[i]] = { char: base, tone: i + 1 };
    }
});

export const toneToNumber = (text: string): string => {
    if (!text) return "";
    return text.split(/\s+/).map(word => {
        let tone = 5;
        let cleanWord = "";
        let foundTone = false;
        
        for (const char of word) {
            if (REVERSE_TONE_MAP[char]) {
                cleanWord += REVERSE_TONE_MAP[char].char;
                tone = REVERSE_TONE_MAP[char].tone;
                foundTone = true;
            } else {
                cleanWord += char;
            }
        }
        
        if (foundTone && tone !== 5) {
            return cleanWord + tone;
        }
        return cleanWord;
    }).join(' ');
};

export const pinyinify = (text: string): string => {
    if (!text) return "";
    
    // Use regex to find pinyin tokens (word + optional tone number)
    // This preserves punctuation and spacing automatically
    return text.replace(/([a-zA-ZüÜ:vV]+)([1-5]?)/g, (_match, base, toneStr) => {
        // Convert v and u: to ü for proper processing
        let normalizedBase = base.toLowerCase().replace(/v/g, 'ü').replace(/u:/g, 'ü');
        const tone = parseInt(toneStr || '5', 10);

        if (tone === 5) return normalizedBase; // Neutral tone (usually no mark)

        // Find vowel to mark
        // Priority: a, e, o. If none, then last vowel. 
        // Exception: iu -> mark u.
        
        let vowelIndex = -1;
        
        if (normalizedBase.includes('a')) vowelIndex = normalizedBase.indexOf('a');
        else if (normalizedBase.includes('e')) vowelIndex = normalizedBase.indexOf('e');
        else if (normalizedBase.includes('ou')) vowelIndex = normalizedBase.indexOf('o'); // special case for 'ou'
        else {
            // Find last vowel
            for (let i = normalizedBase.length - 1; i >= 0; i--) {
                if ('aeiouvü'.includes(normalizedBase[i])) {
                    vowelIndex = i;
                    break;
                }
            }
        }

        if (vowelIndex === -1) return normalizedBase;

        const vowel = normalizedBase[vowelIndex];
        const replacement = TONE_MARKS[vowel]?.[tone - 1] || vowel;

        return normalizedBase.substring(0, vowelIndex) + replacement + normalizedBase.substring(vowelIndex + 1);
    });
};

export const comparePinyin = (input: string, target: string): boolean => {
    if (!input || !target) return false;
    
    // Normalize: remove punctuation, spaces, lowercase
    const normalize = (s: string) => s.trim().toLowerCase()
        .replace(/[.,!?，。！？\s]/g, '') // Strip punctuation and spaces
        .replace(/v/g, 'ü').replace(/u:/g, 'ü');
    
    const cleanInput = normalize(input);
    const cleanTarget = normalize(target);
    
    // Direct match (e.g. hao3 === hao3)
    if (cleanInput === cleanTarget) return true;
    
    // Tone Mark match (e.g. hǎo === hǎo)
    if (cleanInput === cleanTarget) return true;
    
    // Cross match (hǎo === hao3) using pinyinify to standardize to marks
    // Treat punctuation as spaces for pinyinify to ensure words are split correctly
    const inputForPinyinify = input.replace(/[.,!?，。！？]/g, ' ');
    const targetForPinyinify = target.replace(/[.,!?，。！？]/g, ' ');

    const inputMarks = normalize(pinyinify(inputForPinyinify)); 
    const targetMarks = normalize(pinyinify(targetForPinyinify)); 
    
    return inputMarks === targetMarks;
};
