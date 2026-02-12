
import { Sticker } from '../types';

// Helper to convert Google Drive sharing links to usable image sources
export const convertDriveLink = (url: string): string => {
    if (!url) return '';
    // Return immediately if it's a data URL or already converted
    if (url.startsWith('data:')) return url;
    if (url.includes('lh3.googleusercontent.com')) return url;

    try {
        // 1. Look for ID in query params (id=...)
        // 2. Look for ID in path (/d/...)
        // Google Drive IDs are typically 33 characters (alphanumeric + - _)
        
        // Regex for ID: 25+ characters of alphanumeric, hyphen, underscore
        const idRegex = /[-\w]{25,}/;
        const match = url.match(idRegex);
        
        if (match && (url.includes('drive.google.com') || url.includes('docs.google.com'))) {
            const id = match[0];
            // =s400 requests a 400px width thumbnail (efficient & bypasses CORS often)
            return `https://lh3.googleusercontent.com/d/${id}=s400`; 
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
