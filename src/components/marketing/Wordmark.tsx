/**
 * The CostMyAI wordmark. "My" always renders in brand purple — the one piece of
 * brand that appears identically on the marketing pages and inside the product,
 * so it lives in a single component rather than being retyped per page.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      Cost<span className="text-gradient-brand-wide">My</span>AI
    </span>
  );
}
