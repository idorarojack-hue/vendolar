import { useEffect, useState } from 'react';

/** useState that is remembered in this browser (localStorage). Falls back silently if storage is unavailable. */
export const usePersistentState = <T>(key: string, initial: T) => {
    const [value, setValue] = useState<T>(() => {
        try {
            const saved = localStorage.getItem(key);
            return saved ? (JSON.parse(saved) as T) : initial;
        } catch {
            return initial;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Not remembering is fine.
        }
    }, [key, value]);

    return [value, setValue] as const;
};
