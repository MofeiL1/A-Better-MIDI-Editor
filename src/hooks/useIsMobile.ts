import { useState, useEffect } from 'react';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window && window.innerWidth < 1024;
  });

  useEffect(() => {
    const check = () => {
      setIsMobile('ontouchstart' in window && window.innerWidth < 1024);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}
