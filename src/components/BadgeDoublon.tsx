// Suggestion de doublon (même catégorie, < 50 m, < 72 h) : jamais une décision, seulement un signal.
export function BadgeDoublon() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800 ring-1 ring-inset ring-violet-300"
      title="Même catégorie, à moins de 50 m, moins de 72 h d'écart : à vérifier"
    >
      Doublon possible
    </span>
  );
}
