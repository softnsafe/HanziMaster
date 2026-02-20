
const TONE_MARKS: Record<string, string> = {
    a: 'āáǎàa',
    e: 'ēéěèe',
    i: 'īíǐìi',
    o: 'ōóǒòo',
    u: 'ūúǔùu',
    v: 'ǖǘǚǜü',
    ü: 'ǖǘǚǜü',
};

export const pinyinify = (text: string): string => {
    if (!text) return "";
    
    // Split by spaces to handle phrases like "ni3 hao3"
    return text.split(/\s+/).map(word => {
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
    
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '').replace(/v/g, 'ü').replace(/u:/g, 'ü');
    
    const cleanInput = normalize(input);
    const cleanTarget = normalize(target);
    
    // Direct match (e.g. hao3 === hao3)
    if (cleanInput === cleanTarget) return true;
    
    // Tone Mark match (e.g. hǎo === hǎo)
    if (cleanInput === cleanTarget) return true;
    
    // Cross match (hǎo === hao3) using pinyinify to standardize to marks
    // We convert both to marks. If one is already marks, pinyinify usually keeps it (mostly).
    // Note: pinyinify expects tone numbers. If input is 'hǎo', pinyinify('hǎo') returns 'hǎo'.
    // If input is 'hao3', pinyinify('hao3') returns 'hǎo'.
    // So pinyinify is a good normalizer to Tone Marks.
    
    const inputMarks = normalize(pinyinify(input));
    const targetMarks = normalize(pinyinify(target));
    
    return inputMarks === targetMarks;
};
