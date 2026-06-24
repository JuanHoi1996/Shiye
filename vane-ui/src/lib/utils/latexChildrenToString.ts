import React from 'react';

/**
 * markdown-to-jsx passes custom tag children as ReactNode (often string[]), not string.
 * KaTeX requires a string: katex.render(['\\frac{a}{b}'], ...) throws.
 */
export function latexChildrenToString(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  return React.Children.toArray(children)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
}
