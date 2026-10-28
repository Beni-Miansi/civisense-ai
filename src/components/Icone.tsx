// Pictogrammes d'interface (tracés au trait, viewBox 24).
const TRACES = {
  liste: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  carte: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14', 'M15 6v14'],
  tableau: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
  outils: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z'],
  connexion: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  sortie: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  cible: ['M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z'],
  photo: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z', 'M12 10a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
  retour: ['M15 18l-6-6 6-6'],
  cloche: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
} as const;

export type NomIcone = keyof typeof TRACES;

export function Icone({ nom, taille = 20, className = '' }: { nom: NomIcone; taille?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" width={taille} height={taille} fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
    >
      {TRACES[nom].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
