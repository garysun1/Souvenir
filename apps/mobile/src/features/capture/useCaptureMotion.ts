import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useApp } from '@/state/AppProvider';
export function useCaptureMotion() {
  const { state } = useApp();
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setSystemReduced(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => { mounted = false; listener.remove(); };
  }, []);
  return state.preferences.reducedMotion || systemReduced;
}
