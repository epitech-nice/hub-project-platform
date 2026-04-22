import { useState, useRef } from 'react';
import { cn } from '../../lib/cn';

export default function Tabs({ items = [], defaultValue, className = '' }) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.id);
  const tabsRef = useRef([]);

  const handleKeyDown = (e, index) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    setActive(items[next].id);
    tabsRef.current[next]?.focus();
  };

  const activeItem = items.find((t) => t.id === active);

  return (
    <div className={cn('w-full', className)}>
      <div role="tablist" className="flex border-b border-border gap-1">
        {items.map((item, i) => (
          <button
            key={item.id}
            ref={(el) => (tabsRef.current[i] = el)}
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={active === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={active === item.id ? 0 : -1}
            onClick={() => setActive(item.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
              'transition-colors duration-150 ease-smooth',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:rounded-t-md',
              active === item.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text hover:border-border-strong'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {activeItem && (
        <div
          role="tabpanel"
          id={`panel-${activeItem.id}`}
          aria-labelledby={`tab-${activeItem.id}`}
          className="pt-4"
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
