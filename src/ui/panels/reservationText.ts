/**
 * Paragraph separator for the Guide's own long-form copy.
 *
 * Lives in its own module because it is a literal newline pair, and inlining
 * one into JSX through a code-generation pass is how you end up with an
 * unterminated string literal and a very confusing diff.
 */
export const PARA_BREAK = '\n\n';
