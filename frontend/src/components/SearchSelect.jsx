import { useState, useRef, useEffect } from 'react';
import '../styles/componentStyles/SearchSelect.css';

// A text box that opens a filtered list of options. Pass `onQueryChange` to load options from the server as the
// user types (the list is then shown as given); otherwise `options` are filtered here with `matches`.
const SearchSelect = ({
  options,
  selectedLabel = '',
  placeholder = 'Search...',
  onSelect,
  onQueryChange,
  matches,
  renderOption,
  getKey,
  disabled = false,
  emptyText = 'No matches'
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const inputRef = useRef(null);

  // The list is positioned against the screen (not its parent) so a scrolling or clipping container, such as a
  // table wrapper, can never hide it. It opens upwards when there is no room below.
  useEffect(() => {
    if (!open) return undefined;

    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const room = window.innerHeight - rect.bottom;
      const opensUp = room < 220 && rect.top > room;
      setPosition({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(260, (opensUp ? rect.top : room) - 12)),
        ...(opensUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 })
      });
    };

    place();
    // Capture phase so scrolling any parent container re-places the list
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const visible = onQueryChange || !query.trim() ? options : options.filter((option) => matches(option, query.trim().toLowerCase()));

  const handleChange = (event) => {
    setQuery(event.target.value);
    setOpen(true);
    if (onQueryChange) onQueryChange(event.target.value);
  };

  return (
    <div className="ss-wrapper">
      <input
        ref={inputRef}
        className="ss-input"
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setQuery('');
          setOpen(true);
          if (onQueryChange) onQueryChange('');
        }}
        onChange={handleChange}
        onBlur={() => setOpen(false)}
      />
      {open && !disabled && position && (
        <ul className="ss-list" style={position}>
          {visible.length === 0 ? (
            <li className="ss-empty">{emptyText}</li>
          ) : (
            visible.slice(0, 50).map((option) => (
              <li
                key={getKey(option)}
                className="ss-option"
                // mouse-down (not click) so the choice lands before the input loses focus and closes the list
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(option);
                  setOpen(false);
                }}
              >
                {renderOption(option)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchSelect;
