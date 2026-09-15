import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FlyCheap',
    short_name: 'FlyCheap',
    description: 'Cheap flights, monitored for you. Track 1,000+ airlines worldwide.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a3a6b',
    theme_color: '#0a3a6b',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'maskable' },
    ],
    categories: ['travel', 'productivity', 'finance'],
    shortcuts: [
      { name: 'Dashboard',         short_name: 'Home',     url: '/' },
      { name: 'Explore worldwide', short_name: 'Explore',  url: '/explore' },
      { name: 'Live offers',       short_name: 'Offers',   url: '/offers' },
      { name: 'My searches',       short_name: 'Tracked',  url: '/searches' },
    ],
  };
}
