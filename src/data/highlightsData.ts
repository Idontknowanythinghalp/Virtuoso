/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GalleryPhotoItem {
  id: string;
  title: string;
  caption: string;
  year: string;
  tag: string;
  /**
   * Replace this with actual image URL once photographs are supplied.
   * e.g., '/assets/gallery/virtuoso-2025-valedictory.jpg'
   * If left blank or undefined, the gallery displays a premium neutral placeholder.
   */
  imageUrl?: string;
  aspectRatio?: 'landscape' | 'portrait' | 'square';
}

export interface AftermovieConfig {
  title: string;
  subtitle: string;
  description: string;
  editionBadge: string;
  duration?: string;
  /**
   * Replace this with the official aftermovie video URL once available.
   * Supports YouTube embed URLs (e.g. 'https://www.youtube-nocookie.com/embed/...')
   * or direct MP4/Vimeo links.
   * If left empty, a polished placeholder with ready-to-mount state is shown.
   */
  videoUrl?: string;
  /**
   * Optional custom thumbnail or poster image.
   */
  posterUrl?: string;
}

export const aftermovieConfig: AftermovieConfig = {
  title: 'RELIVE THE EXPERIENCE',
  subtitle: 'Official Virtuoso Aftermovie',
  description:
    'A look back at the moments, energy and memories that made Virtuoso unforgettable.',
  editionBadge: 'PREVIOUS EDITION RECAP',
  duration: '03:45',
  // Official video link will be plugged in here by the college web handler
  videoUrl: '',
  posterUrl: '',
};

export const previousYearPhotos: GalleryPhotoItem[] = [
  {
    id: 'highlight-1',
    title: 'The Valedictory Crowning',
    caption: 'Celebration of triumphant contingents and the ₹1,25,000 championship trophy presentation.',
    year: 'Virtuoso 2024',
    tag: 'Grand Finale',
    aspectRatio: 'landscape',
  },
  {
    id: 'highlight-2',
    title: 'Executive Boardroom Crucible',
    caption: 'High-stakes strategy deliberations tested under severe time constraints.',
    year: 'Virtuoso 2024',
    tag: 'Boardroom Rounds',
    aspectRatio: 'landscape',
  },
  {
    id: 'highlight-3',
    title: 'Five-Star Gala Setting',
    caption: 'Distinguished guests and faculty convening in Bengaluru premier luxury hospitality suites.',
    year: 'Virtuoso 2024',
    tag: 'Venue Atmosphere',
    aspectRatio: 'landscape',
  },
  {
    id: 'highlight-4',
    title: 'Crisis & PR Defense',
    caption: 'Contingents addressing live press conferences and volatile media simulations.',
    year: 'Virtuoso 2024',
    tag: 'Crucible Simulations',
    aspectRatio: 'landscape',
  },
  {
    id: 'highlight-5',
    title: 'Jesuit Heritage Inauguration',
    caption: 'Solemn lighting of the lamp and inaugural address at St. Joseph’s College of Commerce.',
    year: 'Virtuoso 2024',
    tag: 'Ceremony & Tradition',
    aspectRatio: 'landscape',
  },
  {
    id: 'highlight-6',
    title: 'Contingent Camaraderie',
    caption: 'Bonds forged between top undergraduate business minds from across India.',
    year: 'Virtuoso 2024',
    tag: 'Delegates',
    aspectRatio: 'landscape',
  },
];
