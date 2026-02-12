
import { Sticker } from '../types';

// Helper to convert Google Drive sharing links to usable image sources
export const convertDriveLink = (url: string): string => {
    if (!url) return '';
    try {
        // Handle: https://drive.google.com/file/d/FILE_ID/view...
        // Handle: https://drive.google.com/open?id=FILE_ID
        const idMatch = url.match(/[-\w]{25,}/);
        if (idMatch) {
            const id = idMatch[0];
            return `https://lh3.googleusercontent.com/d/${id}=s400`; // =s400 requests a 400px width thumbnail (efficient)
        }
    } catch (e) {
        console.warn("Failed to parse Drive link", e);
    }
    return url;
};

export const STICKER_CATALOG: Sticker[] = [
  // These are now Legacy/Starter stickers. 
  // The system primarily relies on the "Store" sheet now.
  { id: 'panda', name: 'Panda', emoji: '🐼', cost: 50, category: 'ANIMAL', description: 'A cute giant panda' },
  { id: 'tiger', name: 'Tiger', emoji: '🐯', cost: 50, category: 'ANIMAL', description: 'King of the beasts' },
  { id: 'star', name: 'Star', emoji: '⭐', cost: 20, category: 'CELESTIAL', description: 'You are a star!' },
  { id: 'medal', name: 'Medal', emoji: '🥇', cost: 150, category: 'OBJECT', description: 'Gold medal winner' },
];
