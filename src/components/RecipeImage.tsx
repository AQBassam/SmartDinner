import { useState } from 'react';
import { PHOTOS, photoUrl, type Recipe } from '../lib/data';
import { Plate } from './ui';

/**
 * The dish, as a photo when one is registered (scripts/images.py), otherwise an illustrated panel in the
 * dish's own colour with its plate. Same box either way, so nothing jumps when a photo arrives or fails.
 */
export function RecipeImage({ recipe, variant = 'card', priority = false, className = '', plateSize, sizes = '(min-width: 768px) 50vw, 100vw' }:
  { recipe: Recipe; variant?: 'card' | 'hero'; priority?: boolean; className?: string; plateSize?: number; sizes?: string }) {
  const src = photoUrl(recipe.id, variant);
  // a hero lets the browser take the 800 px card file when the box is small enough (most phones at 2×)
  const srcSet = variant === 'hero' && src ? `${photoUrl(recipe.id, 'card')} 800w, ${src} 1600w` : undefined;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const photo = src && !failed;
  return (
    <div className={`dish-media relative overflow-hidden ${className}`} style={{ ['--tint' as string]: recipe.tint }}>
      {/* the illustration stays underneath, so the photo fades in over it instead of over a blank box */}
      <div className="dish-fallback absolute inset-0 grid place-items-center" aria-hidden="true">
        <Plate emoji={recipe.emoji} tint={recipe.tint} size={plateSize ?? (variant === 'hero' ? 132 : 76)} />
      </div>
      {photo && (
        <img src={src} srcSet={srcSet} sizes={srcSet ? sizes : undefined} alt={recipe.photoAlt} width={variant === 'hero' ? 1600 : 800} height={variant === 'hero' ? 1200 : 600}
          loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
          className={`dish-photo absolute inset-0 size-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
      )}
      {photo && loaded && PHOTOS[recipe.id]?.ai && variant === 'hero' && (
        <span className="absolute bottom-2 start-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">صورة توضيحية</span>
      )}
    </div>
  );
}
