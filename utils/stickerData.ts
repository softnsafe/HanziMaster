
import { Sticker } from '../types';

export const STICKER_CATEGORIES = ["Animals", "Food", "School", "Misc.", "Rewards"];

// Helper to convert Google Drive sharing links to usable image sources
export const convertDriveLink = (url: string, size: number = 400): string => {
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
            // =s{size} requests a thumbnail of that width (efficient & bypasses CORS often)
            return `https://lh3.googleusercontent.com/d/${id}=s${size}`; 
        }
    } catch (e) {
        console.warn("Failed to parse Drive link", e);
    }
    return url;
};

// New Helper for Audio Links - More Robust for v3.25.2
export const convertAudioDriveLink = (url: string): string => {
    if (!url) return '';
    let trimmed = url.trim();
    
    // Check for standard Google Drive domains
    if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
        let id = '';
        
        // Pattern A: .../d/FILE_ID/...
        const pathMatch = trimmed.match(/\/d\/([-\w]{25,})/);
        if (pathMatch && pathMatch[1]) {
            id = pathMatch[1];
        }
        
        // Pattern B: ...id=FILE_ID...
        if (!id) {
            const paramMatch = trimmed.match(/[?&]id=([-\w]{25,})/);
            if (paramMatch && paramMatch[1]) {
                id = paramMatch[1];
            }
        }

        if (id) {
            // Convert to direct download/stream link
            // Added &confirm=t to bypass virus scan warning page which breaks audio
            // Use docs.google.com/uc for better compatibility in some regions
            return `https://docs.google.com/uc?export=download&id=${id}&confirm=t`;
        }
    }
    return trimmed;
};

export const STICKER_CATALOG: Sticker[] = [
  // Hardcoded stickers removed to rely purely on the "Store" sheet in the backend.
  // Add items via the Teacher Dashboard -> Rewards -> Manage Store.
];
