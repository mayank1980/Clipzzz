/**
 * Master list of all 26 official captions.js presets
 * Free · MIT License · Self-hosted
 */
export const CAPTION_PRESETS = [
  { id: 'Karaoke', name: 'Karaoke', animation: 'Bounce', category: 'Viral', tag: 'Pop Choice' },
  { id: 'Focus Box', name: 'Focus Box', animation: 'Box', category: 'Box', tag: 'High Focus' },
  { id: 'Banger', name: 'Banger', animation: 'Pop', category: 'Viral', tag: 'Hormozi Style' },
  { id: 'Acid', name: 'Acid', animation: 'None', category: 'Clean', tag: 'Minimal' },
  { id: 'Lovly', name: 'Lovly', animation: 'Scale', category: 'Motion', tag: 'Aesthetic' },
  { id: 'Marvel', name: 'Marvel', animation: 'Scale', category: 'Motion', tag: 'Cinematic' },
  { id: 'Marker', name: 'Marker', animation: 'Underline', category: 'Glow', tag: 'Highlight' },
  { id: 'Neon Pulse', name: 'Neon Pulse', animation: 'Slide-up', category: 'Glow', tag: 'Cyber Neon' },
  { id: 'Beasty', name: 'Beasty', animation: 'Pop', category: 'Viral', tag: 'MrBeast Style' },
  { id: 'Crazy', name: 'Crazy', animation: 'None', category: 'Clean', tag: 'Fast Reading' },
  { id: 'Safari', name: 'Safari', animation: 'Box', category: 'Box', tag: 'Adventure' },
  { id: 'Popline', name: 'Popline', animation: 'None', category: 'Clean', tag: 'Modern Sub' },
  { id: 'Desert', name: 'Desert', animation: 'Bounce', category: 'Motion', tag: 'Warm Tone' },
  { id: 'Hook', name: 'Hook', animation: 'Underline', category: 'Glow', tag: 'High CTR' },
  { id: 'Sky', name: 'Sky', animation: 'Slide-left', category: 'Motion', tag: 'Breezy' },
  { id: 'Flamingo', name: 'Flamingo', animation: 'Scale', category: 'Motion', tag: 'Vibrant' },
  { id: 'Deep Diver B&W', name: 'Deep Diver B&W', animation: 'Box', category: 'Box', tag: 'Mono Contrast' },
  { id: 'New', name: 'New', animation: 'Pop', category: 'Viral', tag: 'Trending' },
  { id: 'Catchy', name: 'Catchy', animation: 'Bounce', category: 'Motion', tag: 'Rhythmic' },
  { id: 'From', name: 'From', animation: 'Pop', category: 'Viral', tag: 'Crisp Pop' },
  { id: 'Classic', name: 'Classic', animation: 'None', category: 'Classic', tag: 'Standard' },
  { id: 'Classic Big', name: 'Classic Big', animation: 'None', category: 'Classic', tag: 'Big Readable' },
  { id: 'Old Money', name: 'Old Money', animation: 'Slide-up', category: 'Classic', tag: 'Serif Luxury' },
  { id: 'Cinema', name: 'Cinema', animation: 'None', category: 'Classic', tag: 'Letterbox' },
  { id: 'Midnight Serif', name: 'Midnight Serif', animation: 'Box', category: 'Box', tag: 'Editorial' },
  { id: 'Aurora Ink', name: 'Aurora Ink', animation: 'Underline', category: 'Glow', tag: 'Gradient Glow' },
];

export const PRESET_NAMES = CAPTION_PRESETS.map((p) => p.name);

export const PRESET_CATEGORIES = ['All (26)', 'Viral', 'Motion', 'Box', 'Glow', 'Classic'];

