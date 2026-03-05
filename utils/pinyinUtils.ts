
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
    
    // Preprocess: Insert space between number and following letter to handle "gei3ni3" -> "gei3 ni3"
    const spacedText = text.replace(/([1-5])([a-zA-ZüÜ:vV])/g, '$1 $2');
    
    // Split by spaces to handle phrases like "ni3 hao3"
    return spacedText.split(/\s+/).map(word => {
        // Extract tone number (1-5)
        const match = word.match(/^([a-zA-ZüÜ:vV]+)([1-5]?)$/);
        if (!match) return word;

        // Convert v and u: to ü for proper processing
        let base = match[1].toLowerCase().replace(/v/g, 'ü').replace(/u:/g, 'ü');
        const tone = parseInt(match[2] || '5', 10);

        if (tone === 5) return base; // Neutral tone (usually no mark)

        // Find vowel to mark
        // Priority: a, e, o. If none, then last vowel. 
        // Exception: iu -> mark u.
        
        let vowelIndex = -1;
        
        if (base.includes('a')) vowelIndex = base.indexOf('a');
        else if (base.includes('e')) vowelIndex = base.indexOf('e');
        else if (base.includes('ou')) vowelIndex = base.indexOf('o'); // special case for 'ou'
        else {
            // Find last vowel
            for (let i = base.length - 1; i >= 0; i--) {
                if ('aeiouvü'.includes(base[i])) {
                    vowelIndex = i;
                    break;
                }
            }
        }

        if (vowelIndex === -1) return base;

        const vowel = base[vowelIndex];
        const replacement = TONE_MARKS[vowel]?.[tone - 1] || vowel;

        return base.substring(0, vowelIndex) + replacement + base.substring(vowelIndex + 1);
    }).join(' ');
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
