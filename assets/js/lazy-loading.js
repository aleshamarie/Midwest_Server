// Server-side lazy loading implementation for product images
// This can be included in any HTML page that needs lazy loading

(function() {
  'use strict';

  // Configuration
  const LAZY_LOADING_CONFIG = {
    rootMargin: '100px 0px',
    threshold: 0.1,
    placeholderClass: 'lazy-image',
    loadingClass: 'loading',
    loadedClass: 'loaded',
    fallbackClass: 'fallback'
  };

  // Image cache for better performance
  const imageCache = new Map();
  const maxCacheSize = 50;

  // Lazy loading implementation
  function initLazyLoading() {
    if (!('IntersectionObserver' in window)) {
      // Fallback for browsers without IntersectionObserver
      loadAllImages();
      return;
    }

    const observer = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          loadImage(img);
          observer.unobserve(img);
        }
      });
    }, {
      rootMargin: LAZY_LOADING_CONFIG.rootMargin,
      threshold: LAZY_LOADING_CONFIG.threshold
    });

    // Observe all lazy images
    const lazyImages = document.querySelectorAll(`.${LAZY_LOADING_CONFIG.placeholderClass}`);
    lazyImages.forEach(img => {
      if (!img.classList.contains(LAZY_LOADING_CONFIG.loadingClass) && 
          !img.classList.contains(LAZY_LOADING_CONFIG.loadedClass)) {
        observer.observe(img);
      }
    });
  }

  // Load individual image with caching
  async function loadImage(img) {
    if (!img.dataset.src) return;

    // Mark as loading
    img.classList.add(LAZY_LOADING_CONFIG.loadingClass);
    img.style.opacity = '0.6';

    try {
      // Check cache first
      if (imageCache.has(img.dataset.src)) {
        img.src = img.dataset.src;
        img.style.opacity = '1';
        img.classList.remove(LAZY_LOADING_CONFIG.placeholderClass, LAZY_LOADING_CONFIG.loadingClass);
        img.classList.add(LAZY_LOADING_CONFIG.loadedClass);
        return;
      }

      // Preload image
      await preloadImage(img.dataset.src);
      
      // Update cache
      if (imageCache.size >= maxCacheSize) {
        const firstKey = imageCache.keys().next().value;
        imageCache.delete(firstKey);
      }
      imageCache.set(img.dataset.src, true);

      // Set image source
      img.src = img.dataset.src;
      img.style.opacity = '1';
      img.classList.remove(LAZY_LOADING_CONFIG.placeholderClass, LAZY_LOADING_CONFIG.loadingClass);
      img.classList.add(LAZY_LOADING_CONFIG.loadedClass);
      
      // Add smooth transition
      img.style.transition = 'opacity 0.3s ease-in-out';

    } catch (error) {
      console.warn('Failed to load image:', img.dataset.src, error);
      
      // Fallback to default image
      img.src = img.dataset.fallback || '/assets/images/Midwest.jpg';
      img.style.opacity = '1';
      img.classList.remove(LAZY_LOADING_CONFIG.placeholderClass, LAZY_LOADING_CONFIG.loadingClass);
      img.classList.add(LAZY_LOADING_CONFIG.loadedClass, LAZY_LOADING_CONFIG.fallbackClass);
      img.title = 'Image failed to load';
    }
  }

  // Preload image function
  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  // Fallback for browsers without IntersectionObserver
  function loadAllImages() {
    const lazyImages = document.querySelectorAll(`.${LAZY_LOADING_CONFIG.placeholderClass}`);
    lazyImages.forEach(img => {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.classList.remove(LAZY_LOADING_CONFIG.placeholderClass);
        img.classList.add(LAZY_LOADING_CONFIG.loadedClass);
      }
    });
  }

  // Preload critical images (first few)
  function preloadCriticalImages() {
    const criticalImages = document.querySelectorAll(`.${LAZY_LOADING_CONFIG.placeholderClass}`);
    const maxPreload = 6;
    
    for (let i = 0; i < Math.min(criticalImages.length, maxPreload); i++) {
      const img = criticalImages[i];
      if (img.dataset.src && !img.classList.contains(LAZY_LOADING_CONFIG.loadingClass)) {
        preloadImage(img.dataset.src).catch(() => {});
      }
    }
  }

  // Clear image cache
  function clearImageCache() {
    if (imageCache.size > maxCacheSize * 0.8) {
      const entries = Array.from(imageCache.entries());
      const toDelete = entries.slice(0, Math.floor(entries.length * 0.3));
      toDelete.forEach(([key]) => imageCache.delete(key));
    }
  }

  // Add CSS for loading animations
  function addLazyLoadingStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .lazy-image {
        background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 0.375rem;
        position: relative;
        overflow: hidden;
      }
      
      .lazy-image::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
        animation: sweep 2s infinite;
      }
      
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      
      @keyframes sweep {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      
      .lazy-image.loading {
        animation: pulse 1s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 0.8; }
      }
      
      .lazy-image.loaded {
        animation: none;
        background: none;
        opacity: 1;
        transition: opacity 0.3s ease-in-out;
      }
      
      .lazy-image.fallback {
        filter: grayscale(20%);
        opacity: 0.8;
      }
      
      .lazy-image.fallback::after {
        content: '⚠️';
        position: absolute;
        top: 2px;
        right: 2px;
        font-size: 10px;
        background: rgba(0,0,0,0.7);
        color: white;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize when DOM is ready
  function init() {
    addLazyLoadingStyles();
    initLazyLoading();
    preloadCriticalImages();
    
    // Periodic cache cleanup
    setInterval(clearImageCache, 60000); // 1 minute
  }

  // Auto-initialize if DOM is already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export functions for manual control
  window.LazyLoading = {
    init: initLazyLoading,
    loadImage: loadImage,
    preloadCriticalImages: preloadCriticalImages,
    clearCache: clearImageCache,
    config: LAZY_LOADING_CONFIG
  };

})();
