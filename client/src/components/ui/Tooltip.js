import { useState, useRef, useCallback, useId } from 'react';
import { cn } from '../../lib/cn';

const PLACEMENT_CLASSES = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
};

export default function Tooltip({
  content,
  placement = 'top',
  delay = 400,
  children,
  className = '',
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const id = useId();

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  const pos = PLACEMENT_CLASSES[placement] ?? PLACEMENT_CLASSES.top;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      // Brief visible flash on touch (no hover)
      onTouchStart={() => { setVisible(true); setTimeout(() => setVisible(false), 1200); }}
      aria-describedby={visible ? id : undefined}
    >
      {children}
      {visible && content && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute z-40 whitespace-nowrap',
            'bg-text text-surface text-xs rounded-md px-2 py-1 max-w-60',
            'pointer-events-none select-none',
            pos,
            className
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
